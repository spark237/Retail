import { IsString, IsOptional, IsUUID, IsArray, IsNumber, Min } from 'class-validator';

export class SyncRecordDto {
  @IsOptional()
  @IsString()
  id?: string;

  [key: string]: any;
}

export class SyncPushDto {
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsString()
  deviceId: string;

  @IsOptional()
  @IsString()
  clientVersion?: string;

  @IsOptional()
  @IsArray()
  shifts?: SyncRecordDto[];

  @IsOptional()
  @IsArray()
  sales?: SyncRecordDto[];

  @IsOptional()
  @IsArray()
  expenses?: SyncRecordDto[];

  @IsOptional()
  @IsArray()
  damageReports?: SyncRecordDto[];

  @IsOptional()
  @IsArray()
  inventoryMovements?: SyncRecordDto[];
}

export class SyncPullDto {
  @IsString()
  deviceId: string;

  @IsOptional()
  @IsString()
  lastSyncAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entityTypes?: string[];
}
