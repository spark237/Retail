import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CashReportQueryDto, SalesSummaryQueryDto } from './dto/reports.dto';

/**
 * One row of the cash reconciliation report, shape-matched to the SPA's
 * CashReportRow in frontend/src/api/services.ts:
 *   { id, date, cashierName, branchName, expectedCash, declaredCash,
 *     difference, status: 'match' | 'mismatch' }
 */
export interface CashReportRow {
  id: string;
  date: string;
  cashierName: string;
  branchName: string;
  expectedCash: number;
  declaredCash: number;
  difference: number;
  status: 'match' | 'mismatch';
}

/**
 * Sales summary returned by GET /reports/sales/summary, shape-matched to the
 * SPA contract in frontend/src/api/services.ts:
 *   { totalSales: number; totalItems: number; avgTransaction: number }
 */
export interface SalesSummary {
  totalSales: number;
  totalItems: number;
  avgTransaction: number;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cash reconciliation built from the source-of-truth shift ledger: for every
   * shift closed on the requested date, expected cash is the shift's computed
   * expectedBalance (opening balance + cash takings − expenses), declared cash
   * is the cashier's closingBalance, and the difference/status derive from
   * those two — the same figures the shift-close flow persists.
   */
  async getCashReport(
    tenantId: string,
    query: CashReportQueryDto,
  ): Promise<CashReportRow[]> {
    const where: Record<string, unknown> = {
      tenantId,
      status: 'closed',
      deletedAt: null,
    };
    if (query.date) {
      const gte = new Date(`${query.date}T00:00:00.000Z`);
      const lte = new Date(`${query.date}T23:59:59.999Z`);
      if (!Number.isNaN(gte.getTime()) && !Number.isNaN(lte.getTime())) {
        where.closedAt = { gte, lte };
      }
    }
    const shifts = await this.prisma.shift.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        cashier: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { closedAt: 'desc' },
    });

    return shifts.map((shift) => {
      const expectedCash =
        shift.expectedBalance !== null && shift.expectedBalance !== undefined
          ? Number(shift.expectedBalance)
          : Number(shift.openingBalance) +
            Number(shift.totalCash) -
            Number(shift.totalExpenses);
      const declaredCash =
        shift.closingBalance !== null && shift.closingBalance !== undefined
          ? Number(shift.closingBalance)
          : 0;
      const difference = declaredCash - expectedCash;
      return {
        id: shift.id,
        date: (shift.closedAt ?? shift.openedAt).toISOString().split('T')[0],
        cashierName: `${shift.cashier.firstName} ${shift.cashier.lastName}`.trim(),
        branchName: shift.branch.name,
        expectedCash,
        declaredCash,
        difference,
        status: difference === 0 ? 'match' : 'mismatch',
      };
    });
  }

  /**
   * Sales summary aggregated from the sales ledger (source of truth): total
   * sales = sum of non-voided sale totals, total items = sum of sale-item
   * quantities, average transaction = total sales ÷ number of transactions.
   * Date filters span the full selected days (00:00:00.000Z → 23:59:59.999Z).
   */
  async getSalesSummary(
    tenantId: string,
    query: SalesSummaryQueryDto,
  ): Promise<SalesSummary> {
    const where: Record<string, unknown> = {
      tenantId,
      deletedAt: null,
      saleStatus: { not: 'voided' },
    };
    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.startDate || query.endDate) {
      const createdAtRange: { gte?: Date; lte?: Date } = {};
      if (query.startDate) {
        const gte = new Date(`${query.startDate}T00:00:00.000Z`);
        if (!Number.isNaN(gte.getTime())) createdAtRange.gte = gte;
      }
      if (query.endDate) {
        const lte = new Date(`${query.endDate}T23:59:59.999Z`);
        if (!Number.isNaN(lte.getTime())) createdAtRange.lte = lte;
      }
      where.createdAt = createdAtRange;
    }
    // paymentMethod matches the casing used by the sales flow, which stores
    // Payment.paymentType uppercased (e.g. 'cash' → 'CASH').
    if (query.paymentMethod) {
      where.payments = {
        some: { paymentType: query.paymentMethod.toUpperCase() },
      };
    }

    const [salesAgg, itemsAgg, transactionCount] = await Promise.all([
      this.prisma.sale.aggregate({ where, _sum: { totalAmount: true } }),
      this.prisma.saleItem.aggregate({
        where: { sale: { tenantId, ...where }, tenantId },
        _sum: { quantity: true },
      }),
      this.prisma.sale.count({ where }),
    ]);

    const totalSales = Number(salesAgg._sum.totalAmount || 0);
    const totalItems = Number(itemsAgg._sum.quantity || 0);
    const avgTransaction =
      transactionCount > 0
        ? Number((totalSales / transactionCount).toFixed(2))
        : 0;

    return { totalSales, totalItems, avgTransaction };
  }
}