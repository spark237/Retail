import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateExpenseDto, ApproveExpenseDto, ExpenseQueryDto } from './dto/expenses.dto';

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateExpenseDto, createdBy: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId, deletedAt: null, isActive: true },
    });
    if (!branch) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Branch not found or inactive' });
    }

    if (dto.shiftId) {
      const shift = await this.prisma.shift.findFirst({
        where: { id: dto.shiftId, tenantId, branchId: dto.branchId },
      });
      if (!shift) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Shift not found' });
      }
    }

    const expense = await this.prisma.$transaction(async (tx) => {
      const e = await tx.expense.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          shiftId: dto.shiftId || null,
          expenseCategory: dto.expenseCategory,
          amount: dto.amount,
          description: dto.description,
          receiptImageUrl: dto.receiptImageUrl || null,
          createdBy,
          updatedBy: createdBy,
        },
        include: {
          branch: { select: { id: true, name: true, code: true } },
          createdByUser: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      // Update shift totals if shift is provided and open
      if (dto.shiftId) {
        await tx.shift.update({
          where: { id: dto.shiftId },
          data: { totalExpenses: { increment: dto.amount } },
        });
      }

      return e;
    });

    this.logger.log(`Expense created: ${dto.expenseCategory} - ${dto.amount} (branch: ${dto.branchId})`);
    return expense;
  }

  async approve(tenantId: string, id: string, dto: ApproveExpenseDto) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!expense) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Expense not found' });
    }

    if (expense.approvedBy) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Expense already approved' });
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        approvedBy: dto.approvedBy,
        approvedAt: new Date(),
        updatedBy: dto.approvedBy,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        createdByUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    this.logger.log(`Expense approved: ${id}`);
    return updated;
  }

  async findAll(tenantId: string, query?: ExpenseQueryDto) {
    const where: any = { tenantId, deletedAt: null };

    if (query?.branchId) where.branchId = query.branchId;
    if (query?.shiftId) where.shiftId = query.shiftId;
    if (query?.expenseCategory) where.expenseCategory = query.expenseCategory;

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          shift: { select: { id: true, status: true } },
          createdByUser: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return { data: expenses, total };
  }

  async findOne(tenantId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        shift: { select: { id: true, status: true } },
        createdByUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!expense) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Expense not found' });
    }

    return expense;
  }
}