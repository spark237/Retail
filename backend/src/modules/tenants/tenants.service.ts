import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenants.dto';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTenantDto, createdBy: string) {
    // Check slug uniqueness
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A tenant with this slug already exists',
      });
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        domain: dto.domain || null,
        config: (dto.config || {}) as any,
        subscriptionTier: dto.subscriptionTier || 'standard',
        createdBy,
        updatedBy: createdBy,
      },
    });

    this.logger.log(`Tenant created: ${tenant.name} (${tenant.slug})`);
    return tenant;
  }

  async findAll() {
    return this.prisma.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
    });

    if (!tenant) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Tenant not found',
      });
    }

    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });

    if (!tenant) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Tenant not found',
      });
    }

    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto, updatedBy: string) {
    await this.findOne(id);

    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...dto,
        config: dto.config as any,
        updatedBy,
      },
    });

    this.logger.log(`Tenant updated: ${tenant.name}`);
    return tenant;
  }

  async remove(id: string, deletedBy: string) {
    await this.findOne(id);

    await this.prisma.tenant.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        updatedBy: deletedBy,
      },
    });

    this.logger.log(`Tenant soft-deleted: ${id}`);
    return { message: 'Tenant deleted successfully' };
  }
}