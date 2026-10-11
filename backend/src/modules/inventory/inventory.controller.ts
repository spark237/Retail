import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InventoryService } from './inventory.service';
import { TenantId } from '../../common/decorators/tenant.decorator';

/**
 * Stock-per-location endpoints consumed by the RetailGuard SPA.
 * GET /inventory returns one row per product with branch/warehouse/total
 * stock, which is the shape frontend/src/api/services.ts getInventory()
 * expects ({productId, productName, sku, unit, branchStock, warehouseStock,
 * totalStock}). The underlying service returns raw per-location aggregates,
 * so the controller performs the grouping.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async getSummary(@TenantId() tenantId: string) {
    const rows = await this.inventoryService.getStockSummary(tenantId);
    const byProduct = new Map<
      string,
      {
        productId: string;
        productName: string;
        sku: string;
        unit: string;
        branchStock: number;
        warehouseStock: number;
        totalStock: number;
      }
    >();
    for (const row of rows) {
      const id = row.productId;
      let entry = byProduct.get(id);
      if (!entry) {
        const product = (row.product as { id?: string; name?: string; sku?: string } | null) || null;
        entry = {
          productId: id,
          productName: product?.name ?? 'Unknown',
          sku: product?.sku ?? '',
          unit: row.unit,
          branchStock: 0,
          warehouseStock: 0,
          totalStock: 0,
        };
        byProduct.set(id, entry);
      }
      const qty = Number(row.quantity ?? 0);
      if (row.locationType === 'branch') {
        entry.branchStock += qty;
      } else {
        entry.warehouseStock += qty;
      }
      entry.totalStock = entry.branchStock + entry.warehouseStock;
      entry.unit = row.unit || entry.unit;
    }
    return Array.from(byProduct.values());
  }

  @Get('stock')
  async getStockByLocation(
    @TenantId() tenantId: string,
    @Query('locationType') locationType?: string,
    @Query('locationId') locationId?: string,
  ) {
    if (!locationType || !locationId) {
      return [];
    }
    return this.inventoryService.getStockByLocation(tenantId, locationType, locationId);
  }

  @Get('product/:productId')
  async getStockByProduct(
    @TenantId() tenantId: string,
    @Param('productId') productId: string,
  ) {
    return this.inventoryService.getStockByProduct(tenantId, productId);
  }
}