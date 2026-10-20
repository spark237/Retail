import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { ProductPrice } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateSaleDto, VoidSaleDto, SaleQueryDto } from './dto/sales.dto';
import { canonicalPrice, pickPriceForBranch, priceFloor } from '../../common/pricing.util';

// Payment type for iterating payments in sale creation
interface SalePayment {
  paymentType: string;
  amount: number;
  reference?: string;
  momoPhone?: string;
  momoProvider?: string;
  momoTransactionId?: string;
  changeAmount?: number;
}

// Sale item type for iterating items
interface SaleItem {
  productId: string;
  unitPrice: number;
  quantity: number;
  lineDiscount?: number;
  vatRate?: number;
  unit: string;
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Create Sale (Atomic Transaction) ─────────────────────────────────

  async create(tenantId: string, dto: CreateSaleDto, createdBy: string) {
    // Check idempotency
    if (dto.idempotencyKey) {
      const existing = await this.prisma.sale.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        this.logger.log(`Idempotent sale request: ${dto.idempotencyKey} - returning existing`);
        return this.findOne(tenantId, existing.id);
      }
    }

    // Verify branch
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId, deletedAt: null, isActive: true },
    });
    if (!branch) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Branch not found or inactive' });
    }

    // Verify shift is open
    const shift = await this.prisma.shift.findFirst({
      where: { id: dto.shiftId, tenantId, branchId: dto.branchId, status: 'open' },
    });
    if (!shift) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Shift not found or not open' });
    }

    // Verify products and calculate totals
    const productIdArray: string[] = dto.items.map((i: { productId: string }) => i.productId);
    const productIds = [...new Set<string>(productIdArray)];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, tenantId, deletedAt: null, isActive: true },
    });
    if (products.length !== productIds.length) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'One or more products not found or inactive' });
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // ─── Server-side price integrity ────────────────────────────────────
    // The client-supplied unitPrice is never trusted at face value. The
    // canonical selling price is resolved from `product_prices` (branch-scoped
    // row for the sale's branch if one exists, otherwise the tenant-wide row)
    // for the item's unit, and is the authoritative price for the line.
    // A submitted price strictly below the floor (min_price, falling back to
    // the canonical price) is an under-ringing attempt: the sale is rejected
    // with a 4xx AND a `price_below_floor` fraud alert is raised in real time
    // so it surfaces in /fraud-alerts. Absent or non-positive submitted prices
    // are derived from the canonical price instead of producing a 0 total.
    const units = [...new Set(dto.items.map((i: { unit: string }) => i.unit))];
    const priceRows = await this.prisma.productPrice.findMany({
      where: {
        tenantId,
        productId: { in: productIds },
        unit: { in: units },
        validFrom: { lte: new Date() },
        OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
      },
    });
    const priceRowMap = new Map<string, ProductPrice[]>();
    for (const row of priceRows) {
      const key = `${row.productId}|${row.unit}`;
      const bucket = priceRowMap.get(key) ?? [];
      bucket.push(row);
      priceRowMap.set(key, bucket);
    }
    const canonicalPrices = new Map<string, number>();
    for (const item of dto.items) {
      const product = productMap.get(item.productId)!;
      const key = `${item.productId}|${item.unit}`;
      const priceRow = pickPriceForBranch(priceRowMap.get(key) ?? [], dto.branchId);
      const canonical = canonicalPrice(priceRow);
      const floor = priceFloor(priceRow);
      if (priceRow == null || canonical == null) {
        throw new BadRequestException({
          code: 'PRICE_NOT_CONFIGURED',
          message: `No selling price is configured for ${product.name} (unit: ${item.unit}).`,
        });
      }
      canonicalPrices.set(key, canonical);
      const submitted = item.unitPrice;
      if (submitted == null || !(submitted > 0)) {
        continue; // derive from the canonical price — never a 0-total sale
      }
      if (floor != null && submitted < floor) {
        const underRingPct = Math.min(100, Math.max(50, ((canonical - submitted) / canonical) * 100));
        await this.prisma.fraudAlert.create({
          data: {
            tenantId,
            branchId: dto.branchId,
            alertType: 'price_below_floor',
            severity: 'high',
            score: Math.round(underRingPct * 100) / 100,
            title: `Under-ring attempt: ${product.name} (${item.unit}) - unit price ${submitted} below floor ${floor}`,
            description: `Sale for ${branch.name} was rejected: submitted unit price ${submitted} XAF is below the allowed floor of ${floor} XAF for ${product.name} (${item.unit}). Canonical price is ${canonical} XAF.`,
            details: {
              productId: item.productId,
              productName: product.name,
              sku: product.sku,
              unit: item.unit,
              submittedPrice: submitted,
              canonicalPrice: canonical,
              floorPrice: floor,
              branchId: dto.branchId,
              shiftId: dto.shiftId,
              attemptedBy: createdBy,
              endpoint: 'POST /api/v1/sales',
            },
          },
        });
        throw new BadRequestException({
          code: 'PRICE_BELOW_FLOOR',
          message: `Sale rejected: ${product.name} (${item.unit}) unit price ${submitted} XAF is below the allowed minimum floor of ${floor} XAF (canonical ${canonical} XAF).`,
        });
      }
    }

    // Generate receipt number
    const receiptNumber = await this.generateReceiptNumber(tenantId, dto.branchId);

    // Atomic transaction
    const sale = await this.prisma.$transaction(async (tx) => {
      let subtotal = 0;
      let totalVat = 0;
      let totalDiscount = dto.discountAmount || 0;

      // Create sale record
      const s = await tx.sale.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          shiftId: dto.shiftId,
          receiptNumber,
          subtotal: 0,
          discountAmount: totalDiscount,
          discountReason: dto.discountReason || null,
          vatAmount: 0,
          totalAmount: 0,
          paymentStatus: 'pending',
          saleStatus: 'completed',
          idempotencyKey: dto.idempotencyKey || null,
          createdBy,
          updatedBy: createdBy,
        },
      });

      // Create sale items and compute totals
      let runningSubtotal = 0;
      let runningVat = 0;

      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;
        // Authoritative server-resolved price (never the raw client payload)
        const lineUnitPrice = canonicalPrices.get(`${item.productId}|${item.unit}`)!;
        const lineTotal = lineUnitPrice * item.quantity;
        const lineDiscount = item.lineDiscount || 0;
        const vatRate = item.vatRate ?? 19.25;
        const lineAfterDiscount = lineTotal - lineDiscount;
        const lineVat = (lineAfterDiscount * vatRate) / 100;
        const finalLineTotal = lineAfterDiscount + lineVat;

        // Calculate stock unit quantity if conversion factors exist
        let stockUnitQuantity: number | null = null;
        if (item.unit !== product.stockUnit) {
          if (item.unit === 'SQM' && product.stockToSqmFactor) {
            stockUnitQuantity = item.quantity * Number(product.stockToSqmFactor);
          } else if (item.unit === 'PIECE' && product.stockToPieceFactor) {
            stockUnitQuantity = item.quantity * Number(product.stockToPieceFactor);
          }
        } else {
          stockUnitQuantity = item.quantity;
        }

        await tx.saleItem.create({
          data: {
            saleId: s.id,
            tenantId,
            productId: item.productId,
            productName: product.name,
            sku: product.sku,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: lineUnitPrice,
            lineDiscount,
            vatRate: vatRate,
            vatAmount: lineVat,
            lineTotal: finalLineTotal,
            stockUnitQuantity: stockUnitQuantity ?? undefined,
          },
        });

        runningSubtotal += lineTotal;
        runningVat += lineVat;
      }

      // Apply global discount proportionally
      if (totalDiscount > 0) {
        const discountRatio = totalDiscount / runningSubtotal;
        const items = await tx.saleItem.findMany({ where: { saleId: s.id } });
        for (const item of items) {
          const itemDiscount = Number(item.lineTotal) * discountRatio;
          await tx.saleItem.update({
            where: { id: item.id },
            data: { lineDiscount: itemDiscount },
          });
        }
      }

      const totalAmount = runningSubtotal - totalDiscount + runningVat;

      // Update sale with calculated totals
      await tx.sale.update({
        where: { id: s.id },
        data: {
          subtotal: runningSubtotal,
          vatAmount: runningVat,
          totalAmount,
        },
      });

      // Create payments and deduct inventory
      for (const payment of dto.payments) {
        const isMomo = payment.paymentType === 'mobile_money';
        const confirmationStatus = isMomo ? 'pending' : 'confirmed';

        await tx.payment.create({
          data: {
            saleId: s.id,
            tenantId,
            paymentType: payment.paymentType,
            amount: payment.amount,
            reference: payment.reference || null,
            confirmationStatus,
            confirmedAt: isMomo ? null : new Date(),
            confirmedBy: isMomo ? null : createdBy,
            momoPhone: payment.momoPhone || null,
            momoProvider: payment.momoProvider || null,
            momoTransactionId: payment.momoTransactionId || null,
            changeAmount: payment.changeAmount || 0,
          },
        });
      }

      // Update sale payment status
      const hasPendingPayment = dto.payments.some((p: { paymentType: string }) => p.paymentType === 'mobile_money');
      if (hasPendingPayment) {
        await tx.sale.update({
          where: { id: s.id },
          data: { paymentStatus: 'pending_payment' },
        });
      } else {
        await tx.sale.update({
          where: { id: s.id },
          data: { paymentStatus: 'paid' },
        });
      }

      // Deduct inventory for each item
      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;
        const stockUnitQty = item.unit === product.stockUnit
          ? item.quantity
          : (item.unit === 'SQM' && product.stockToSqmFactor
            ? item.quantity * Number(product.stockToSqmFactor)
            : (item.unit === 'PIECE' && product.stockToPieceFactor
              ? item.quantity * Number(product.stockToPieceFactor)
              : item.quantity));

        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            locationType: 'branch',
            locationId: dto.branchId,
            movementType: 'sale',
            quantity: -stockUnitQty,
            unit: product.stockUnit,
            unitQuantity: stockUnitQty,
            referenceType: 'sale',
            referenceId: s.id,
            recordedBy: createdBy,
          },
        });
      }

      // Update shift totals
      await tx.shift.update({
        where: { id: dto.shiftId },
        data: {
          saleCount: { increment: 1 },
          totalSales: { increment: totalAmount },
          totalDiscounts: { increment: totalDiscount },
          totalCash: { increment: dto.payments
            .filter((p: { paymentType: string; amount: number }) => p.paymentType === 'cash')
            .reduce((sum: number, p: { amount: number }) => sum + p.amount, 0) },
          totalMomo: { increment: dto.payments
            .filter((p: { paymentType: string; amount: number }) => p.paymentType === 'mobile_money')
            .reduce((sum: number, p: { amount: number }) => sum + p.amount, 0) },
          totalOther: { increment: dto.payments
            .filter((p: { paymentType: string; amount: number }) => !['cash', 'mobile_money'].includes(p.paymentType))
            .reduce((sum: number, p: { amount: number }) => sum + p.amount, 0) },
        },
      });

      return tx.sale.findUnique({
        where: { id: s.id },
        include: {
          saleItems: { include: { product: { select: { id: true, sku: true, name: true } } } },
          payments: true,
          branch: { select: { id: true, name: true, code: true } },
          shift: { select: { id: true, status: true } },
          createdByUser: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });

    this.logger.log(`Sale created: ${receiptNumber} (total: ${sale!.totalAmount}, tenant: ${tenantId})`);
    return sale!;
  }

  async findOne(tenantId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        saleItems: {
          include: { product: { select: { id: true, sku: true, name: true, brand: true } } },
        },
        payments: true,
        branch: { select: { id: true, name: true, code: true } },
        shift: { select: { id: true, status: true, openedAt: true, closedAt: true } },
        createdByUser: { select: { id: true, firstName: true, lastName: true } },
        voidedByUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!sale) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Sale not found' });
    }

    return sale;
  }

  async findAll(tenantId: string, query?: SaleQueryDto) {
    const where: any = { tenantId, deletedAt: null };

    if (query?.branchId) where.branchId = query.branchId;
    if (query?.shiftId) where.shiftId = query.shiftId;
    if (query?.saleStatus) where.saleStatus = query.saleStatus;
    if (query?.paymentStatus) where.paymentStatus = query.paymentStatus;
    if (!query?.includeVoided) where.saleStatus = { not: 'voided' };

    if (query?.search) {
      where.OR = [
        { receiptNumber: { contains: query.search, mode: 'insensitive' } },
        { saleItems: { some: { productName: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [sales, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: {
          saleItems: true,
          payments: true,
          branch: { select: { id: true, name: true, code: true } },
          createdByUser: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { data: sales, total };
  }

  async findByBranch(tenantId: string, branchId: string, query?: SaleQueryDto) {
    return this.findAll(tenantId, { ...query, branchId });
  }

  async findByShift(tenantId: string, shiftId: string, query?: SaleQueryDto) {
    return this.findAll(tenantId, { ...query, shiftId });
  }

  // ─── Void Sale ────────────────────────────────────────────────────────

  async voidSale(tenantId: string, id: string, dto: VoidSaleDto, voidedBy: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { saleItems: true },
    });

    if (!sale) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Sale not found' });
    }

    if (sale.saleStatus === 'voided') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Sale is already voided' });
    }

    // Verify supervisor approval
    if (dto.supervisorId === voidedBy) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Supervisor approval required from a different user',
      });
    }

    const supervisor = await this.prisma.user.findFirst({
      where: { id: dto.supervisorId, tenantId, isActive: true },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    if (!supervisor) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Supervisor not found' });
    }

    const isSupervisor = supervisor.userRoles.some((ur) => ur.role.slug === 'supervisor');
    if (!isSupervisor) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Only a supervisor can approve void operations',
      });
    }

    // Atomic void
    await this.prisma.$transaction(async (tx) => {
      // Void the sale
      await tx.sale.update({
        where: { id },
        data: {
          saleStatus: 'voided',
          voidReason: dto.reason,
          voidedAt: new Date(),
          voidedBy: dto.supervisorId,
          paymentStatus: 'voided',
          updatedBy: voidedBy,
        },
      });

      // Reverse inventory movements
      for (const item of sale.saleItems) {
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            locationType: 'branch',
            locationId: sale.branchId,
            movementType: 'void',
            quantity: item.stockUnitQuantity
              ? Number(item.stockUnitQuantity)
              : Number(item.quantity),
            unit: item.unit,
            referenceType: 'sale_void',
            referenceId: id,
            recordedBy: voidedBy,
            reason: `Void: ${dto.reason}`,
          },
        });
      }

      // Update shift totals
      await tx.shift.update({
        where: { id: sale.shiftId },
        data: {
          totalVoids: { increment: 1 },
          totalSales: { increment: -Number(sale.totalAmount) },
          totalDiscounts: { increment: -Number(sale.discountAmount) },
        },
      });
    });

    this.logger.log(`Sale voided: ${sale.receiptNumber} - Reason: ${dto.reason}`);
    return this.findOne(tenantId, id);
  }

  // ─── Confirm Mobile Money Payment ─────────────────────────────────────

  async confirmPayment(tenantId: string, saleId: string, paymentId: string, confirmedBy: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, tenantId, deletedAt: null },
    });

    if (!sale) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Sale not found' });
    }

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, saleId, tenantId },
    });

    if (!payment) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payment not found' });
    }

    if (payment.confirmationStatus === 'confirmed') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Payment already confirmed' });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          confirmationStatus: 'confirmed',
          confirmedAt: new Date(),
          confirmedBy,
        },
      });

      // Check if all payments are confirmed
      const allPayments = await tx.payment.findMany({ where: { saleId } });
      const allConfirmed = allPayments.every((p) => p.confirmationStatus === 'confirmed');

      if (allConfirmed) {
        await tx.sale.update({
          where: { id: saleId },
          data: { paymentStatus: 'paid' },
        });
      }

      return tx.payment.findUnique({ where: { id: paymentId } });
    });

    this.logger.log(`Payment confirmed for sale ${sale.receiptNumber}`);
    return updated;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private async generateReceiptNumber(tenantId: string, branchId: string): Promise<string> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { code: true },
    });

    const prefix = branch?.code || 'XX';
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = Math.floor(Math.random() * 9000) + 1000;

    return `RCP-${prefix}-${dateStr}-${seq}`;
  }
}