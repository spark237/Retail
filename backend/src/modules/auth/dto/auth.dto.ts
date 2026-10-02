import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsUUID } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  password: string;

  @IsOptional()
  @IsUUID('4', { message: 'Invalid device ID format' })
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Device name must not exceed 255 characters' })
  deviceName?: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;

  @IsOptional()
  @IsUUID('4', { message: 'Invalid device ID format' })
  deviceId?: string;
}

export class LogoutDto {
  @IsString()
  refreshToken: string;

  @IsOptional()
  @IsUUID('4', { message: 'Invalid device ID format' })
  deviceId?: string;
}

export class DeviceTrustDto {
  @IsUUID('4', { message: 'Invalid device ID format' })
  deviceId: string;

  @IsString()
  @MaxLength(255, { message: 'Device name must not exceed 255 characters' })
  deviceName: string;

  @IsString()
  publicKey: string;

  @IsOptional()
  deviceInfo?: Record<string, any>;
}

export class DeviceVerifyDto {
  @IsUUID('4', { message: 'Invalid device ID format' })
  deviceId: string;

  @IsUUID('4', { message: 'Invalid user ID format' })
  userId: string;

  @IsString()
  signature: string;
}

export class OfflineLoginDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsUUID('4', { message: 'Invalid device ID format' })
  deviceId: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8, { message: 'Current password must be at least 8 characters' })
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  @MaxLength(128, { message: 'New password must not exceed 128 characters' })
  newPassword: string;
}