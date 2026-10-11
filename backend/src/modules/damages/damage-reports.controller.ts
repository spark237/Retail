import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { DamagesService } from './damages.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CreateDamageReportDto, DamageQueryDto, ReviewDamageReportDto } from './dto/damages.dto';

/**
 * Wire-level DTO matching the SPA createDamageReport() payload
 * ({productId, quantity, locationId, locationType, reason, notes?}) — the
 * service's CreateDamageReportDto is keyed by branchId/warehouseId + unit +
 * damageType/description, so the controller maps the two sides. Reason codes
 * from the UI (BROKEN/DEFECTIVE/WATER_DAMAGE/...) become the damageType and,
 * with the notes, the description.
 */
export class CreateDamageReportRequestDto {
  @IsUUID('4')
  productId: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsString()
  locationId: string;

  @IsIn(['branch', 'warehouse'])
  locationType: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@UseGuards(AuthGuard('jwt'))
@Controller('damage-reports')
export class DamageReportsController {
  constructor(private readonly damagesService: DamagesService) {}

  @Post()
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateDamageReportRequestDto,
    @CurrentUser('id') createdBy: string,
  ) {
    const serviceDto: CreateDamageReportDto = {
      ...(dto.locationType === 'branch'
        ? { branchId: dto.locationId }
        : { warehouseId: dto.locationId }),
      productId: dto.productId,
      quantity: dto.quantity,
      unit: 'BOX',
      damageType: dto.reason,
      description: dto.notes && dto.notes.length >= 5 ? dto.notes : dto.reason,
    };
    return this.damagesService.create(tenantId, serviceDto, createdBy);
  }

  @Get()
  async findAll(
    @TenantId() tenantId: string,
    @Query() query?: DamageQueryDto,
  ) {
    return this.damagesService.findAll(tenantId, query);
  }

  @Get(':id')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.damagesService.findOne(tenantId, id);
  }

  @Post(':id/review')
  async review(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ReviewDamageReportDto,
    @CurrentUser('id') reviewerId: string,
  ) {
    return this.damagesService.review(tenantId, id, dto, reviewerId);
  }
}