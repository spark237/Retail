import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branches.dto';

@Injectable()
export class BranchesService {
  private readonly logger = new Logger(BranchesService.name);

  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateBranchDto, createdBy: string) {
    const existing = await this.prisma.branch.findFirst({
      where: { tenantId, code: dto.code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A branch with this code already exists in this tenant',
      });
    }

    const branch = await this.prisma.branch.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        address: dto.address || null,
        city: dto.city || null,
        region: dto.region || null,
        phone: dto.phone || null,
        email: dto.email || null,
        taxId: dto.taxId || null,
        posTimeoutMinutes: dto.posTimeoutMinutes || 480,
        requiresSupervisorOverride: dto.requiresSupervisorOverride ?? true,
      },
    });

    this.logger.log(`Branch created: ${branch.name} (${branch.code}) for tenant ${tenantId}`);
    return branch;
  }

  async findAll(tenantId: string, includeInactive = false) {
    return this.prisma.branch.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        _count: {
          select: { userBranches: true, shifts: true, sales: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        warehouses: { where: { deletedAt: null, isActive: true } },
        _count: {
          select: { userBranches: true, shifts: true, sales: true },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Branch not found',
      });
    }

    return branch;
  }

  async update(tenantId: string, id: string, dto: UpdateBranchDto, updatedBy: string) {
    await this.findOne(tenantId, id);

    const branch = await this.prisma.branch.update({
      where: { id },
      data: {
        ...dto,
      },
    });

    this.logger.log(`Branch updated: ${branch.name}`);
    return branch;
  }

  async remove(tenantId: string, id: string, deletedBy: string) {
    await this.findOne(tenantId, id);

    await this.prisma.branch.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    this.logger.log(`Branch soft-deleted: ${id}`);
    return { message: 'Branch deleted successfully' };
  }
}