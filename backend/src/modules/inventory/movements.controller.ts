import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InventoryService } from './inventory.service';
import { TenantId } from '../../common/decorators/tenant.decorator';

/**
 * Immutable movement ledger endpoint consumed by the Movements page
 * (frontend/src/api/services.ts getMovements): GET /movements?page=&limit=
 * &startDate=&endDate=&productSearch= → {data: Movement[], total, page, limit}.
 * The controller maps query params onto the service signature and reshapes
 * rows to the Movement shape the UI renders ({id,date,productName,productSku,
 * type,quantity,locationName,userName}).
 */
@UseGuards(AuthGuard('jwt'))
@Controller('movements')
export class MovementsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async findMovements(
    @TenantId() tenantId: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('productSearch') productSearch?: string,
  ) {
    const page = Math.max(1, parseInt(pageRaw ?? '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(limitRaw ?? '50', 10) || 50));
    const offset = (page - 1) * limit;
    // productSearch is a free-text field in the UI; the service filters by
    // exact productId. Pass it through only when it looks like a UUID, since
    // the ledger itself is keyed by product id.
    const productId =
      productSearch && /^[0-9a-fA-F-]{36}$/.test(productSearch) ? productSearch : undefined;
    const result = await this.inventoryService.getMovements(
      tenantId,
      productId,
      undefined,
      undefined,
      limit,
      offset,
    );
    const data = (result.data as unknown[]).map((m: any) => ({
      id: m.id,
      date: m.recordedAt,
      productName: m.product?.name ?? 'Unknown',
      productSku: m.product?.sku ?? '',
      type: m.movementType,
      quantity: m.quantity,
      locationName: m.locationId,
      userName: m.recordedByUser
        ? `${m.recordedByUser.firstName ?? ''} ${m.recordedByUser.lastName ?? ''}`.trim()
        : null,
    }));
    return { data, total: result.total, page, limit };
  }
}