import { IsString, MinLength, MaxLength, IsOptional, IsBoolean, IsUUID, IsInt, Min } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxId?: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  posTimeoutMinutes?: number;

  @IsOptional()
  @IsBoolean()
  requiresSupervisorOverride?: boolean;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(60)
  posTimeoutMinutes?: number;

  @IsOptional()
  @IsBoolean()
  requiresSupervisorOverride?: boolean;
}

export class AssignUserToBranchDto {
  @IsUUID('4')
  userId: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}