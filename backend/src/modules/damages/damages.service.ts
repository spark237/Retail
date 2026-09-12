import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateDamageReportDto, ReviewDamageReportDto, DamageQueryDto } from './dto/damages.dto';

@Injectable()
export class DamagesService {
  private readonly logger = new Logger(DamagesService.name);

  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateDamageReportDto, createdBy: string) {
    // Validate location
    if (!dto.branchId && !dto.warehouseId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Either branchId or warehouseId must be provided',
      });
    }

    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, tenantId, deletedAt: null },
      });
      if (!branch) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Branch not found' });
      }
    }

    if (dto.warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, tenantId, deletedAt: null },
      });
      if (!warehouse) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Warehouse not found' });
      }
    }

    // Verify product
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, tenantId, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found' });
    }

    const report = await this.prisma.damageReport.create({
      data: {
        tenantId,
        branchId: dto.branchId || null,
        warehouseId: dto.warehouseId || null,
        productId: dto.productId,
        quantity: dto.quantity,
        unit: dto.unit,
        damageType: dto.damageType,
        description: dto.description,
        photoUrls: dto.photoUrls || [],
        estimatedLoss: dto.estimatedLoss ?? null,
        status: 'pending_review',
        createdBy,
        updatedBy: createdBy,
      },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        createdByUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    this.logger.log(`Damage report created: ${dto.damageType} - ${dto.quantity} ${dto.unit} of ${product.name}`);
    return report;
  }

  async review(tenantId: string, id: string, dto: ReviewDamageReportDto, reviewerId: string) {
    const report = await this.prisma.damageReport.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!report) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Damage report not found' });
    }

    if (report.status !== 'pending_review') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Damage report is already ${report.status}`,
      });
    }

    if (!['approved', 'rejected'].includes(dto.status)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Status must be either "approved" or "rejected"',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.damageReport.update({
        where: { id },
        data: {
          status: dto.status,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNotes: dto.reviewNotes || null,
          updatedBy: reviewerId,
        },
        include: {
          product: { select: { id: true, sku: true, name: true } },
          createdByUser: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      // If approved, create inventory movement to write off damaged stock
      if (dto.status === 'approved') {
        const locationType = report.branchId ? 'branch' : 'warehouse';
        const locationId = report.branchId || report.warehouseId!;

        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: report.productId,
            locationType,
            locationId,
            movementType: 'damage_write_off',
            quantity: -report.quantity,
            unit: report.unit,
            referenceType: 'damage_report',
            referenceId: id,
            recordedBy: reviewerId,
            reason: `Damage write-off: ${report.damageType} - ${report.description}`,
          },
        });
      }

      return r;
    });

    this.logger.log(`Damage report ${dto.status}: ${id}`);
    return updated;
  }

  async findAll(tenantId: string, query?: DamageQueryDto) {
    const where: any = { tenantId, deletedAt: null };

    if (query?.branchId) where.branchId = query.branchId;
    if (query?.warehouseId) where.warehouseId = query.warehouseId;
    if (query?.status) where.status = query.status;
    if (query?.productId) where.productId = query.productId;

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [reports, total] = await Promise.all([
      this.prisma.damageReport.findMany({
        where,
        include: {
          product: { select: { id: true, sku: true, name: true, brand: true } },
          branch: { select: { id: true, name: true, code: true } },
          warehouse: { select: { id: true, name: true, code: true } },
          createdByUser: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.damageReport.count({ where }),
    ]);

    return { data: reports, total };
  }

  async findOne(tenantId: string, id: string) {
    const report = await this.prisma.damageReport.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        product: { select: { id: true, sku: true, name: true, brand: true } },
        branch: { select: { id: true, name: true, code: true } },
        warehouse: { select: { id: true, name: true, code: true } },
        createdByUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!report) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Damage report not found' });
    }

    return report;
  }

  async findByBranch(tenantId: string, branchId: string, query?: DamageQueryDto) {
    return this.findAll(tenantId, { ...query, branchId });
  }

  async findByWarehouse(tenantId: string, warehouseId: string, query?: DamageQueryDto) {
    return this.findAll(tenantId, { ...query, warehouseId });
  }
}