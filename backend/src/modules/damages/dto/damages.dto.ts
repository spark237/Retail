import { IsString, IsOptional, IsNumber, IsUUID, IsArray, Min, MinLength } from 'class-validator';

export class CreateDamageReportDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @IsUUID('4')
  productId: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsString()
  unit: string;

  @IsString()
  damageType: string;

  @IsString()
  @MinLength(5)
  description: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedLoss?: number;
}

export class ReviewDamageReportDto {
  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  reviewNotes?: string;
}

export class DamageQueryDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
