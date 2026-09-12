import { IsString, MinLength, MaxLength, IsOptional, IsBoolean, IsObject } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  subscriptionTier?: string;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  subscriptionTier?: string;
}