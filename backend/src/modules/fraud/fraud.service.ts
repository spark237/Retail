import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ResolveAlertDto, FraudQueryDto, RunDetectionDto } from './dto/fraud.dto';

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Detection Rules ──────────────────────────────────────────────────

  async runDetection(tenantId: string, dto?: RunDetectionDto) {
    const alerts: any[] = [];
    const branchId = dto?.branchId;

    // Rule 1: Cash shortage detection
    const cashAlerts = await this.detectCashShortages(tenantId, branchId);
    alerts.push(...cashAlerts);

    // Rule 2: Inventory mismatch detection
    const inventoryAlerts = await this.detectInventoryMismatches(tenantId, branchId);
    alerts.push(...inventoryAlerts);

    // Rule 3: Excessive discount detection
    const discountAlerts = await this.detectExcessiveDiscounts(tenantId, branchId);
    alerts.push(...discountAlerts);

    // Rule 4: Suspicious offline behavior
    const offlineAlerts = await this.detectSuspiciousOfflineBehavior(tenantId, branchId);
    alerts.push(...offlineAlerts);

    // Rule 5: Frequent sale voids
    const voidAlerts = await this.detectFrequentVoids(tenantId, branchId);
    alerts.push(...voidAlerts);

    // Create alerts in database
    let created = 0;
    for (const alert of alerts) {
      try {
        // Check if similar alert already exists (dedup by type, title within last 24h)
        const existing = await this.prisma.fraudAlert.findFirst({
          where: {
            tenantId,
            alertType: alert.alertType,
            title: alert.title,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });
        if (!existing) {
          await this.prisma.fraudAlert.create({
            data: {
              tenantId,
              branchId: alert.branchId || null,
              alertType: alert.alertType,
              severity: alert.severity,
              score: alert.score,
              title: alert.title,
              description: alert.description,
              details: alert.details || {},
            },
          });
          created++;
        }
      } catch (e) {
        this.logger.warn(`Failed to create fraud alert: ${e.message}`);
      }
    }

    this.logger.log(`Fraud detection completed: ${alerts.length} rules triggered, ${created} new alerts created`);
    return {
      rulesTriggered: alerts.length,
      newAlerts: created,
      alerts: alerts.slice(0, 50), // Return first 50 for preview
    };
  }

  private async detectCashShortages(tenantId: string, branchId?: string): Promise<any[]> {
    const alerts: any[] = [];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const where: any = {
      tenantId,
      status: 'closed',
      closedAt: { gte: yesterday },
      discrepancy: { not: 0 },
    };
    if (branchId) where.branchId = branchId;

    const shifts = await this.prisma.shift.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        cashier: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    for (const shift of shifts) {
      const discrepancy = Number(shift.discrepancy);
      if (Math.abs(discrepancy) > 0) {
        const severity = Math.abs(discrepancy) > 10000 ? 'high' : Math.abs(discrepancy) > 1000 ? 'medium' : 'low';
        alerts.push({
          branchId: shift.branchId,
          alertType: 'cash_shortage',
          severity,
          score: Math.min(Math.abs(discrepancy) / 100, 100),
          title: `Cash discrepancy of ${discrepancy.toFixed(2)} at ${shift.branch.name}`,
          description: `Shift closed by ${shift.cashier.firstName} ${shift.cashier.lastName} with discrepancy of ${discrepancy.toFixed(2)}. Expected: ${Number(shift.expectedBalance).toFixed(2)}, Declared: ${Number(shift.closingBalance).toFixed(2)}`,
          details: { shiftId: shift.id, discrepancy, expectedBalance: shift.expectedBalance, closingBalance: shift.closingBalance, cashierId: shift.cashierId },
        });
      }
    }

    return alerts;
  }

  private async detectInventoryMismatches(tenantId: string, branchId?: string): Promise<any[]> {
    const alerts: any[] = [];

    // Look for high volumes of negative adjustments
    const where: any = {
      tenantId,
      movementType: 'adjustment',
      quantity: { lt: 0 },
      reason: { contains: 'damage', mode: 'insensitive' },
    };

    const adjustments = await this.prisma.inventoryMovement.groupBy({
      by: ['productId', 'locationId'],
      where,
      _sum: { quantity: true },
      _count: { quantity: true },
    });

    for (const adj of adjustments) {
      if (adj._count && adj._count.quantity > 5) {
        const product = await this.prisma.product.findFirst({
          where: { id: adj.productId, tenantId },
          select: { name: true, sku: true },
        });

        alerts.push({
          alertType: 'inventory_mismatch',
          severity: 'medium',
          score: Math.min(adj._count.quantity * 10, 100),
          title: `High damage adjustments for ${product?.name || adj.productId}`,
          description: `${adj._count.quantity} damage adjustments totaling ${Math.abs(Number(adj._sum.quantity))} units`,
          details: { productId: adj.productId, adjustmentCount: adj._count.quantity, totalQuantity: adj._sum.quantity },
        });
      }
    }

    return alerts;
  }

  private async detectExcessiveDiscounts(tenantId: string, branchId?: string): Promise<any[]> {
    const alerts: any[] = [];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const where: any = {
      tenantId,
      createdAt: { gte: yesterday },
      saleStatus: { not: 'voided' },
    };
    if (branchId) where.branchId = branchId;

    // Find sales with discount > 30% of subtotal
    const sales = await this.prisma.sale.findMany({
      where: {
        ...where,
        discountAmount: { gt: 0 },
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        createdByUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    for (const sale of sales) {
      const discountPercent = (Number(sale.discountAmount) / Number(sale.subtotal)) * 100;
      if (discountPercent > 30) {
        const severity = discountPercent > 50 ? 'high' : 'medium';
        alerts.push({
          branchId: sale.branchId,
          alertType: 'excessive_discount',
          severity,
          score: Math.min(discountPercent, 100),
          title: `Excessive discount of ${discountPercent.toFixed(1)}% on sale ${sale.receiptNumber}`,
          description: `Sale by ${sale.createdByUser.firstName} ${sale.createdByUser.lastName} at ${sale.branch.name} has ${discountPercent.toFixed(1)}% discount. Reason: ${sale.discountReason || 'Not provided'}`,
          details: { saleId: sale.id, receiptNumber: sale.receiptNumber, discountPercent, discountAmount: sale.discountAmount, subtotal: sale.subtotal, discountReason: sale.discountReason },
        });
      }
    }

    return alerts;
  }

  private async detectSuspiciousOfflineBehavior(tenantId: string, branchId?: string): Promise<any[]> {
    const alerts: any[] = [];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const where: any = {
      tenantId,
      createdAt: { gte: yesterday },
      syncStatus: 'pending',
    };
    if (branchId) where.branchId = branchId;

    // Count pending sync sales per branch/shift
    const pendingSales = await this.prisma.sale.groupBy({
      by: ['branchId', 'shiftId', 'createdBy'],
      where,
      _count: { id: true },
    });

    for (const ps of pendingSales) {
      if (ps._count.id > 10) {
        const branch = await this.prisma.branch.findFirst({
          where: { id: ps.branchId, tenantId },
          select: { name: true, code: true },
        });
        const user = await this.prisma.user.findFirst({
          where: { id: ps.createdBy, tenantId },
          select: { firstName: true, lastName: true },
        });

        alerts.push({
          branchId: ps.branchId,
          alertType: 'suspicious_offline',
          severity: 'medium',
          score: Math.min(ps._count.id * 5, 100),
          title: `Suspicious offline activity at ${branch?.name || ps.branchId}`,
          description: `${ps._count.id} offline sales by ${user?.firstName || 'Unknown'} ${user?.lastName || ''} pending sync`,
          details: { branchId: ps.branchId, shiftId: ps.shiftId, userId: ps.createdBy, offlineCount: ps._count.id },
        });
      }
    }

    return alerts;
  }

  private async detectFrequentVoids(tenantId: string, branchId?: string): Promise<any[]> {
    const alerts: any[] = [];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const where: any = {
      tenantId,
      voidedAt: { gte: yesterday },
    };
    if (branchId) where.branchId = branchId;

    // Count voids per user
    const voids = await this.prisma.sale.groupBy({
      by: ['voidedBy', 'branchId'],
      where: {
        ...where,
        voidedBy: { not: null },
      },
      _count: { id: true },
    });

    for (const v of voids) {
      if (v._count.id > 5) {
        const branch = await this.prisma.branch.findFirst({
          where: { id: v.branchId, tenantId },
          select: { name: true, code: true },
        });
        const user = await this.prisma.user.findFirst({
          where: { id: v.voidedBy!, tenantId },
          select: { firstName: true, lastName: true },
        });

        const severity = v._count.id > 20 ? 'high' : 'medium';
        alerts.push({
          branchId: v.branchId,
          alertType: 'frequent_voids',
          severity,
          score: Math.min(v._count.id * 5, 100),
          title: `Frequent sale voids at ${branch?.name || v.branchId}`,
          description: `${v._count.id} voids by ${user?.firstName || 'Unknown'} ${user?.lastName || ''} in the last 24 hours`,
          details: { branchId: v.branchId, voidedBy: v.voidedBy, voidCount: v._count.id },
        });
      }
    }

    return alerts;
  }

  // ─── CRUD Operations ──────────────────────────────────────────────────

  async findAllAlerts(tenantId: string, query?: FraudQueryDto) {
    const where: any = { tenantId };

    if (query?.branchId) where.branchId = query.branchId;
    if (query?.alertType) where.alertType = query.alertType;
    if (query?.severity) where.severity = query.severity;
    if (query?.status) where.status = query.status;

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [alerts, total] = await Promise.all([
      this.prisma.fraudAlert.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          assignedToUser: { select: { id: true, firstName: true, lastName: true } },
          resolvedByUser: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.fraudAlert.count({ where }),
    ]);

    return { data: alerts, total };
  }

  async findOneAlert(tenantId: string, id: string) {
    const alert = await this.prisma.fraudAlert.findFirst({
      where: { id, tenantId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        assignedToUser: { select: { id: true, firstName: true, lastName: true } },
        resolvedByUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!alert) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Fraud alert not found' });
    }

    return alert;
  }

  async resolveAlert(tenantId: string, id: string, dto: ResolveAlertDto, resolvedBy: string) {
    const alert = await this.findOneAlert(tenantId, id);

    if (alert.status !== 'open') {
      return this.prisma.fraudAlert.update({
        where: { id },
        data: {
          status: dto.status || 'resolved',
          resolutionNotes: dto.resolutionNotes,
          resolvedBy,
          resolvedAt: new Date(),
        },
      });
    }

    const updated = await this.prisma.fraudAlert.update({
      where: { id },
      data: {
        status: dto.status || 'resolved',
        resolutionNotes: dto.resolutionNotes,
        resolvedBy,
        resolvedAt: new Date(),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        resolvedByUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    this.logger.log(`Fraud alert resolved: ${id}`);
    return updated;
  }

  async getAlertSummary(tenantId: string) {
    const [openAlerts, bySeverity, byType] = await Promise.all([
      this.prisma.fraudAlert.count({ where: { tenantId, status: 'open' } }),
      this.prisma.fraudAlert.groupBy({
        by: ['severity'],
        where: { tenantId, status: 'open' },
        _count: { id: true },
      }),
      this.prisma.fraudAlert.groupBy({
        by: ['alertType'],
        where: { tenantId, status: 'open' },
        _count: { id: true },
      }),
    ]);

    return {
      totalOpen: openAlerts,
      bySeverity: bySeverity.reduce((acc, s) => ({ ...acc, [s.severity]: s._count.id }), {}),
      byType: byType.reduce((acc, t) => ({ ...acc, [t.alertType]: t._count.id }), {}),
    };
  }
}