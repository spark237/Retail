import { IsString, IsOptional, IsNumber, IsUUID, IsArray, ValidateNested, Min, Max, IsBoolean, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class SaleItemDto {
  @IsUUID('4')
  productId: string;

  @IsString()
  unit: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lineDiscount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatRate?: number;
}

export class SalePaymentDto {
  @IsString()
  paymentType: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  momoPhone?: string;

  @IsOptional()
  @IsString()
  momoProvider?: string;

  @IsOptional()
  @IsString()
  momoTransactionId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  changeAmount?: number;
}

export class CreateSaleDto {
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsUUID('4')
  branchId: string;

  @IsUUID('4')
  shiftId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  discountReason?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments: SalePaymentDto[];
}

export class VoidSaleDto {
  @IsString()
  @MinLength(5)
  reason: string;

  @IsUUID('4')
  supervisorId: string;
}

export class SaleQueryDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsUUID('4')
  shiftId?: string;

  @IsOptional()
  @IsString()
  saleStatus?: string;

  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @IsOptional()
  @IsBoolean()
  includeVoided?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
