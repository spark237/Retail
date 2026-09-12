import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { CreateUserDto, UpdateUserDto, AssignRolesDto, AssignBranchesDto, UserQueryDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateUserDto, createdBy: string) {
    // Check if email already exists
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A user with this email already exists',
      });
    }

    // Generate password if not provided
    const password = dto.password || this.generateTemporaryPassword();
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        phone: dto.phone || null,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        requiresPasswordChange: !dto.password,
        createdBy,
        updatedBy: createdBy,
        userRoles: dto.roleIds?.length
          ? {
              create: dto.roleIds.map((roleId) => ({
                roleId,
                tenantId,
                assignedBy: createdBy,
              })),
            }
          : undefined,
        userBranches: dto.branchIds?.length
          ? {
              create: dto.branchIds.map((branchId) => ({
                branchId,
                tenantId,
                isPrimary: false,
              })),
            }
          : undefined,
      },
      include: {
        userRoles: { include: { role: true } },
        userBranches: { include: { branch: true } },
      },
    });

    this.logger.log(`User created: ${user.email} (tenant: ${tenantId})`);

    return {
      ...user,
      temporaryPassword: !dto.password ? password : undefined,
      passwordHash: undefined,
    };
  }

  async findAll(tenantId: string, query?: UserQueryDto) {
    const where: any = { tenantId, deletedAt: null };

    if (query?.isActive !== undefined) where.isActive = query.isActive;
    if (query?.roleId) {
      where.userRoles = { some: { roleId: query.roleId } };
    }
    if (query?.branchId) {
      where.userBranches = { some: { branchId: query.branchId } };
    }
    if (query?.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        userRoles: { include: { role: true } },
        userBranches: { include: { branch: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      ...u,
      passwordHash: undefined,
    }));
  }

  async findOne(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        userRoles: { include: { role: true } },
        userBranches: { include: { branch: true } },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return {
      ...user,
      passwordHash: undefined,
    };
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto, updatedBy: string) {
    await this.findOne(tenantId, id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...dto,
        updatedBy,
      },
      include: {
        userRoles: { include: { role: true } },
        userBranches: { include: { branch: true } },
      },
    });

    this.logger.log(`User updated: ${user.email}`);

    return {
      ...user,
      passwordHash: undefined,
    };
  }

  async remove(tenantId: string, id: string, deletedBy: string) {
    await this.findOne(tenantId, id);

    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        updatedBy: deletedBy,
      },
    });

    this.logger.log(`User soft-deleted: ${id}`);
    return { message: 'User deleted successfully' };
  }

  async assignRoles(tenantId: string, userId: string, dto: AssignRolesDto, assignedBy: string) {
    await this.findOne(tenantId, userId);

    // Remove existing roles
    await this.prisma.userRole.deleteMany({
      where: { userId, tenantId },
    });

    // Assign new roles
    if (dto.roleIds.length > 0) {
      await this.prisma.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({
          userId,
          roleId,
          tenantId,
          assignedBy,
        })),
      });
    }

    this.logger.log(`Roles assigned to user ${userId}: ${dto.roleIds.join(', ')}`);
    return this.findOne(tenantId, userId);
  }

  async assignBranches(tenantId: string, userId: string, dto: AssignBranchesDto, assignedBy: string) {
    await this.findOne(tenantId, userId);

    // Remove existing branches
    await this.prisma.userBranch.deleteMany({
      where: { userId, tenantId },
    });

    // Assign new branches
    if (dto.branchIds.length > 0) {
      await this.prisma.userBranch.createMany({
        data: dto.branchIds.map((branchId) => ({
          userId,
          branchId,
          tenantId,
          isPrimary: dto.primaryBranchId === branchId,
        })),
      });
    }

    this.logger.log(`Branches assigned to user ${userId}: ${dto.branchIds.join(', ')}`);
    return this.findOne(tenantId, userId);
  }

  private generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}