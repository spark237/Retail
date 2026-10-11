import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SalesService } from './sales.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CreateSaleDto, VoidSaleDto } from './dto/sales.dto';

/**
 * Wire-level DTOs: the SPA (frontend/src/api/services.ts createSale) posts a
 * flat cart payload ({items:[{productId,name,quantity,unit,unitPrice,total}],
 * subtotal, discount, total, paymentMethod, cashReceived?, changeAmount?,
 * momoPhone?, bankReference?, branchId, shiftId}). The service's CreateSaleDto
 * is a richer canonical contract (payments[], discountAmount, no total fields),
 * so the controller maps the SPA payload onto it. This keeps both the frontend
 * and the service untouched while satisfying both contracts.
 */
export class SaleItemRequestDto {
  @IsUUID('4')
  productId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsString()
  unit: string;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total?: number;
}

export class CreateSaleRequestDto {
  @IsUUID('4')
  branchId: string;

  // The SPA passes null when no shift is open; the service requires an open
  // shift, so the controller rejects a missing/blank value with a 400.
  @IsOptional()
  @IsString()
  shiftId?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemRequestDto)
  items: SaleItemRequestDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total?: number;

  @IsString()
  paymentMethod: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cashReceived?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  changeAmount?: number;

  @IsOptional()
  @IsString()
  momoPhone?: string;

  @IsOptional()
  @IsString()
  bankReference?: string;
}

@UseGuards(AuthGuard('jwt'))
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateSaleRequestDto,
    @CurrentUser('id') createdBy: string,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    if (!dto.shiftId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'A sale requires an open shift (shiftId is required)',
      });
    }
    const serviceDto: CreateSaleDto = {
      idempotencyKey: idempotencyKey || undefined,
      branchId: dto.branchId,
      shiftId: dto.shiftId,
      items: dto.items.map((i) => ({
        productId: i.productId,
        unit: i.unit,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      discountAmount: dto.discount,
      payments: [
        {
          paymentType: String(dto.paymentMethod).toUpperCase(),
          amount: dto.total ?? dto.subtotal ?? 0,
          momoPhone: dto.momoPhone,
          reference: dto.bankReference,
          changeAmount: dto.changeAmount,
        },
      ],
    };
    return this.salesService.create(tenantId, serviceDto, createdBy);
  }

  @Get()
  async findAll(
    @TenantId() tenantId: string,
    @Query() query: Record<string, unknown>,
  ) {
    // Untyped query binding: the SPA sends page/limit/startDate/endDate/
    // branchId/paymentMethod; the service filters on the fields it knows and
    // ignores the rest, so no whitelist rejection occurs.
    const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20));
    const result = await this.salesService.findAll(tenantId, query as never);
    const data = (result.data ?? []).slice((page - 1) * limit, page * limit);
    return { data, total: result.total, page, limit };
  }

  @Get(':id')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.salesService.findOne(tenantId, id);
  }

  @Post(':id/void')
  async voidSale(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: VoidSaleDto,
    @CurrentUser('id') voidedBy: string,
  ) {
    return this.salesService.voidSale(tenantId, id, dto, voidedBy);
  }

  @Post(':id/payments/:paymentId/confirm')
  async confirmPayment(
    @TenantId() tenantId: string,
    @Param('id') saleId: string,
    @Param('paymentId') paymentId: string,
    @CurrentUser('id') confirmedBy: string,
  ) {
    return this.salesService.confirmPayment(tenantId, saleId, paymentId, confirmedBy);
  }
}