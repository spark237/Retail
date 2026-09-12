import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import {
  CreateUserDto,
  UpdateUserDto,
  AssignRolesDto,
  AssignBranchesDto,
  UserQueryDto,
} from './dto/users.dto';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions('users.create')
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateUserDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.usersService.create(tenantId, dto, userId);
  }

  @Get()
  @RequirePermissions('users.read')
  async findAll(
    @TenantId() tenantId: string,
    @Query() query: UserQueryDto,
  ) {
    return this.usersService.findAll(tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('users.read')
  async findOne(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.usersService.findOne(tenantId, id);
  }

  @Put(':id')
  @RequirePermissions('users.update')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.usersService.update(tenantId, id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions('users.delete')
  async remove(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.usersService.remove(tenantId, id, userId);
  }

  @Post(':id/roles')
  @RequirePermissions('users.assign_roles')
  async assignRoles(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AssignRolesDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.usersService.assignRoles(tenantId, id, dto, userId);
  }

  @Post(':id/branches')
  @RequirePermissions('users.assign_branches')
  async assignBranches(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AssignBranchesDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.usersService.assignBranches(tenantId, id, dto, userId);
  }
}