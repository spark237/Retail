import { IsString, IsOptional, IsNumber, IsUUID, Min } from 'class-validator';

export class OpenShiftDto {
  @IsUUID('4')
  branchId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  openingBalance?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CloseShiftDto {
  @IsNumber()
  @Min(0)
  closingBalance: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedBalance?: number;

  @IsOptional()
  @IsString()
  discrepancyReason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ShiftQueryDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsUUID('4')
  cashierId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
