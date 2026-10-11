import apiClient from './client';
import db from '../lib/db';
import { normalizeUser, type AuthUser } from '../stores/authStore';
import type { Product, Inventory, Sale, Shift, Branch } from '../lib/db';

// ============================================================
// Types
// ============================================================

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: AuthUser;
}

export interface DashboardKpi {
  todaySales: number;
  pendingSync: number;
  openShifts: number;
  activeAlerts: number;
}

export interface SalesDataPoint {
  date: string;
  total: number;
  count: number;
}

export interface PaymentBreakdown {
  method: string;
  total: number;
  count: number;
}

export interface RecentSale {
  id: string;
  invoiceNumber: string;
  total: number;
  paymentMethod: string;
  cashierName: string;
  createdAt: string;
}

export interface ProductInventory {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  branchStock: number;
  warehouseStock: number;
  totalStock: number;
}

export interface TransferRequest {
  sourceLocationId: string;
  sourceType: 'branch' | 'warehouse';
  destinationLocationId: string;
  destinationType: 'branch' | 'warehouse';
  items: { productId: string; quantity: number }[];
  notes?: string;
}

export interface DamageReport {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  locationId: string;
  locationType: 'branch' | 'warehouse';
  reason: string;
  notes: string | null;
  reportedById: string;
  reportedByName: string;
  createdAt: string;
}

export interface Movement {
  id: string;
  date: string;
  productName: string;
  productSku: string;
  type: 'purchase' | 'sale' | 'transfer' | 'adjustment' | 'damage';
  quantity: number;
  locationName: string;
  userName: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface SaleReportRow {
  id: string;
  invoiceNumber: string;
  createdAt: string;
  total: number;
  itemCount: number;
  paymentMethod: string;
  cashierName: string;
  branchName: string;
}

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

export interface FraudAlert {
  id: string;
  date: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  status: 'open' | 'resolved';
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface ShiftData {
  id: string;
  cashierId: string;
  branchId: string;
  openedAt: string;
  closedAt: string | null;
  openingBalance: number;
  closingBalance: number | null;
  expectedBalance: number | null;
  status: 'open' | 'closed';
}

// ============================================================
// API Service
// ============================================================

async function tryApi<T>(apiCall: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (!navigator.onLine) {
    return fallback();
  }
  try {
    return await apiCall();
  } catch {
    return fallback();
  }
}

// ---- Auth ----

export async function login(email: string, password: string, deviceId: string): Promise<LoginResponse> {
  const response = await apiClient.post('/auth/login', {
    email,
    password,
    deviceId,
  });
  // The API wraps responses as { success, data: { accessToken, refreshToken, user } }.
  const body = response.data as {
    data?: { accessToken?: unknown; refreshToken?: unknown; user?: unknown };
  };
  const inner = body?.data ?? body;
  const token = typeof inner.accessToken === 'string' ? inner.accessToken : null;
  const refreshToken = typeof inner.refreshToken === 'string' ? inner.refreshToken : null;
  const user = normalizeUser(inner.user);
  if (!token || !user) {
    throw new Error('Invalid login response: missing token or user');
  }
  return { token, refreshToken: refreshToken ?? '', user };
}

// ---- Products ----

/** Loose shape of a product row as returned by the backend GET /products.
 * The API sends the Prisma model with a nested `category` relation and prices
 * in `productPrices[]`; the offline cache stores a flattened variant instead
 * (see the Product type in lib/db.ts). */
interface RawProduct {
  id?: string;
  serverId?: string;
  name?: string;
  sku?: string;
  category?: string | { id?: string; name?: string; slug?: string } | null;
  unitOfMeasure?: string;
  stockUnit?: string;
  price?: number;
  costPrice?: number;
  taxRate?: number;
  createdAt?: string | Date | number;
  updatedAt?: string | Date | number;
  deletedAt?: string | Date | number | null;
  productPrices?: Array<{
    unit?: string;
    sellingPrice?: number | string;
    costPrice?: number | string | null;
    vatRate?: number | string;
    branchId?: string | null;
  }>;
}

function toNumberValue(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return 0;
}

function toTimestamp(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (v instanceof Date) return v.getTime();
  return 0;
}

export async function getProducts(): Promise<Product[]> {
  return tryApi(
    async () => {
      const response = await apiClient.get<RawProduct[]>('/products');
      // Cache in IndexedDB. The upsert is idempotent: rows are keyed by the
      // server product id (serverId), reusing the local auto-increment `id` on
      // re-sync, so repeated syncs update in place instead of duplicating rows.
      const existingByServerId = new Map<string, number>();
      for (const cached of await db.products.toArray()) {
        if (cached.serverId) existingByServerId.set(cached.serverId, cached.id as number);
      }

      const normalized: Product[] = [];

      for (const raw of response.data) {
        const serverId = raw.id || raw.serverId || null;
        const localId = serverId ? existingByServerId.get(serverId) : undefined;
        const categoryValue = raw.category;
        const categoryName =
          typeof categoryValue === 'string' && categoryValue
            ? categoryValue
            : categoryValue && typeof categoryValue === 'object' && categoryValue.name
              ? categoryValue.name
              : 'Uncategorized';
        const price = raw.productPrices && raw.productPrices.length > 0
          ? raw.productPrices[0]
          : undefined;
        const unit = price?.unit || raw.unitOfMeasure || raw.stockUnit || 'BOX';
        const record: Product = {
          ...(localId !== undefined ? { id: localId } : {}),
          serverId,
          name: raw.name || '',
          sku: raw.sku || '',
          category: categoryName,
          unit,
          price: toNumberValue(price?.sellingPrice ?? raw.price),
          costPrice: toNumberValue(price?.costPrice ?? raw.costPrice),
          taxRate: toNumberValue(price?.vatRate ?? raw.taxRate),
          createdAt: toTimestamp(raw.createdAt),
          updatedAt: toTimestamp(raw.updatedAt),
          deletedAt: raw.deletedAt ? toTimestamp(raw.deletedAt) : null,
        };
        // The returned rows MUST be the flattened variant: the POS renders
        // product.category / product.price directly, and the raw API rows
        // carry the category as a relation object ({id, name, slug}), which
        // crashes React ("Objects are not valid as a React child", #31).
        normalized.push(record);
        await db.products.put(record);
      }
      return normalized;
    },
    async () => {
      const cached = await db.products.where('deletedAt').equals(null).toArray();
      return cached.map((p) => ({
        id: p.id,
        serverId: p.serverId,
        name: p.name,
        sku: p.sku,
        category: p.category,
        unit: p.unit,
        price: p.price,
        costPrice: p.costPrice,
        taxRate: p.taxRate,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        deletedAt: p.deletedAt,
      })) as Product[];
    },
  );
}

export async function getProductCategories(): Promise<string[]> {
  const products = await getProducts();
  const categories = new Set(products.map((p) => p.category).filter(Boolean));
  return Array.from(categories).sort();
}

// ---- Inventory ----

export async function getInventory(): Promise<ProductInventory[]> {
  return tryApi(
    async () => {
      const response = await apiClient.get<ProductInventory[]>('/inventory');
      return response.data;
    },
    async () => {
      const inventoryItems = await db.inventory.toArray();
      const products = await db.products.where('deletedAt').equals(null).toArray();
      const productMap = new Map(products.map((p) => [p.serverId || p.id?.toString(), p]));

      const grouped = new Map<string, ProductInventory>();
      for (const inv of inventoryItems) {
        const key = inv.productId;
        const product = productMap.get(key);
        if (!grouped.has(key)) {
          grouped.set(key, {
            productId: key,
            productName: product?.name || 'Unknown',
            sku: product?.sku || '',
            unit: product?.unit || '',
            branchStock: 0,
            warehouseStock: 0,
            totalStock: 0,
          });
        }
        const entry = grouped.get(key)!;
        if (inv.locationType === 'branch') {
          entry.branchStock += inv.quantity;
        } else {
          entry.warehouseStock += inv.quantity;
        }
        entry.totalStock = entry.branchStock + entry.warehouseStock;
      }
      return Array.from(grouped.values());
    },
  );
}

// ---- Branches ----

export async function getBranches(): Promise<Branch[]> {
  return tryApi(
    async () => {
      const response = await apiClient.get<Branch[]>('/branches');
      for (const b of response.data) {
        await db.branches.put({
          serverId: b.serverId || b.id?.toString() || null,
          name: b.name,
          code: b.code,
          address: b.address,
          phone: b.phone,
          isWarehouse: b.isWarehouse || false,
          tenantId: b.tenantId,
          createdAt: typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : b.createdAt,
          updatedAt: typeof b.updatedAt === 'string' ? new Date(b.updatedAt).getTime() : b.updatedAt,
        });
      }
      return response.data;
    },
    async () => db.branches.toArray() as Promise<Branch[]>,
  );
}

// ---- Dashboard ----

export async function getDashboardKpis(): Promise<DashboardKpi> {
  const response = await apiClient.get<DashboardKpi>('/dashboard/kpis');
  return response.data;
}

export async function getSalesTrend(): Promise<SalesDataPoint[]> {
  const response = await apiClient.get<SalesDataPoint[]>('/dashboard/sales-trend');
  return response.data;
}

export async function getPaymentBreakdown(): Promise<PaymentBreakdown[]> {
  const response = await apiClient.get<PaymentBreakdown[]>('/dashboard/payment-breakdown');
  return response.data;
}

export async function getRecentSales(): Promise<RecentSale[]> {
  const response = await apiClient.get<RecentSale[]>('/dashboard/recent-sales');
  return response.data;
}

// ---- Sales ----

export async function getSales(
  page = 1,
  limit = 20,
  filters?: { startDate?: string; endDate?: string; branchId?: string; paymentMethod?: string },
): Promise<PaginatedResponse<SaleReportRow>> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  if (filters?.branchId) params.set('branchId', filters.branchId);
  if (filters?.paymentMethod) params.set('paymentMethod', filters.paymentMethod);

  const response = await apiClient.get<PaginatedResponse<SaleReportRow>>(`/sales?${params.toString()}`);
  return response.data;
}

export async function createSale(saleData: {
  items: { productId: string; name: string; quantity: number; unit: string; unitPrice: number; total: number }[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  cashReceived?: number;
  changeAmount?: number;
  momoPhone?: string;
  bankReference?: string;
  branchId: string;
  shiftId: string | null;
}): Promise<Sale> {
  if (!navigator.onLine) {
    // Save locally and queue for sync
    const localSale: Sale = {
      serverId: null,
      invoiceNumber: `OFF-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      items: JSON.stringify(saleData.items),
      subtotal: saleData.subtotal,
      taxAmount: 0,
      discount: saleData.discount,
      total: saleData.total,
      paymentMethod: saleData.paymentMethod,
      cashReceived: saleData.cashReceived || 0,
      changeAmount: saleData.changeAmount || 0,
      branchId: saleData.branchId,
      cashierId: '',
      shiftId: saleData.shiftId,
      customerName: null,
      customerPhone: saleData.momoPhone || null,
      notes: saleData.bankReference || null,
      createdAt: Date.now(),
      syncedAt: null,
    };
    const id = await db.sales.add(localSale);
    await import('../lib/sync').then((m) =>
      m.syncEngine.addToSyncQueue('sales', 'create', { ...localSale, localId: id }),
    );
    return { ...localSale, id } as unknown as Sale;
  }

  const response = await apiClient.post<Sale>('/sales', saleData);
  return response.data;
}

// ---- Shifts ----

export async function getCurrentShift(branchId: string, cashierId: string): Promise<ShiftData | null> {
  try {
    const response = await apiClient.get<ShiftData | null>(
      `/shifts/current?branchId=${branchId}&cashierId=${cashierId}`,
    );
    return response.data;
  } catch {
    const cached = await db.shifts
      .where({ branchId, cashierId, status: 'open' })
      .first();
    if (!cached) return null;
    return {
      id: cached.serverId || String(cached.id),
      cashierId: cached.cashierId,
      branchId: cached.branchId,
      openedAt: new Date(cached.openedAt).toISOString(),
      closedAt: null,
      openingBalance: cached.openingBalance,
      closingBalance: null,
      expectedBalance: null,
      status: 'open',
    };
  }
}

export async function openShift(branchId: string, openingBalance: number): Promise<ShiftData> {
  const response = await apiClient.post<ShiftData>('/shifts/open', { branchId, openingBalance });
  return response.data;
}

// ---- Movements ----

export async function getMovements(
  page = 1,
  limit = 50,
  filters?: { startDate?: string; endDate?: string; productSearch?: string },
): Promise<PaginatedResponse<Movement>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  if (filters?.productSearch) params.set('productSearch', filters.productSearch);

  const response = await apiClient.get<PaginatedResponse<Movement>>(`/movements?${params.toString()}`);
  return response.data;
}

// ---- Transfers ----

export async function createTransfer(data: TransferRequest): Promise<void> {
  if (!navigator.onLine) {
    await import('../lib/sync').then((m) =>
      m.syncEngine.addToSyncQueue('transfers', 'create', data as unknown as Record<string, unknown>),
    );
    return;
  }
  await apiClient.post('/transfers', data);
}

// ---- Damages ----

export async function createDamageReport(data: {
  productId: string;
  quantity: number;
  locationId: string;
  locationType: 'branch' | 'warehouse';
  reason: string;
  notes?: string;
}): Promise<void> {
  if (!navigator.onLine) {
    await import('../lib/sync').then((m) =>
      m.syncEngine.addToSyncQueue('damage-reports', 'create', data as unknown as Record<string, unknown>),
    );
    return;
  }
  await apiClient.post('/damage-reports', data);
}

export async function getDamageReports(): Promise<DamageReport[]> {
  return tryApi(
    async () => {
      const response = await apiClient.get<DamageReport[]>('/damage-reports');
      return response.data;
    },
    async () => [],
  );
}

// ---- Cash Reports ----

export async function getCashReports(
  date?: string,
): Promise<CashReportRow[]> {
  const params = date ? `?date=${date}` : '';
  const response = await apiClient.get<CashReportRow[]>(`/reports/cash${params}`);
  return response.data;
}

// ---- Fraud Alerts ----

export async function getFraudAlerts(
  filters?: { severity?: string; status?: string },
): Promise<FraudAlert[]> {
  const params = new URLSearchParams();
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.status) params.set('status', filters.status);
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await apiClient.get<FraudAlert[]>(`/fraud-alerts${query}`);
  return response.data;
}

export async function resolveFraudAlert(alertId: string): Promise<void> {
  await apiClient.post(`/fraud-alerts/${alertId}/resolve`);
}

// ---- Sales Summary (for report page) ----

export async function getSalesSummary(
  filters?: { startDate?: string; endDate?: string; branchId?: string; paymentMethod?: string },
): Promise<{ totalSales: number; totalItems: number; avgTransaction: number }> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  if (filters?.branchId) params.set('branchId', filters.branchId);
  if (filters?.paymentMethod) params.set('paymentMethod', filters.paymentMethod);
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await apiClient.get<{ totalSales: number; totalItems: number; avgTransaction: number }>(
    `/reports/sales/summary${query}`,
  );
  return response.data;
}