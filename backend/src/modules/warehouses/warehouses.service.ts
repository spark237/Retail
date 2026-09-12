import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouses.dto';

@Injectable()
export class WarehousesService {
  private readonly logger = new Logger(WarehousesService.name);

  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateWarehouseDto, createdBy: string) {
    const existing = await this.prisma.warehouse.findFirst({
      where: { tenantId, code: dto.code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A warehouse with this code already exists in this tenant',
      });
    }

    // Verify branch exists if provided
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, tenantId, deletedAt: null },
      });
      if (!branch) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Branch not found',
        });
      }
    }

    const warehouse = await this.prisma.warehouse.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        address: dto.address || null,
        city: dto.city || null,
        region: dto.region || null,
        phone: dto.phone || null,
        branchId: dto.branchId || null,
      },
    });

    this.logger.log(`Warehouse created: ${warehouse.name} (${warehouse.code}) for tenant ${tenantId}`);
    return warehouse;
  }

  async findAll(tenantId: string, includeInactive = false) {
    return this.prisma.warehouse.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });

    if (!warehouse) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Warehouse not found',
      });
    }

    return warehouse;
  }

  async update(tenantId: string, id: string, dto: UpdateWarehouseDto, updatedBy: string) {
    await this.findOne(tenantId, id);

    const warehouse = await this.prisma.warehouse.update({
      where: { id },
      data: { ...dto },
    });

    this.logger.log(`Warehouse updated: ${warehouse.name}`);
    return warehouse;
  }

  async remove(tenantId: string, id: string, deletedBy: string) {
    await this.findOne(tenantId, id);

    await this.prisma.warehouse.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    this.logger.log(`Warehouse soft-deleted: ${id}`);
    return { message: 'Warehouse deleted successfully' };
  }
}