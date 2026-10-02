import { Controller, Get, Post, Put, Delete, Body, Param, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenants.dto';

@Controller('tenants')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class TenantsController {
  private readonly logger = new Logger(TenantsController.name);

  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @RequirePermissions('tenants.create')
  async create(
    @Body() dto: CreateTenantDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tenantsService.create(dto, userId);
  }

  @Get()
  @RequirePermissions('tenants.read')
  async findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  @RequirePermissions('tenants.read')
  async findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Public()
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    return this.tenantsService.findBySlug(slug);
  }

  @Put(':id')
  @RequirePermissions('tenants.update')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tenantsService.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions('tenants.delete')
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tenantsService.remove(id, userId);
  }
}