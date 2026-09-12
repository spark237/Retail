import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OpenShiftDto, CloseShiftDto, ShiftQueryDto } from './dto/shifts.dto';

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);

  constructor(private prisma: PrismaService) {}

  async open(tenantId: string, dto: OpenShiftDto, cashierId: string) {
    // Verify branch exists
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId, deletedAt: null, isActive: true },
    });
    if (!branch) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Branch not found or inactive' });
    }

    // Check if cashier already has an open shift
    const openShift = await this.prisma.shift.findFirst({
      where: { tenantId, cashierId, status: 'open' },
    });
    if (openShift) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Cashier already has an open shift. Close it before opening a new one.',
      });
    }

    // Check if there's already an open shift at this branch
    const branchOpenShift = await this.prisma.shift.findFirst({
      where: { tenantId, branchId: dto.branchId, status: 'open' },
    });
    if (branchOpenShift) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'There is already an open shift at this branch',
      });
    }

    const shift = await this.prisma.shift.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        cashierId,
        openingBalance: dto.openingBalance || 0,
        status: 'open',
        notes: dto.notes || null,
        createdBy: cashierId,
        updatedBy: cashierId,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        cashier: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    this.logger.log(`Shift opened: ${shift.id} (branch: ${dto.branchId}, cashier: ${cashierId})`);
    return shift;
  }

  async close(tenantId: string, id: string, dto: CloseShiftDto, userId: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, tenantId, status: 'open' },
      include: {
        sales: {
          where: { deletedAt: null, saleStatus: { not: 'voided' } },
          include: { payments: true },
        },
        expenses: { where: { deletedAt: null } },
      },
    });

    if (!shift) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Open shift not found' });
    }

    // Calculate expected balance
    const totalCash = dto.expectedBalance ?? shift.totalCash;
    const expectedBalance = Number(shift.openingBalance) + Number(totalCash) - Number(shift.totalExpenses);
    const discrepancy = dto.closingBalance - expectedBalance;

    const updated = await this.prisma.shift.update({
      where: { id },
      data: {
        status: 'closed',
        closedAt: new Date(),
        closingBalance: dto.closingBalance,
        expectedBalance,
        discrepancy,
        discrepancyReason: dto.discrepancyReason || null,
        notes: dto.notes || null,
        updatedBy: userId,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        cashier: { select: { id: true, firstName: true, lastName: true } },
        supervisor: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    this.logger.log(`Shift closed: ${id} (discrepancy: ${discrepancy})`);

    // If there's a discrepancy, create a fraud alert
    if (Math.abs(discrepancy) > 0) {
      try {
        await this.prisma.fraudAlert.create({
          data: {
            tenantId,
            branchId: shift.branchId,
            alertType: 'cash_shortage',
            severity: Math.abs(discrepancy) > 10000 ? 'high' : 'medium',
            score: Math.min(Math.abs(Number(discrepancy)) / 1000, 100),
            title: `Cash discrepancy detected at shift close`,
            description: `Shift ${id} closed with discrepancy of ${discrepancy}. Expected: ${expectedBalance}, Declared: ${dto.closingBalance}`,
            details: {
              shiftId: id,
              expectedBalance,
              declaredBalance: dto.closingBalance,
              discrepancy,
              openingBalance: shift.openingBalance,
              totalCash,
              totalExpenses: shift.totalExpenses,
            },
          },
        });
      } catch (e) {
        this.logger.warn(`Failed to create fraud alert for shift ${id}: ${e.message}`);
      }
    }

    return updated;
  }

  async findOne(tenantId: string, id: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        cashier: { select: { id: true, firstName: true, lastName: true } },
        supervisor: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { sales: true, expenses: true } },
      },
    });

    if (!shift) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Shift not found' });
    }

    return shift;
  }

  async findAll(tenantId: string, query?: ShiftQueryDto) {
    const where: any = { tenantId, deletedAt: null };

    if (query?.branchId) where.branchId = query.branchId;
    if (query?.cashierId) where.cashierId = query.cashierId;
    if (query?.status) where.status = query.status;

    if (query?.startDate || query?.endDate) {
      where.openedAt = {};
      if (query.startDate) where.openedAt.gte = new Date(query.startDate);
      if (query.endDate) where.openedAt.lte = new Date(query.endDate);
    }

    const [shifts, total] = await Promise.all([
      this.prisma.shift.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          cashier: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { sales: true, expenses: true } },
        },
        orderBy: { openedAt: 'desc' },
        take: 100,
      }),
      this.prisma.shift.count({ where }),
    ]);

    return { data: shifts, total };
  }

  async findByBranch(tenantId: string, branchId: string, query?: ShiftQueryDto) {
    return this.findAll(tenantId, { ...query, branchId });
  }

  async findByUser(tenantId: string, userId: string, query?: ShiftQueryDto) {
    return this.findAll(tenantId, { ...query, cashierId: userId });
  }

  async getCurrentShift(tenantId: string, branchId: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { tenantId, branchId, status: 'open' },
      include: {
        cashier: { select: { id: true, firstName: true, lastName: true } },
        branch: { select: { id: true, name: true, code: true } },
        _count: { select: { sales: true, expenses: true } },
      },
    });

    if (!shift) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'No open shift found for this branch' });
    }

    return shift;
  }
}