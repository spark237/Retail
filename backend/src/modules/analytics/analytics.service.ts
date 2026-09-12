import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SalesReportQueryDto, InventoryReportQueryDto, CashReconciliationQueryDto, DashboardQueryDto } from './dto/analytics.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Sales Reports ────────────────────────────────────────────────────

  async getSalesReport(tenantId: string, query?: SalesReportQueryDto) {
    const where: any = {
      tenantId,
      deletedAt: null,
      saleStatus: { not: 'voided' },
    };

    if (query?.branchId) where.branchId = query.branchId;
    if (query?.paymentMethod) {
      where.payments = { some: { paymentType: query.paymentMethod } };
    }

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    // Totals
    const [sales, totalSales, totalItems, paymentSummary] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          payments: true,
          createdByUser: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      this.prisma.sale.aggregate({
        where,
        _sum: { totalAmount: true, subtotal: true, discountAmount: true, vatAmount: true },
        _count: { id: true },
      }),
      this.prisma.saleItem.aggregate({
        where: { sale: { ...where, tenantId } },
        _sum: { quantity: true },
      }),
      this.prisma.payment.groupBy({
        by: ['paymentType', 'confirmationStatus'],
        where: { sale: { ...where, tenantId } },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    // Sales by status
    const statusBreakdown = await this.prisma.sale.groupBy({
      by: ['saleStatus', 'paymentStatus'],
      where,
      _count: { id: true },
      _sum: { totalAmount: true },
    });

    return {
      summary: {
        totalSales: totalSales._sum.totalAmount || 0,
        totalSubtotal: totalSales._sum.subtotal || 0,
        totalDiscounts: totalSales._sum.discountAmount || 0,
        totalVat: totalSales._sum.vatAmount || 0,
        totalTransactions: totalSales._count.id || 0,
        totalItems: totalItems._sum.quantity || 0,
      },
      paymentSummary: paymentSummary.map((p) => ({
        type: p.paymentType,
        status: p.confirmationStatus,
        total: p._sum.amount || 0,
        count: p._count.id || 0,
      })),
      statusBreakdown: statusBreakdown.map((s) => ({
        saleStatus: s.saleStatus,
        paymentStatus: s.paymentStatus,
        count: s._count.id,
        total: s._sum.totalAmount || 0,
      })),
      sales,
    };
  }

  async getSalesByBranch(tenantId: string, query?: SalesReportQueryDto) {
    const where: any = {
      tenantId,
      deletedAt: null,
      saleStatus: { not: 'voided' },
    };
    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const byBranch = await this.prisma.sale.groupBy({
      by: ['branchId'],
      where,
      _sum: { totalAmount: true, subtotal: true, discountAmount: true },
      _count: { id: true },
      _avg: { totalAmount: true },
    });

    const branchIds = byBranch.map((b) => b.branchId);
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true, code: true },
    });
    const branchMap = new Map(branches.map((b) => [b.id, b]));

    return byBranch.map((b) => ({
      branch: branchMap.get(b.branchId) || { id: b.branchId, name: 'Unknown', code: '??' },
      totalSales: b._sum.totalAmount || 0,
      totalSubtotal: b._sum.subtotal || 0,
      totalDiscounts: b._sum.discountAmount || 0,
      transactionCount: b._count.id || 0,
      averageTransaction: b._avg.totalAmount || 0,
    }));
  }

  // ─── Inventory Reports ────────────────────────────────────────────────

  async getInventoryReport(tenantId: string, query?: InventoryReportQueryDto) {
    const where: any = { tenantId };

    if (query?.locationType) where.locationType = query.locationType;
    if (query?.locationId) where.locationId = query.locationId;
    if (query?.productId) where.productId = query.productId;

    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['productId', 'locationType', 'locationId', 'unit'],
      where,
      _sum: { quantity: true },
      _count: { id: true },
    });

    const productIds = [...new Set(movements.map((m) => m.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, tenantId, deletedAt: null },
      select: { id: true, sku: true, name: true, brand: true, stockUnit: true, reorderLevel: true, reorderQuantity: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    const stockData = movements
      .filter((m) => m._sum.quantity !== null)
      .map((m) => {
        const product = productMap.get(m.productId);
        const quantity = Number(m._sum.quantity);
        return {
          productId: m.productId,
          product: product || null,
          locationType: m.locationType,
          locationId: m.locationId,
          unit: m.unit,
          quantity,
          isLowStock: product?.reorderLevel ? quantity <= Number(product.reorderLevel) : false,
          movementCount: m._count.id,
        };
      });

    // Movement summary
    const movementSummary = await this.prisma.inventoryMovement.groupBy({
      by: ['movementType'],
      where: { tenantId },
      _sum: { quantity: true },
      _count: { id: true },
    });

    // Low stock alert
    const lowStockItems = stockData.filter((s) => s.isLowStock);

    return {
      stock: stockData,
      lowStockItems,
      movementSummary: movementSummary.map((m) => ({
        type: m.movementType,
        totalQuantity: m._sum.quantity || 0,
        count: m._count.id || 0,
      })),
      totalStockItems: stockData.length,
      lowStockCount: lowStockItems.length,
    };
  }

  // ─── Cash Reconciliation Reports ──────────────────────────────────────

  async getCashReconciliationReport(tenantId: string, query?: CashReconciliationQueryDto) {
    const where: any = {
      tenantId,
      status: 'closed',
    };

    if (query?.branchId) where.branchId = query.branchId;
    if (query?.startDate || query?.endDate) {
      where.closedAt = {};
      if (query.startDate) where.closedAt.gte = new Date(query.startDate);
      if (query.endDate) where.closedAt.lte = new Date(query.endDate);
    }

    const shifts = await this.prisma.shift.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        cashier: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { closedAt: 'desc' },
    });

    const totalDiscrepancy = shifts.reduce((sum, s) => sum + Number(s.discrepancy || 0), 0);
    const shiftsWithDiscrepancy = shifts.filter((s) => Number(s.discrepancy || 0) !== 0);

    return {
      summary: {
        totalShifts: shifts.length,
        shiftsWithDiscrepancy: shiftsWithDiscrepancy.length,
        totalDiscrepancy,
        averageDiscrepancy: shifts.length > 0 ? totalDiscrepancy / shifts.length : 0,
        totalCash: shifts.reduce((sum, s) => sum + Number(s.totalCash), 0),
        totalMomo: shifts.reduce((sum, s) => sum + Number(s.totalMomo), 0),
        totalExpenses: shifts.reduce((sum, s) => sum + Number(s.totalExpenses), 0),
      },
      shifts: shifts.map((s) => ({
        id: s.id,
        branch: s.branch,
        cashier: s.cashier,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        openingBalance: s.openingBalance,
        closingBalance: s.closingBalance,
        expectedBalance: s.expectedBalance,
        discrepancy: s.discrepancy,
        discrepancyReason: s.discrepancyReason,
        saleCount: s.saleCount,
        totalSales: s.totalSales,
        totalCash: s.totalCash,
        totalMomo: s.totalMomo,
        totalExpenses: s.totalExpenses,
      })),
    };
  }

  // ─── Fraud Alert Summary ──────────────────────────────────────────────

  async getFraudSummary(tenantId: string) {
    const [totalAlerts, openAlerts, byType, bySeverity, byBranch] = await Promise.all([
      this.prisma.fraudAlert.count({ where: { tenantId } }),
      this.prisma.fraudAlert.count({ where: { tenantId, status: 'open' } }),
      this.prisma.fraudAlert.groupBy({
        by: ['alertType'],
        where: { tenantId },
        _count: { id: true },
      }),
      this.prisma.fraudAlert.groupBy({
        by: ['severity'],
        where: { tenantId, status: 'open' },
        _count: { id: true },
      }),
      this.prisma.fraudAlert.groupBy({
        by: ['branchId'],
        where: { tenantId, status: 'open' },
        _count: { id: true },
      }),
    ]);

    const branchIds = byBranch.map((b) => b.branchId).filter(Boolean) as string[];
    const branches = branchIds.length > 0
      ? await this.prisma.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const branchMap = new Map(branches.map((b) => [b.id, b]));

    return {
      totalAlerts,
      openAlerts,
      resolvedAlerts: totalAlerts - openAlerts,
      byType: byType.reduce((acc, t) => ({ ...acc, [t.alertType]: t._count.id }), {}),
      bySeverity: bySeverity.reduce((acc, s) => ({ ...acc, [s.severity]: s._count.id }), {}),
      byBranch: byBranch.map((b) => ({
        branch: b.branchId ? branchMap.get(b.branchId) || { id: b.branchId, name: 'Unknown', code: '??' } : null,
        count: b._count.id,
      })),
    };
  }

  // ─── Dashboard KPIs ───────────────────────────────────────────────────

  async getDashboardKPIs(tenantId: string, query?: DashboardQueryDto) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const branchWhere = query?.branchId ? { branchId: query.branchId } : {};

    // Today's sales
    const todaySales = await this.prisma.sale.aggregate({
      where: {
        tenantId,
        ...branchWhere,
        createdAt: { gte: todayStart },
        deletedAt: null,
        saleStatus: { not: 'voided' },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    // This week's sales
    const weekSales = await this.prisma.sale.aggregate({
      where: {
        tenantId,
        ...branchWhere,
        createdAt: { gte: weekStart },
        deletedAt: null,
        saleStatus: { not: 'voided' },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    // This month's sales
    const monthSales = await this.prisma.sale.aggregate({
      where: {
        tenantId,
        ...branchWhere,
        createdAt: { gte: monthStart },
        deletedAt: null,
        saleStatus: { not: 'voided' },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    // Open shifts
    const openShifts = await this.prisma.shift.count({
      where: { tenantId, ...branchWhere, status: 'open' },
    });

    // Open fraud alerts
    const openFraudAlerts = await this.prisma.fraudAlert.count({
      where: { tenantId, status: 'open' },
    });

    // Pending sync
    const pendingSync = await this.prisma.sale.count({
      where: { tenantId, syncStatus: 'pending' },
    });

    // Low stock products
    const products = await this.prisma.product.findMany({
      where: { tenantId, deletedAt: null, isActive: true, reorderLevel: { not: null } },
      select: { id: true, sku: true, name: true, reorderLevel: true },
    });

    let lowStockCount = 0;
    for (const product of products) {
      const stock = await this.prisma.inventoryMovement.aggregate({
        where: { tenantId, productId: product.id },
        _sum: { quantity: true },
      });
      if (stock._sum.quantity && Number(stock._sum.quantity) <= Number(product.reorderLevel)) {
        lowStockCount++;
      }
    }

    // Top products
    const topProducts = await this.prisma.saleItem.groupBy({
      by: ['productId', 'productName'],
      where: {
        tenantId,
        sale: { createdAt: { gte: monthStart }, deletedAt: null, saleStatus: { not: 'voided' } },
      },
      _sum: { quantity: true, lineTotal: true },
      _count: { id: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    return {
      today: {
        sales: todaySales._sum.totalAmount || 0,
        transactions: todaySales._count.id || 0,
      },
      thisWeek: {
        sales: weekSales._sum.totalAmount || 0,
        transactions: weekSales._count.id || 0,
      },
      thisMonth: {
        sales: monthSales._sum.totalAmount || 0,
        transactions: monthSales._count.id || 0,
      },
      operations: {
        openShifts,
        openFraudAlerts,
        pendingSync,
        lowStockCount,
      },
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        productName: p.productName,
        quantity: p._sum.quantity || 0,
        revenue: p._sum.lineTotal || 0,
        orderCount: p._count.id || 0,
      })),
      timestamp: now.toISOString(),
    };
  }
}