import { Controller, Get, Post, Put, Delete, Body, Param, Query, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CreateBranchDto, UpdateBranchDto } from './dto/branches.dto';

@Controller('branches')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class BranchesController {
  private readonly logger = new Logger(BranchesController.name);

  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @RequirePermissions('branches.create')
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateBranchDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.branchesService.create(tenantId, dto, userId);
  }

  @Get()
  @RequirePermissions('branches.read')
  async findAll(
    @TenantId() tenantId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.branchesService.findAll(tenantId, includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermissions('branches.read')
  async findOne(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.branchesService.findOne(tenantId, id);
  }

  @Put(':id')
  @RequirePermissions('branches.update')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.branchesService.update(tenantId, id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions('branches.delete')
  async remove(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.branchesService.remove(tenantId, id, userId);
  }
}