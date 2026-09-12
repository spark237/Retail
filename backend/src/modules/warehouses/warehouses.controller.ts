import { Controller, Get, Post, Put, Delete, Body, Param, Query, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouses.dto';

@Controller('warehouses')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class WarehousesController {
  private readonly logger = new Logger(WarehousesController.name);

  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @RequirePermissions('warehouses.create')
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateWarehouseDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.warehousesService.create(tenantId, dto, userId);
  }

  @Get()
  @RequirePermissions('warehouses.read')
  async findAll(
    @TenantId() tenantId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.warehousesService.findAll(tenantId, includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermissions('warehouses.read')
  async findOne(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.warehousesService.findOne(tenantId, id);
  }

  @Put(':id')
  @RequirePermissions('warehouses.update')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.warehousesService.update(tenantId, id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions('warehouses.delete')
  async remove(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.warehousesService.remove(tenantId, id, userId);
  }
}