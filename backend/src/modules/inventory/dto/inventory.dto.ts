import { IsString, IsOptional, IsNumber, IsUUID, IsArray, ValidateNested, Min, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class TransferItemDto {
  @IsUUID('4')
  productId: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsString()
  unit: string;
}

export class CreateInventoryMovementDto {
  @IsUUID('4')
  productId: string;

  @IsString()
  locationType: string;

  @IsString()
  locationId: string;

  @IsString()
  movementType: string;

  @IsNumber()
  quantity: number;

  @IsString()
  unit: string;

  @IsOptional()
  @IsNumber()
  unitQuantity?: number;

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class CreateTransferDto {
  @IsString()
  fromLocationType: string;

  @IsString()
  fromLocationId: string;

  @IsString()
  toLocationType: string;

  @IsString()
  toLocationId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items: TransferItemDto[];
}

export class StockAdjustmentDto {
  @IsUUID('4')
  productId: string;

  @IsNumber()
  quantity: number;

  @IsString()
  unit: string;

  @IsString()
  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  batchNumber?: string;
}

export class UpdateTransferStatusDto {
  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
