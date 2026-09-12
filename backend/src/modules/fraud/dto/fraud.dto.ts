import { IsString, IsOptional, IsUUID, IsNumber, IsBoolean, Min } from 'class-validator';

export class ResolveAlertDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  resolutionNotes?: string;
}

export class FraudQueryDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsString()
  alertType?: string;

  @IsOptional()
  @IsString()
  severity?: string;

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

export class RunDetectionDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;
}
