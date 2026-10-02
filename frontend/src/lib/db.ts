import Dexie, { type EntityTable } from 'dexie';

export interface Product {
  id?: number;
  serverId: string | null;
  name: string;
  sku: string;
  category: string;
  unit: string;
  price: number;
  costPrice: number;
  taxRate: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface User {
  id?: number;
  serverId: string | null;
  email: string;
  name: string;
  role: string;
  branchId: string | null;
  tenantId: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Branch {
  id?: number;
  serverId: string | null;
  name: string;
  code: string;
  address: string;
  phone: string;
  isWarehouse: boolean;
  tenantId: string;
  createdAt: number;
  updatedAt: number;
}

export interface Warehouse {
  id?: number;
  serverId: string | null;
  name: string;
  code: string;
  branchId: string;
  address: string;
  tenantId: string;
  createdAt: number;
  updatedAt: number;
}

export interface Inventory {
  id?: number;
  serverId: string | null;
  productId: string;
  locationId: string;
  locationType: 'branch' | 'warehouse';
  quantity: number;
  minStock: number;
  maxStock: number;
  tenantId: string;
  updatedAt: number;
}

export interface Sale {
  id?: number;
  serverId: string | null;
  invoiceNumber: string;
  items: string; // JSON string
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
  paymentMethod: string;
  cashReceived: number;
  changeAmount: number;
  branchId: string;
  cashierId: string;
  shiftId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  createdAt: number;
  syncedAt: number | null;
}

export interface Shift {
  id?: number;
  serverId: string | null;
  cashierId: string;
  branchId: string;
  openedAt: number;
  closedAt: number | null;
  openingBalance: number;
  closingBalance: number | null;
  expectedBalance: number | null;
  status: 'open' | 'closed';
  notes: string | null;
  syncedAt: number | null;
}

export interface SyncQueueItem {
  id?: number;
  table: string;
  action: 'create' | 'update' | 'delete';
  data: string; // JSON string
  serverId: string | null;
  createdAt: number;
  retryCount: number;
  lastError: string | null;
}

const db = new Dexie('RetailGuardDB') as Dexie & {
  products: EntityTable<Product, 'id'>;
  users: EntityTable<User, 'id'>;
  branches: EntityTable<Branch, 'id'>;
  warehouses: EntityTable<Warehouse, 'id'>;
  inventory: EntityTable<Inventory, 'id'>;
  sales: EntityTable<Sale, 'id'>;
  shifts: EntityTable<Shift, 'id'>;
  syncQueue: EntityTable<SyncQueueItem, 'id'>;
};

db.version(1).stores({
  products: '++id, serverId, sku, category, deletedAt',
  users: '++id, serverId, email, role, branchId, tenantId',
  branches: '++id, serverId, code, tenantId',
  warehouses: '++id, serverId, code, branchId, tenantId',
  inventory: '++id, serverId, productId, locationId, locationType, tenantId',
  sales: '++id, serverId, invoiceNumber, branchId, cashierId, shiftId, createdAt',
  shifts: '++id, serverId, cashierId, branchId, status, openedAt',
  syncQueue: '++id, table, action, createdAt, retryCount',
});

export default db;
