import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateInventoryMovementDto, CreateTransferDto, StockAdjustmentDto, UpdateTransferStatusDto } from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Stock Queries (COMPUTED from movements) ──────────────────────────

  async getStockByLocation(tenantId: string, locationType: string, locationId: string) {
    // Verify location exists
    if (locationType === 'warehouse') {
      const wh = await this.prisma.warehouse.findFirst({
        where: { id: locationId, tenantId, deletedAt: null },
      });
      if (!wh) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Warehouse not found' });
    } else if (locationType === 'branch') {
      const br = await this.prisma.branch.findFirst({
        where: { id: locationId, tenantId, deletedAt: null },
      });
      if (!br) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Branch not found' });
    }

    // Compute stock from movements
    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['productId', 'unit'],
      where: {
        tenantId,
        locationType,
        locationId,
      },
      _sum: {
        quantity: true,
      },
    });

    // Get product details for each stock item
    const productIds = [...new Set(movements.map((m: { productId: string }) => m.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, tenantId, deletedAt: null },
      select: { id: true, sku: true, name: true, brand: true, stockUnit: true, reorderLevel: true, imageUrl: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    return movements
      .filter((m) => m._sum.quantity !== null && Number(m._sum.quantity) > 0)
      .map((m) => ({
        productId: m.productId,
        product: productMap.get(m.productId) || null,
        unit: m.unit,
        quantity: m._sum.quantity,
      }));
  }

  async getStockByProduct(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found' });
    }

    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['locationType', 'locationId', 'unit'],
      where: {
        tenantId,
        productId,
      },
      _sum: {
        quantity: true,
      },
    });

    return movements
      .filter((m) => m._sum.quantity !== null && Number(m._sum.quantity) > 0)
      .map((m) => ({
        locationType: m.locationType,
        locationId: m.locationId,
        unit: m.unit,
        quantity: m._sum.quantity,
      }));
  }

  async getStockSummary(tenantId: string) {
    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['productId', 'locationType', 'locationId', 'unit'],
      where: { tenantId },
      _sum: { quantity: true },
    });

    const productIds = [...new Set(movements.map((m: { productId: string }) => m.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, tenantId, deletedAt: null },
      select: { id: true, sku: true, name: true, brand: true, stockUnit: true, reorderLevel: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    return movements
      .filter((m) => m._sum.quantity !== null)
      .map((m) => ({
        productId: m.productId,
        product: productMap.get(m.productId) || null,
        locationType: m.locationType,
        locationId: m.locationId,
        unit: m.unit,
        quantity: m._sum.quantity,
      }));
  }

  // ─── Inventory Movements (IMMUTABLE — append only) ────────────────────

  async createMovement(tenantId: string, dto: CreateInventoryMovementDto, recordedBy: string) {
    // Verify product exists
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, tenantId, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found' });
    }

    const movement = await this.prisma.inventoryMovement.create({
      data: {
        tenantId,
        productId: dto.productId,
        locationType: dto.locationType,
        locationId: dto.locationId,
        movementType: dto.movementType,
        quantity: dto.quantity,
        unit: dto.unit,
        unitQuantity: dto.unitQuantity ?? null,
        referenceType: dto.referenceType || null,
        referenceId: dto.referenceId || null,
        reason: dto.reason || null,
        batchNumber: dto.batchNumber || null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        recordedBy,
      },
      include: { product: { select: { id: true, sku: true, name: true } } },
    });

    this.logger.log(`Inventory movement created: ${dto.movementType} - ${dto.quantity} ${dto.unit} of ${product.name} at ${dto.locationType}:${dto.locationId}`);
    return movement;
  }

  async getMovements(tenantId: string, productId?: string, locationType?: string, locationId?: string, limit = 100, offset = 0) {
    const where: any = { tenantId };

    if (productId) where.productId = productId;
    if (locationType) where.locationType = locationType;
    if (locationId) where.locationId = locationId;

    const [movements, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        include: {
          product: { select: { id: true, sku: true, name: true } },
          recordedByUser: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { recordedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return { data: movements, total, limit, offset };
  }

  // ─── Warehouse Transfers ──────────────────────────────────────────────

  async createTransfer(tenantId: string, dto: CreateTransferDto, requestedBy: string) {
    // Verify all products exist
    const productIds = dto.items.map((i: { productId: string }) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, tenantId, deletedAt: null },
    });
    if (products.length !== productIds.length) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'One or more products not found' });
    }

    const referenceNumber = `TRF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const transfer = await this.prisma.$transaction(async (tx) => {
      const t = await tx.warehouseTransfer.create({
        data: {
          tenantId,
          referenceNumber,
          fromLocationType: dto.fromLocationType,
          fromLocationId: dto.fromLocationId,
          toLocationType: dto.toLocationType,
          toLocationId: dto.toLocationId,
          status: 'draft',
          requestedBy,
          notes: dto.notes || null,
          transferItems: {
            create: dto.items.map((item: { productId: string; quantity: number; unit: string }) => ({
              tenantId,
              productId: item.productId,
              quantity: item.quantity,
              unit: item.unit,
            })),
          },
        },
        include: {
          transferItems: {
            include: { product: { select: { id: true, sku: true, name: true } } },
          },
        },
      });

      return t;
    });

    this.logger.log(`Transfer created: ${referenceNumber} (${dto.fromLocationType} -> ${dto.toLocationType})`);
    return transfer;
  }

  async approveTransfer(tenantId: string, transferId: string, approvedBy: string) {
    const transfer = await this.prisma.warehouseTransfer.findFirst({
      where: { id: transferId, tenantId },
      include: { transferItems: true },
    });

    if (!transfer) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transfer not found' });
    }

    if (transfer.status !== 'draft') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `Cannot approve transfer in status: ${transfer.status}` });
    }

    const updated = await this.prisma.warehouseTransfer.update({
      where: { id: transferId },
      data: {
        status: 'approved',
        approvedBy,
        approvedAt: new Date(),
      },
    });

    this.logger.log(`Transfer approved: ${transfer.referenceNumber}`);
    return updated;
  }

  async dispatchTransfer(tenantId: string, transferId: string, dispatchedBy: string) {
    const transfer = await this.prisma.warehouseTransfer.findFirst({
      where: { id: transferId, tenantId },
      include: { transferItems: true },
    });

    if (!transfer) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transfer not found' });
    }

    if (transfer.status !== 'approved') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `Cannot dispatch transfer in status: ${transfer.status}` });
    }

    // Create outbound movements for each item
    await this.prisma.$transaction(async (tx) => {
      for (const item of transfer.transferItems) {
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            locationType: transfer.fromLocationType,
            locationId: transfer.fromLocationId,
            movementType: 'transfer_out',
            quantity: item.quantity,
            unit: item.unit,
            referenceType: 'warehouse_transfer',
            referenceId: transferId,
            recordedBy: dispatchedBy,
          },
        });
      }

      await tx.warehouseTransfer.update({
        where: { id: transferId },
        data: { status: 'in_transit', inTransitAt: new Date() },
      });
    });

    this.logger.log(`Transfer dispatched: ${transfer.referenceNumber}`);
    return this.prisma.warehouseTransfer.findFirst({
      where: { id: transferId },
      include: { transferItems: { include: { product: { select: { id: true, sku: true, name: true } } } } },
    });
  }

  async receiveTransfer(tenantId: string, transferId: string, receivedBy: string, receivedQuantities?: { itemId: string; quantity: number }[]) {
    const transfer = await this.prisma.warehouseTransfer.findFirst({
      where: { id: transferId, tenantId },
      include: { transferItems: true },
    });

    if (!transfer) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transfer not found' });
    }

    if (transfer.status !== 'in_transit') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `Cannot receive transfer in status: ${transfer.status}` });
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of transfer.transferItems) {
        const receivedQty = receivedQuantities?.find((rq) => rq.itemId === item.id)?.quantity ?? item.quantity;

        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            locationType: transfer.toLocationType,
            locationId: transfer.toLocationId,
            movementType: 'transfer_in',
            quantity: receivedQty,
            unit: item.unit,
            referenceType: 'warehouse_transfer',
            referenceId: transferId,
            recordedBy: receivedBy,
          },
        });

        if (receivedQty !== item.quantity) {
          await tx.transferItem.update({
            where: { id: item.id },
            data: { receivedQuantity: receivedQty },
          });
        }
      }

      await tx.warehouseTransfer.update({
        where: { id: transferId },
        data: { status: 'completed', receivedBy, completedAt: new Date() },
      });
    });

    this.logger.log(`Transfer received: ${transfer.referenceNumber}`);
    return this.prisma.warehouseTransfer.findFirst({
      where: { id: transferId },
      include: { transferItems: { include: { product: { select: { id: true, sku: true, name: true } } } } },
    });
  }

  async cancelTransfer(tenantId: string, transferId: string, cancelledBy: string, reason?: string) {
    const transfer = await this.prisma.warehouseTransfer.findFirst({
      where: { id: transferId, tenantId },
    });

    if (!transfer) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transfer not found' });
    }

    if (['completed', 'cancelled'].includes(transfer.status)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `Cannot cancel transfer in status: ${transfer.status}` });
    }

    const updated = await this.prisma.warehouseTransfer.update({
      where: { id: transferId },
      data: {
        status: 'cancelled',
        notes: reason ? `${transfer.notes || ''}\nCancelled: ${reason}`.trim() : transfer.notes,
      },
    });

    this.logger.log(`Transfer cancelled: ${transfer.referenceNumber}`);
    return updated;
  }

  async findAllTransfers(tenantId: string, status?: string, limit = 50, offset = 0) {
    const where: any = { tenantId };
    if (status) where.status = status;

    const [transfers, total] = await Promise.all([
      this.prisma.warehouseTransfer.findMany({
        where,
        include: {
          transferItems: {
            include: { product: { select: { id: true, sku: true, name: true } } },
          },
          requestedByUser: { select: { id: true, firstName: true, lastName: true } },
          approvedByUser: { select: { id: true, firstName: true, lastName: true } },
          receivedByUser: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { requestedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.warehouseTransfer.count({ where }),
    ]);

    return { data: transfers, total, limit, offset };
  }

  async findOneTransfer(tenantId: string, transferId: string) {
    const transfer = await this.prisma.warehouseTransfer.findFirst({
      where: { id: transferId, tenantId },
      include: {
        transferItems: {
          include: { product: { select: { id: true, sku: true, name: true, brand: true } } },
        },
        requestedByUser: { select: { id: true, firstName: true, lastName: true } },
        approvedByUser: { select: { id: true, firstName: true, lastName: true } },
        receivedByUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!transfer) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Transfer not found' });
    }

    return transfer;
  }

  // ─── Stock Adjustments ────────────────────────────────────────────────

  async adjustStock(tenantId: string, dto: StockAdjustmentDto, adjustedBy: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, tenantId, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found' });
    }

    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'A reason with at least 5 characters is required for stock adjustments' });
    }

    // Stock adjustments are just inventory movements with type 'adjustment'
    const movement = await this.prisma.inventoryMovement.create({
      data: {
        tenantId,
        productId: dto.productId,
        locationType: 'warehouse', // Adjustments default to warehouse
        locationId: dto.productId, // Not used for warehouse-level adjustments
        movementType: 'adjustment',
        quantity: dto.quantity,
        unit: dto.unit,
        reason: dto.reason,
        batchNumber: dto.batchNumber || null,
        recordedBy: adjustedBy,
      },
      include: { product: { select: { id: true, sku: true, name: true } } },
    });

    this.logger.log(`Stock adjustment: ${dto.quantity} ${dto.unit} of ${product.name} - Reason: ${dto.reason}`);
    return movement;
  }
}