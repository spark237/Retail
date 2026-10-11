import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { InventoryService } from './inventory.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';

/**
 * Warehouse ↔ branch transfer endpoints. POST /transfers accepts the exact
 * payload frontend/src/api/services.ts createTransfer() sends
 * (sourceLocationId, sourceType, destinationLocationId, destinationType,
 * items: [{productId, quantity}], notes?) and maps it onto the service's
 * CreateTransferDto (fromLocationType/fromLocationId/toLocationType/
 * toLocationId + items with a stock unit).
 * The unit is not sent by the SPA, so it defaults to the tenant's stock unit
 * convention ('BOX'); callers may override it per item.
 */
export class TransferItemRequestDto {
  @IsUUID('4')
  productId: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @Min(0.01)
  quantity: number;
}

export class CreateTransferRequestDto {
  @IsString()
  sourceLocationId: string;

  @IsIn(['branch', 'warehouse'])
  sourceType: string;

  @IsString()
  destinationLocationId: string;

  @IsIn(['branch', 'warehouse'])
  destinationType: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferItemRequestDto)
  items: TransferItemRequestDto[];
}

@UseGuards(AuthGuard('jwt'))
@Controller('transfers')
export class TransfersController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateTransferRequestDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventoryService.createTransfer(
      tenantId,
      {
        fromLocationType: dto.sourceType === 'warehouse' ? 'warehouse' : 'branch',
        fromLocationId: dto.sourceLocationId,
        toLocationType: dto.destinationType === 'warehouse' ? 'warehouse' : 'branch',
        toLocationId: dto.destinationLocationId,
        notes: dto.notes,
        items: dto.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unit: i.unit ?? 'BOX',
        })),
      },
      userId,
    );
  }

  @Get()
  async findAll(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const limit = Math.min(200, Math.max(1, parseInt(limitRaw ?? '50', 10) || 50));
    const offset = Math.max(0, parseInt(offsetRaw ?? '0', 10) || 0);
    return this.inventoryService.findAllTransfers(tenantId, status, limit, offset);
  }

  @Get(':id')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.inventoryService.findOneTransfer(tenantId, id);
  }
}