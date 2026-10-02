import { IsString, IsOptional, IsUUID, IsBoolean, IsArray } from 'class-validator';

export class SalesReportQueryDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class InventoryReportQueryDto {
  @IsOptional()
  @IsString()
  locationType?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsUUID('4')
  productId?: string;
}

export class CashReconciliationQueryDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class DashboardQueryDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;
}
