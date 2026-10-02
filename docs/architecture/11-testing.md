# Testing Strategy — RetailGuard

## 1. Testing Philosophy

1. **Offline-first testing** — Every test suite must include offline scenarios. The system's core value proposition is offline reliability, and that must be proven in tests.
2. **Test the sync, not just the API** — The sync protocol is the most complex and critical component. It receives proportionally more test coverage than standard CRUD endpoints.
3. **Deterministic tests** — All tests must be repeatable. Random seeds, fixed UUIDs, and controlled clocks are used instead of randomness or `Date.now()` where possible.
4. **Realistic data** — Test data mirrors real Cameroonian retail scenarios: mixed payment types (cash + mobile money), multiple branches, warehouse-to-branch transfers, and offline failure modes.
5. **No test mocking of SQLite** — The offline SQLite layer is tested with actual sql.js WASM in a Node.js environment, not mocked. The sync engine is tested against both local SQLite and PostgreSQL.

## 2. Test Pyramid

```mermaid
graph TD
    subgraph "E2E Tests (5%)"
        E2E["Full Flow Tests<br/>Sale → Sync → Reconcile"]
        OFFLINE_E2E["Offline Flow Tests<br/>Disconnect → Transact → Reconnect → Verify"]
    end
    subgraph "Integration Tests (25%)"
        INT_API["API Integration<br/>(NestJS + PostgreSQL)"]
        INT_SYNC["Sync Engine Integration<br/>(SQLite ↔ PostgreSQL)"]
        INT_DB["Database Tests<br/>(Migrations, Indexes, RLS)"]
        INT_FRAUD["Fraud Engine Tests<br/>(Rules + Scoring)"]
    end
    subgraph "Unit Tests (70%)"
        UNIT_SERVICE["Service Layer<br/>(Business Logic)"]
        UNIT_VALIDATION["Validation Tests<br/>(Zod Schemas)"]
        UNIT_UTIL["Utility Tests<br/>(Pricing, Currency, Sync)"]
        UNIT_FRAUD["Fraud Rule Unit Tests"]
    end
```

### 2.1 Coverage Targets

| Layer | Target | Minimum Acceptable |
|-------|--------|-------------------|
| Services (business logic) | 90% | 85% |
| Controllers | 80% | 75% |
| Validators / DTOs | 95% | 90% |
| Sync engine (client) | 85% | 80% |
| Sync engine (server) | 85% | 80% |
| Fraud rules | 90% | 85% |
| Database migrations | 100% (verify up/down) | 100% |
| UI components | 70% | 60% |
| **Overall** | **85%** | **80%** |

Coverage is measured per-package in the monorepo. The CI pipeline enforces the minimum acceptable threshold — a build fails if any package drops below its minimum.

## 3. Testing Framework

### 3.1 Framework Choice: Vitest

```typescript
// vitest.config.ts (root)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./config/jest/setup.ts'],
    globalSetup: './config/jest/global-setup.ts',
    teardownTimeout: 30000,
    testTimeout: 15000,
    hookTimeout: 20000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        maxForks: 4,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      include: [
        'apps/api/src/**/*.ts',
        'packages/sync-engine/src/**/*.ts',
        'packages/fraud-engine/src/**/*.ts',
        'services/*/src/**/*.ts',
      ],
      exclude: [
        '**/*.entity.ts',
        '**/*.module.ts',
        '**/*.dto.ts',
        '**/*.config.ts',
        '**/*.interface.ts',
        '**/index.ts',
        '**/migrations/**',
        '**/*.spec.ts',
        '**/*.test.ts',
      ],
    },
  },
});
```

**Why Vitest over Jest:**
- Native TypeScript support (no ts-jest or babel transforms needed)
- Faster execution (ESM-native, parallel by default)
- Compatible with Jest's API (easy migration path)
- Built-in watch mode, coverage (via v8), and snapshot testing
- Better ESM support for packages that use `exports` in package.json

### 3.2 Per-Package Vitest Configuration

Each package and app has its own `vitest.config.ts` extending the root:

```typescript
// apps/api/vitest.config.ts
import { defineConfig } from 'vitest/config';
import rootConfig from '../../vitest.config';

export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    name: 'api',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://retailguard:testpassword@localhost:5433/retailguard_test',
      REDIS_URL: 'redis://localhost:6380',
      JWT_PRIVATE_KEY: 'test-private-key',
      JWT_PUBLIC_KEY: 'test-public-key',
    },
  },
});
```

```typescript
// packages/sync-engine/vitest.config.ts
import { defineConfig } from 'vitest/config';
import rootConfig from '../../vitest.config';

export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    name: 'sync-engine',
    include: ['src/**/*.spec.ts'],
    env: {
      NODE_ENV: 'test',
      // Sync engine tests use SQLite only (no PostgreSQL dependency)
      SQLITE_TEST_DB: ':memory:',
    },
  },
});
```

## 4. Unit Tests

### 4.1 Service Layer Tests

Services contain business logic and are tested in isolation with mocked dependencies.

```typescript
// apps/api/src/modules/pos/pos.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PosService } from './pos.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Sale } from './entities/sale.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { Shift } from './entities/shift.entity';

describe('PosService', () => {
  let service: PosService;

  const mockSaleRepo = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
  };

  const mockInventoryRepo = {
    create: vi.fn(),
    save: vi.fn(),
  };

  const mockShiftRepo = {
    findOne: vi.fn(),
    save: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosService,
        { provide: getRepositoryToken(Sale), useValue: mockSaleRepo },
        { provide: getRepositoryToken(InventoryMovement), useValue: mockInventoryRepo },
        { provide: getRepositoryToken(Shift), useValue: mockShiftRepo },
      ],
    }).compile();

    service = module.get<PosService>(PosService);
    vi.clearAllMocks();
  });

  describe('createSale', () => {
    it('should create a sale with items and payments', async () => {
      // Arrange
      const dto = {
        branch_id: '550e8400-e29b-41d4-a716-446655440000',
        shift_id: '550e8400-e29b-41d4-a716-446655440001',
        items: [
          {
            product_id: '550e8400-e29b-41d4-a716-446655440002',
            unit: 'BOX' as const,
            quantity: 2,
            unit_price: 15000,
            line_discount: 0,
          },
        ],
        payments: [{ payment_type: 'cash' as const, amount: 30000 }],
        discount_amount: 0,
      };

      mockShiftRepo.findOne.mockResolvedValue({
        id: dto.shift_id,
        status: 'open',
        branch_id: dto.branch_id,
        sale_count: 0,
        total_sales: 0,
        total_cash: 0,
      });

      mockSaleRepo.create.mockReturnValue({ id: 'new-sale-id', ...dto });
      mockSaleRepo.save.mockResolvedValue({ id: 'new-sale-id', receipt_number: 'RCP-001' });

      // Act
      const result = await service.createSale(dto, 'user-uuid');

      // Assert
      expect(result).toBeDefined();
      expect(result.receipt_number).toBeTruthy();
      expect(mockSaleRepo.create).toHaveBeenCalledTimes(1);
      expect(mockInventoryRepo.save).toHaveBeenCalled(); // Inventory movement created
      expect(mockShiftRepo.save).toHaveBeenCalled(); // Shift totals updated
    });

    it('should reject sale when shift is already closed', async () => {
      // Arrange
      const dto = {
        branch_id: '550e8400-e29b-41d4-a716-446655440000',
        shift_id: '550e8400-e29b-41d4-a716-446655440001',
        items: [],
        payments: [],
        discount_amount: 0,
      };

      mockShiftRepo.findOne.mockResolvedValue({
        id: dto.shift_id,
        status: 'closed',
        closed_at: new Date(),
      });

      // Act & Assert
      await expect(service.createSale(dto, 'user-uuid')).rejects.toThrow('NO_OPEN_SHIFT');
      expect(mockSaleRepo.save).not.toHaveBeenCalled();
    });

    it('should reject sale when price is below minimum', async () => {
      // Arrange
      const dto = {
        branch_id: '550e8400-e29b-41d4-a716-446655440000',
        shift_id: '550e8400-e29b-41d4-a716-446655440001',
        items: [
          {
            product_id: '550e8400-e29b-41d4-a716-446655440002',
            unit: 'BOX' as const,
            quantity: 1,
            unit_price: 8000, // Below min price of 9500
            line_discount: 0,
          },
        ],
        payments: [{ payment_type: 'cash' as const, amount: 8000 }],
        discount_amount: 0,
      };

      mockShiftRepo.findOne.mockResolvedValue({
        id: dto.shift_id,
        status: 'open',
      });

      // Mock price check returning min_price = 9500
      vi.spyOn(service, 'validatePrices').mockRejectedValue({
        code: 'PRICE_EXCEEDS_MIN_PRICE',
        message: 'Selling price 8,000 XAF is below minimum price 9,500 XAF',
      });

      // Act & Assert
      await expect(service.createSale(dto, 'user-uuid')).rejects.toThrow('PRICE_EXCEEDS_MIN_PRICE');
    });
  });
});
```

### 4.2 Validation Tests (Zod Schemas)

Every request DTO is validated with a Zod schema. These schemas are tested independently.

```typescript
// packages/shared-types/src/schemas/create-sale.schema.spec.ts
import { describe, it, expect } from 'vitest';
import { CreateSaleSchema } from './create-sale.schema';

describe('CreateSaleSchema', () => {
  it('should accept a valid sale with cash payment', () => {
    const result = CreateSaleSchema.safeParse({
      branch_id: '550e8400-e29b-41d4-a716-446655440000',
      shift_id: '550e8400-e29b-41d4-a716-446655440001',
      items: [
        {
          product_id: '550e8400-e29b-41d4-a716-446655440002',
          unit: 'BOX',
          quantity: 2,
          unit_price: 15000,
          line_discount: 0,
        },
      ],
      payments: [{ payment_type: 'cash', amount: 30000 }],
      discount_amount: 0,
    });

    expect(result.success).toBe(true);
  });

  it('should accept a sale with mixed payments', () => {
    const result = CreateSaleSchema.safeParse({
      branch_id: '550e8400-e29b-41d4-a716-446655440000',
      shift_id: '550e8400-e29b-41d4-a716-446655440001',
      items: [
        {
          product_id: '550e8400-e29b-41d4-a716-446655440002',
          unit: 'SQM',
          quantity: 4.32,
          unit_price: 10417,
          line_discount: 0,
        },
      ],
      payments: [
        { payment_type: 'mtn_momo', amount: 25000, momo_phone: '237670000000' },
        { payment_type: 'cash', amount: 20000 },
      ],
      discount_amount: 0,
    });

    expect(result.success).toBe(true);
  });

  it('should reject a sale with missing branch_id', () => {
    const result = CreateSaleSchema.safeParse({
      shift_id: '550e8400-e29b-41d4-a716-446655440001',
      items: [],
      payments: [],
      discount_amount: 0,
    });

    expect(result.success).toBe(false);
  });

  it('should reject a sale with negative quantity', () => {
    const result = CreateSaleSchema.safeParse({
      branch_id: '550e8400-e29b-41d4-a716-446655440000',
      shift_id: '550e8400-e29b-41d4-a716-446655440001',
      items: [
        {
          product_id: '550e8400-e29b-41d4-a716-446655440002',
          unit: 'BOX',
          quantity: -1,
          unit_price: 15000,
          line_discount: 0,
        },
      ],
      payments: [{ payment_type: 'cash', amount: 30000 }],
      discount_amount: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('quantity');
    }
  });

  it('should reject a sale exceeding 100 items', () => {
    const items = Array.from({ length: 101 }, (_, i) => ({
      product_id: '550e8400-e29b-41d4-a716-446655440002',
      unit: 'BOX' as const,
      quantity: 1,
      unit_price: 15000,
      line_discount: 0,
    }));

    const result = CreateSaleSchema.safeParse({
      branch_id: '550e8400-e29b-41d4-a716-446655440000',
      shift_id: '550e8400-e29b-41d4-a716-446655440001',
      items,
      payments: [{ payment_type: 'cash', amount: 1500000 }],
      discount_amount: 0,
    });

    expect(result.success).toBe(false);
  });

  it('should reject an invalid payment type', () => {
    const result = CreateSaleSchema.safeParse({
      branch_id: '550e8400-e29b-41d4-a716-446655440000',
      shift_id: '550e8400-e29b-41d4-a716-446655440001',
      items: [],
      payments: [{ payment_type: 'bitcoin', amount: 30000 }],
      discount_amount: 0,
    });

    expect(result.success).toBe(false);
  });
});
```

### 4.3 Utility Tests

```typescript
// packages/utils/src/pricing.spec.ts
import { describe, it, expect } from 'vitest';
import { calculatePricePerUnit, calculateLineTotal, calculateVat } from './pricing';

describe('Pricing Utilities', () => {
  describe('calculatePricePerUnit', () => {
    it('should calculate SQM price from BOX price', () => {
      const result = calculatePricePerUnit(15000, 1.44);
      expect(result).toBe(10416.67); // 15000 / 1.44 = 10416.666...
    });

    it('should return stock unit price when conversion factor is 1', () => {
      const result = calculatePricePerUnit(15000, 1);
      expect(result).toBe(15000);
    });

    it('should throw on zero conversion factor', () => {
      expect(() => calculatePricePerUnit(15000, 0)).toThrow('Conversion factor must be positive');
    });
  });

  describe('calculateLineTotal', () => {
    it('should calculate line total without discount', () => {
      const result = calculateLineTotal(2, 15000, 0);
      expect(result).toBe(30000);
    });

    it('should calculate line total with discount', () => {
      const result = calculateLineTotal(2, 15000, 5000);
      expect(result).toBe(25000);
    });

    it('should handle decimal quantities', () => {
      const result = calculateLineTotal(4.32, 10417, 0);
      expect(result).toBe(45001.44); // 4.32 * 10417
    });
  });

  describe('calculateVat', () => {
    it('should calculate VAT at 19.25%', () => {
      const result = calculateVat(45000, 19.25);
      expect(result).toBe(8662.50);
    });

    it('should return 0 for zero-rate VAT', () => {
      const result = calculateVat(45000, 0);
      expect(result).toBe(0);
    });

    it('should handle zero amount', () => {
      const result = calculateVat(0, 19.25);
      expect(result).toBe(0);
    });
  });
});
```

### 4.4 Fraud Rule Unit Tests

```typescript
// packages/fraud-engine/src/rules/cash-shortage.spec.ts
import { describe, it, expect } from 'vitest';
import { CashShortageRule } from './cash-shortage';

describe('CashShortageRule', () => {
  const rule = new CashShortageRule();

  it('should return score 0 when there is no discrepancy', () => {
    const result = rule.evaluate({
      opening_balance: 50000,
      expected_balance: 183500,
      declared_closing_balance: 183500,
    });
    expect(result.score).toBe(0);
    expect(result.triggered).toBe(false);
  });

  it('should return low score for discrepancy under 0.5%', () => {
    const result = rule.evaluate({
      opening_balance: 50000,
      expected_balance: 183500,
      declared_closing_balance: 184000, // 500 XAF discrepancy = 0.27%
    });
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(10);
    expect(result.severity).toBe('low');
  });

  it('should flag critical for discrepancy over 10%', () => {
    const result = rule.evaluate({
      opening_balance: 50000,
      expected_balance: 100000,
      declared_closing_balance: 80000, // 20,000 XAF = 20% discrepancy
    });
    expect(result.score).toBe(25); // Max score
    expect(result.severity).toBe('critical');
  });

  it('should flag critical when absolute discrepancy exceeds 10,000 XAF even at low percentage', () => {
    const result = rule.evaluate({
      opening_balance: 50000,
      expected_balance: 1000000,
      declared_closing_balance: 989000, // 11,000 XAF = 1.1% but > 10,000 XAF absolute
    });
    expect(result.score).toBeGreaterThan(15);
    expect(result.severity).toBe('high');
  });
});
```

## 5. Integration Tests

### 5.1 API Integration Tests

Integration tests use a real PostgreSQL test database and test NestJS controllers end-to-end with HTTP requests.

```typescript
// apps/api/test/integration/sales.integration.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from '../helpers/test-app';
import { seedTestTenant, clearTestData } from '../helpers/db-seed';

describe('Sales API (integration)', () => {
  let app: INestApplication;
  let tenantHeaders: Record<string, string>;
  let testData: { branchId: string; shiftId: string; productId: string; userId: string };

  beforeAll(async () => {
    app = await createTestApp();
    tenantHeaders = await seedTestTenant(app);
    testData = await seedTestData(app, tenantHeaders);
  });

  afterAll(async () => {
    await clearTestData(app, tenantHeaders);
    await app.close();
  });

  describe('POST /api/v1/sales', () => {
    it('should create a sale and return receipt', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set(tenantHeaders)
        .send({
          branch_id: testData.branchId,
          shift_id: testData.shiftId,
          items: [
            {
              product_id: testData.productId,
              unit: 'BOX',
              quantity: 2,
              unit_price: 15000,
              line_discount: 0,
            },
          ],
          payments: [{ payment_type: 'cash', amount: 30000 }],
          discount_amount: 0,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.receipt_number).toBeTruthy();
      expect(response.body.data.sale_status).toBe('completed');
      expect(response.body.data.payment_status).toBe('completed');
      expect(response.body.data.items).toHaveLength(1);
    });

    it('should return 400 when stock is insufficient', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set(tenantHeaders)
        .send({
          branch_id: testData.branchId,
          shift_id: testData.shiftId,
          items: [
            {
              product_id: testData.productId,
              unit: 'BOX',
              quantity: 999999, // Far exceeds available stock
              unit_price: 15000,
              line_discount: 0,
            },
          ],
          payments: [{ payment_type: 'cash', amount: 30000 }],
          discount_amount: 0,
        })
        .expect(400);

      expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('should return 400 when no open shift exists', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set(tenantHeaders)
        .send({
          branch_id: testData.branchId,
          shift_id: '00000000-0000-0000-0000-000000000000', // Non-existent shift
          items: [],
          payments: [],
          discount_amount: 0,
        })
        .expect(400);

      expect(response.body.error.code).toBe('NO_OPEN_SHIFT');
    });

    it('should reject duplicate idempotency key with different body', async () => {
      const idempotencyKey = 'test-idempotency-key-001';

      // First request
      await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set({ ...tenantHeaders, 'X-Idempotency-Key': idempotencyKey })
        .send({
          branch_id: testData.branchId,
          shift_id: testData.shiftId,
          items: [],
          payments: [],
          discount_amount: 0,
        });

      // Second request with same key but different body
      await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set({ ...tenantHeaders, 'X-Idempotency-Key': idempotencyKey })
        .send({
          branch_id: testData.branchId,
          shift_id: testData.shiftId,
          items: [
            {
              product_id: testData.productId,
              unit: 'BOX',
              quantity: 1,
              unit_price: 15000,
              line_discount: 0,
            },
          ],
          payments: [],
          discount_amount: 0,
        })
        .expect(409); // IDEMPOTENCY_REPLAY
    });

    it('should return same response for duplicate idempotency key with same body', async () => {
      const idempotencyKey = 'test-idempotency-key-002';
      const body = {
        branch_id: testData.branchId,
        shift_id: testData.shiftId,
        items: [],
        payments: [],
        discount_amount: 0,
      };

      const first = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set({ ...tenantHeaders, 'X-Idempotency-Key': idempotencyKey })
        .send(body)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set({ ...tenantHeaders, 'X-Idempotency-Key': idempotencyKey })
        .send(body)
        .expect(201);

      expect(second.body.data.id).toBe(first.body.data.id);
    });
  });

  describe('POST /api/v1/shifts/:id/close', () => {
    it('should close a shift and compute reconciliation', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/shifts/${testData.shiftId}/close`)
        .set(tenantHeaders)
        .send({
          closing_balance: 185000,
          cash_breakdown: {
            '10000': 5,
            '5000': 10,
            '2000': 15,
            '1000': 20,
            '500': 10,
            '100': 25,
          },
          notes: 'End of day shift',
        })
        .expect(200);

      expect(response.body.data.status).toBe('closed');
      expect(response.body.data.discrepancy).toBeDefined();
      expect(response.body.data.sale_count).toBeGreaterThanOrEqual(0);
    });
  });
});
```

### 5.2 Sync Engine Integration Tests

The sync engine is tested with a real SQLite database (sql.js) on the client side and PostgreSQL on the server side.

```typescript
// packages/sync-engine/src/sync-engine.integration.spec.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { SyncEngine } from './sync-engine';
import { LocalDatabase } from './local-database';
import { TestSyncServer } from './test-sync-server';
import { v7 as uuidv7 } from 'uuid';

describe('Sync Engine (integration)', () => {
  let localDb: LocalDatabase;
  let syncEngine: SyncEngine;
  let syncServer: TestSyncServer;

  beforeAll(async () => {
    // Start a test sync server (in-memory, mimics the real API)
    syncServer = new TestSyncServer();
    await syncServer.start();
  });

  afterAll(async () => {
    await syncServer.stop();
    if (localDb) await localDb.close();
  });

  beforeEach(async () => {
    // Create fresh local SQLite database for each test
    localDb = await LocalDatabase.create(':memory:');
    syncEngine = new SyncEngine({
      localDb,
      serverUrl: syncServer.url,
      deviceId: uuidv7(),
      branchId: uuidv7(),
    });
  });

  describe('push phase', () => {
    it('should push a pending sale to the server', async () => {
      // Arrange: create a sale in local DB
      const saleId = uuidv7();
      await localDb.execute(`
        INSERT INTO sales (id, tenant_id, branch_id, shift_id, receipt_number,
          subtotal, discount_amount, vat_amount, total_amount, payment_status,
          sale_status, sync_status, server_version, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, datetime('now'))`,
        [saleId, 'tenant-1', syncEngine.branchId, uuidv7(), 'RCP-TEST-001',
         45000, 0, 8662.50, 45000, 'completed', 'completed', 'user-1']
      );

      // Enqueue for sync
      await syncEngine.enqueueOperation('sales', saleId, 'create', {
        id: saleId,
        // ... full record
      });

      // Act: run sync
      const result = await syncEngine.pushChanges();

      // Assert
      expect(result.synced).toBe(1);
      expect(result.failed).toBe(0);

      // Verify the sale is marked as synced locally
      const sale = await localDb.get('SELECT sync_status, server_version FROM sales WHERE id = ?', [saleId]);
      expect(sale.sync_status).toBe('synced');
      expect(sale.server_version).toBeGreaterThan(0);
    });

    it('should handle sync conflicts gracefully', async () => {
      // Arrange: create a sale that conflicts on server
      const saleId = uuidv7();
      syncServer.setConflictResponse(saleId, {
        status: 'conflict',
        conflict_type: 'insufficient_stock',
        message: 'Insufficient stock for product TILE-001',
      });

      await localDb.execute(`
        INSERT INTO sales (...) VALUES (...)`,
        // ... same as above
      );

      await syncEngine.enqueueOperation('sales', saleId, 'create', { /* ... */ });

      // Act
      const result = await syncEngine.pushChanges();

      // Assert
      expect(result.conflicts).toBe(1);
      const sale = await localDb.get('SELECT sync_status FROM sales WHERE id = ?', [saleId]);
      expect(sale.sync_status).toBe('conflict');
    });
  });

  describe('pull phase', () => {
    it('should pull product updates from the server', async () => {
      // Arrange: server has updated products
      const productId = uuidv7();
      syncServer.addChange('products', {
        id: productId,
        name: 'New Tile Product',
        sku: 'TILE-NEW-001',
        updated_at: new Date().toISOString(),
      });

      // Act: pull changes
      const changes = await syncEngine.pullChanges();

      // Assert: product appears in local DB
      const product = await localDb.get('SELECT * FROM products WHERE id = ?', [productId]);
      expect(product).toBeDefined();
      expect(product.name).toBe('New Tile Product');
    });
  });

  describe('full sync cycle', () => {
    it('should complete a full push-pull cycle end-to-end', async () => {
      // Arrange: create offline sales, have server changes
      const saleId = uuidv7();
      // ... create sale locally
      syncServer.addChange('products', { id: uuidv7(), name: 'Updated Product', /* ... */ });
      syncServer.addChange('product_prices', { id: uuidv7(), /* ... */ });

      // Act: run full sync
      await syncEngine.runSync();

      // Assert
      const health = await syncEngine.getHealth();
      expect(health.lastSuccessfulSync).toBeTruthy();
      expect(health.pendingPushCount).toBe(0);
      expect(health.conflictsCount).toBe(0);
    });
  });
});
```

### 5.3 Database Tests (Migrations, Indexes, RLS)

```typescript
// apps/api/test/integration/database.integration.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDbConnection } from '../helpers/db-connection';

describe('Database schema (integration)', () => {
  let db: TestDbConnection;

  beforeAll(async () => {
    db = await TestDbConnection.create();
  });

  afterAll(async () => {
    await db.close();
  });

  it('should have all required tables', async () => {
    const tables = await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tableNames = tables.map((t: any) => t.table_name);
    expect(tableNames).toContain('tenants');
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('sales');
    expect(tableNames).toContain('sale_items');
    expect(tableNames).toContain('payments');
    expect(tableNames).toContain('shifts');
    expect(tableNames).toContain('inventory_movements');
    expect(tableNames).toContain('products');
    expect(tableNames).toContain('product_prices');
    expect(tableNames).toContain('sync_logs');
    expect(tableNames).toContain('fraud_alerts');
  });

  it('should enforce tenant_id on all multi-tenant tables', async () => {
    const tables = await db.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE column_name = 'tenant_id' AND table_schema = 'public'
    `);

    const tenantTables = tables.map((t: any) => t.table_name);
    expect(tenantTables).toContain('users');
    expect(tenantTables).toContain('sales');
    expect(tenantTables).toContain('inventory_movements');
    expect(tenantTables).toContain('products');
    expect(tenantTables).toContain('shifts');
  });

  it('should enforce RLS policies', async () => {
    const rlsTables = await db.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND rowsecurity = true
    `);

    const tablesWithRLS = rlsTables.map((t: any) => t.tablename);
    expect(tablesWithRLS.length).toBeGreaterThan(5);
  });

  it('should partition audit_logs table', async () => {
    const partitions = await db.query(`
      SELECT inhrelid::regclass AS child
      FROM pg_inherits
      WHERE inhparent = 'audit_logs'::regclass
    `);

    expect(partitions.length).toBeGreaterThan(0);
  });

  it('should have the current_stock materialized view', async () => {
    const views = await db.query(`
      SELECT viewname FROM pg_matviews
      WHERE schemaname = 'public'
    `);

    const viewNames = views.map((v: any) => v.viewname);
    expect(viewNames).toContain('current_stock');
  });
});
```

### 5.4 Fraud Engine Integration Tests

```typescript
// packages/fraud-engine/src/fraud-engine.integration.spec.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { FraudEngine } from './fraud-engine';
import { createTestTenantConfig } from './test-helpers';

describe('Fraud Engine (integration)', () => {
  let engine: FraudEngine;
  let tenantConfig: any;

  beforeAll(() => {
    engine = new FraudEngine();
    tenantConfig = createTestTenantConfig({
      tenantId: 'test-tenant',
      overrides: {},
    });
  });

  it('should calculate overall score from multiple rule triggers', async () => {
    const result = await engine.calculateScore({
      shift: {
        opening_balance: 50000,
        expected_balance: 150000,
        declared_closing_balance: 130000, // Cash shortage
      },
      sales: [
        { items: [{ line_discount: 50000, unit_price: 100000, quantity: 1 }] }, // 50% discount
      ],
      voids: [
        { amount: 150000, voided_by_same_cashier: true, voided_at: new Date() },
      ],
      deviceSyncHistory: [
        { offline_duration_minutes: 180, sales_while_offline: 25 },
      ],
    }, tenantConfig, 'test-branch');

    expect(result.totalScore).toBeGreaterThan(30);
    expect(result.severity).toBeDefined();
    expect(result.ruleResults.length).toBeGreaterThan(0);

    // Verify alert generated for moderate+ scores
    if (result.totalScore >= 16) {
      expect(result.alertGenerated).toBe(true);
      expect(result.generatedAlertId).toBeTruthy();
    }
  });

  it('should not generate alert for low scores', async () => {
    const result = await engine.calculateScore({
      shift: {
        opening_balance: 50000,
        expected_balance: 100000,
        declared_closing_balance: 100050, // 0.05% discrepancy
      },
      sales: [],
      voids: [],
      deviceSyncHistory: [],
    }, tenantConfig, 'test-branch');

    expect(result.totalScore).toBeLessThan(16);
    expect(result.alertGenerated).toBe(false);
  });

  it('should respect tenant-specific threshold overrides', async () => {
    const strictConfig = createTestTenantConfig({
      overrides: {
        cash_shortage: { thresholds: { low: 0.001, medium: 0.005, high: 0.01, critical: 0.02 } },
      },
    });

    const result = await engine.calculateScore({
      shift: {
        opening_balance: 50000,
        expected_balance: 100000,
        declared_closing_balance: 99900, // 0.1% — exceeds strict low threshold
      },
      sales: [],
      voids: [],
      deviceSyncHistory: [],
    }, strictConfig, 'test-branch');

    expect(result.totalScore).toBeGreaterThan(0); // Would be 0 with default thresholds
    expect(result.ruleResults[0].triggered).toBe(true);
  });
});
```

## 6. End-to-End Tests

### 6.1 Full Flow E2E Tests

E2E tests exercise the complete system: POS app logic, API, sync engine, and database.

```typescript
// apps/api/test/e2e/pos-full-flow.e2e.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from '../helpers/test-app';
import { seedFullTestEnvironment, clearFullTestEnvironment } from '../helpers/e2e-seed';

describe('POS Full Flow (E2E)', () => {
  let app: INestApplication;
  let ctx: TestContext;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = await seedFullTestEnvironment(app);
  });

  afterAll(async () => {
    await clearFullTestEnvironment(app, ctx);
    await app.close();
  });

  it('should complete a cash sale, update inventory, and reconcile shift', async () => {
    // Step 1: Open shift
    const shiftResponse = await request(app.getHttpServer())
      .post('/api/v1/shifts/open')
      .set(ctx.headers)
      .send({
        branch_id: ctx.branchId,
        opening_balance: 50000,
        notes: 'Test shift',
      })
      .expect(201);

    const shiftId = shiftResponse.body.data.id;
    expect(shiftResponse.body.data.status).toBe('open');

    // Step 2: Make a sale
    const saleResponse = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set(ctx.headers)
      .send({
        branch_id: ctx.branchId,
        shift_id: shiftId,
        items: [
          {
            product_id: ctx.products[0].id,
            unit: 'BOX',
            quantity: 3,
            unit_price: 15000,
            line_discount: 0,
          },
          {
            product_id: ctx.products[1].id,
            unit: 'SQM',
            quantity: 5.0,
            unit_price: 8500,
            line_discount: 1000,
          },
        ],
        payments: [{ payment_type: 'cash', amount: 80000 }],
        discount_amount: 0,
      })
      .expect(201);

    const saleId = saleResponse.body.data.id;
    expect(saleResponse.body.data.sale_status).toBe('completed');

    // Step 3: Verify inventory deduction
    const stockResponse = await request(app.getHttpServer())
      .get('/api/v1/stock')
      .set(ctx.headers)
      .query({
        location_type: 'branch',
        location_id: ctx.branchId,
        product_id: ctx.products[0].id,
      })
      .expect(200);

    // Product 0 had 100 BOX stock, sold 3 → should have ~97
    expect(stockResponse.body.data[0].current_quantity).toBeCloseTo(97, 0);

    // Step 4: Close shift
    const closeResponse = await request(app.getHttpServer())
      .post(`/api/v1/shifts/${shiftId}/close`)
      .set(ctx.headers)
      .send({
        closing_balance: 130000, // 50,000 opening + 80,000 sale
        cash_breakdown: {
          '10000': 8,
          '5000': 6,
          '2000': 10,
          '1000': 10,
          '500': 10,
          '100': 0,
        },
      })
      .expect(200);

    expect(closeResponse.body.data.status).toBe('closed');
    expect(closeResponse.body.data.sale_count).toBe(1);
    expect(Math.abs(closeResponse.body.data.discrepancy)).toBeLessThan(500); // Within threshold

    // Step 5: Verify audit log entries
    const auditResponse = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .set(ctx.headers)
      .query({ resource_type: 'sale', resource_id: saleId })
      .expect(200);

    expect(auditResponse.body.data.length).toBeGreaterThanOrEqual(1);
    expect(auditResponse.body.data[0].action).toBe('sale.created');
  });

  it('should process mobile money payment with async confirmation', async () => {
    // Step 1: Open shift
    const shiftResponse = await request(app.getHttpServer())
      .post('/api/v1/shifts/open')
      .set(ctx.headers)
      .send({
        branch_id: ctx.branchId,
        opening_balance: 0,
        notes: 'MoMo test shift',
      })
      .expect(201);

    const shiftId = shiftResponse.body.data.id;

    // Step 2: Mobile money sale
    const saleResponse = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set(ctx.headers)
      .send({
        branch_id: ctx.branchId,
        shift_id: shiftId,
        items: [
          {
            product_id: ctx.products[0].id,
            unit: 'BOX',
            quantity: 1,
            unit_price: 15000,
            line_discount: 0,
          },
        ],
        payments: [{
          payment_type: 'mtn_momo',
          amount: 15000,
          momo_phone: '237670000000',
        }],
        discount_amount: 0,
      })
      .expect(201);

    const saleId = saleResponse.body.data.id;
    expect(saleResponse.body.data.payment_status).toBe('pending_confirmation');
    expect(saleResponse.body.data.sale_status).toBe('pending');

    // Step 3: Confirm payment via webhook
    const paymentId = saleResponse.body.data.payments[0].id;
    await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/confirm-payment`)
      .set(ctx.headers)
      .send({
        payment_id: paymentId,
        provider: 'mtn',
        transaction_id: 'MTN-TEST-123456',
        confirmed_amount: 15000,
        confirmed_at: new Date().toISOString(),
      })
      .expect(200);

    // Step 4: Verify sale is now complete
    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/sales/${saleId}`)
      .set(ctx.headers)
      .expect(200);

    expect(getResponse.body.data.payment_status).toBe('completed');
    expect(getResponse.body.data.sale_status).toBe('completed');
  });
});
```

### 6.2 Offline-Specific E2E Tests

These tests simulate network disconnection, offline operation, and reconnection.

```typescript
// packages/sync-engine/test/e2e/offline-flow.e2e.spec.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { SyncEngine } from '../../src/sync-engine';
import { LocalDatabase } from '../../src/local-database';
import { TestSyncServer } from '../../src/test-sync-server';
import { NetworkSimulator } from '../../src/test-helpers/network-simulator';
import { v7 as uuidv7 } from 'uuid';

describe('Offline Flow (E2E)', () => {
  let localDb: LocalDatabase;
  let syncEngine: SyncEngine;
  let syncServer: TestSyncServer;
  let network: NetworkSimulator;

  beforeAll(async () => {
    syncServer = new TestSyncServer();
    await syncServer.start();
    network = new NetworkSimulator();
  });

  afterAll(async () => {
    await syncServer.stop();
    if (localDb) await localDb.close();
  });

  beforeEach(async () => {
    localDb = await LocalDatabase.create(':memory:');
    syncEngine = new SyncEngine({
      localDb,
      serverUrl: syncServer.url,
      deviceId: uuidv7(),
      branchId: uuidv7(),
      networkSimulator: network, // Injects network control
    });
  });

  it('should operate fully offline and sync when reconnected', async () => {
    // Phase 1: Disconnect
    network.setOffline(true);
    expect(await network.isOnline()).toBe(false);

    // Phase 2: Process transactions offline
    const offlineSales = [];
    for (let i = 0; i < 5; i++) {
      const saleId = uuidv7();
      await createLocalSale(localDb, saleId, `OFFLINE-RCP-${i}`, 15000);
      await syncEngine.enqueueOperation('sales', saleId, 'create', {
        id: saleId,
        branch_id: syncEngine.branchId,
        total_amount: 15000,
      });
      offlineSales.push(saleId);
    }

    // Verify queue has pending items
    const pendingBefore = await localDb.all(
      "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'"
    );
    expect(pendingBefore[0].count).toBe(5);

    // Phase 3: Attempt sync (should fail — offline)
    const syncAttempt = await syncEngine.runSync();
    expect(syncAttempt.networkError).toBe(true);

    // Phase 4: Reconnect
    network.setOffline(false);
    expect(await network.isOnline()).toBe(true);

    // Phase 5: Sync should succeed now
    const syncResult = await syncEngine.runSync();
    expect(syncResult.synced).toBe(5);
    expect(syncResult.failed).toBe(0);

    // Phase 6: Verify on server
    for (const saleId of offlineSales) {
      const serverRecord = await syncServer.getRecord('sales', saleId);
      expect(serverRecord).toBeDefined();
      expect(serverRecord.total_amount).toBe(15000);
    }

    // Phase 7: Verify local status updated
    const pendingAfter = await localDb.all(
      "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'"
    );
    expect(pendingAfter[0].count).toBe(0);
  });

  it('should detect and resolve sync conflicts after offline period', async () => {
    // Phase 1: Both client and server have version 1 of a product price
    const priceId = uuidv7();
    await syncServer.addSeedData('product_prices', {
      id: priceId,
      product_id: uuidv7(),
      unit: 'BOX',
      selling_price: 15000,
      server_version: 1,
    });

    // Pull seed data
    await syncEngine.pullChanges();

    // Phase 2: Go offline, client changes price
    network.setOffline(true);
    await localDb.execute(
      "UPDATE product_prices SET selling_price = 12000, sync_status = 'pending', server_version = 1 WHERE id = ?",
      [priceId]
    );

    // Phase 3: Server also changes price (while client is offline)
    await syncServer.updateRecord('product_prices', priceId, {
      selling_price: 14000,
      server_version: 2,
    });

    // Phase 4: Reconnect and sync
    network.setOffline(false);
    await syncEngine.runSync();

    // Phase 5: Verify conflict is detected
    const conflicts = await syncServer.getConflicts();
    const priceConflicts = conflicts.filter(c => c.table_name === 'product_prices');
    expect(priceConflicts.length).toBeGreaterThanOrEqual(1);

    // Phase 6: Verify server version (LWW) applied
    const serverPrice = await syncServer.getRecord('product_prices', priceId);
    expect(serverPrice.selling_price).toBe(14000); // Server wins (LWW)
  });

  it('should recover from a crash during sync', async () => {
    // Arrange: Simulate an in-progress sync that was interrupted
    const saleId = uuidv7();
    await createLocalSale(localDb, saleId, 'RCP-CRASH-001', 25000);

    // Simulate crash: operation was started but not completed
    await localDb.execute(`
      INSERT INTO operation_log (operation_name, input_params, status, created_at)
      VALUES ('create_sale', ?, 'started', datetime('now'))`,
      [JSON.stringify({ saleId, amount: 25000 })]
    );

    // Act: Recover from crash (simulates app startup)
    const recovery = await syncEngine.recoverFromCrash();

    // Assert: Operation log is cleaned up
    const incompleteOps = await localDb.all(
      "SELECT * FROM operation_log WHERE status = 'started'"
    );
    expect(incompleteOps.length).toBe(0);

    // The operation should have been rolled back or marked failed
    const failedOps = await localDb.all(
      "SELECT * FROM operation_log WHERE status = 'failed' AND error_message LIKE '%Crash recovery%'"
    );
    expect(failedOps.length).toBeGreaterThanOrEqual(1);
  });

  it('should not duplicate transactions on retry', async () => {
    // Arrange: Create a sale and sync it
    const saleId = uuidv7();
    await createLocalSale(localDb, saleId, 'RCP-DEDUP-001', 30000);
    await syncEngine.enqueueOperation('sales', saleId, 'create', {
      id: saleId, total_amount: 30000,
    });

    // Sync once (succeeds)
    network.setOffline(false);
    await syncEngine.runSync();

    // Simulate: sync queue item wasn't cleaned up (edge case)
    // Re-insert same idempotency key
    const existingKey = await localDb.get(
      'SELECT idempotency_key FROM sync_queue WHERE record_id = ?', [saleId]
    );
    if (existingKey) {
      await localDb.execute(
        "UPDATE sync_queue SET status = 'pending' WHERE id = ?", [existingKey.id]
      );
    }

    // Act: Sync again
    const result = await syncEngine.runSync();

    // Assert: Server received only 1 record (idempotency key dedup)
    const serverSales = await syncServer.getAllRecords('sales');
    const matchingSales = serverSales.filter(s => s.id === saleId);
    expect(matchingSales.length).toBe(1);
  });

  it('should handle prolonged offline period with large backlog', async () => {
    // Arrange: Create 200 offline transactions
    network.setOffline(true);
    const saleCount = 200;
    for (let i = 0; i < saleCount; i++) {
      const saleId = uuidv7();
      await createLocalSale(localDb, saleId, `RCP-BULK-${i}`, 10000 + i);
      await syncEngine.enqueueOperation('sales', saleId, 'create', {
        id: saleId, total_amount: 10000 + i,
      });
    }

    // Verify queue
    const queueSize = await localDb.get(
      "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'"
    );
    expect(queueSize.count).toBe(saleCount);

    // Act: Reconnect and sync
    network.setOffline(false);
    const syncResult = await syncEngine.runSync();

    // Assert: All transactions synced
    expect(syncResult.synced).toBe(saleCount);
    expect(syncResult.failed).toBe(0);

    // Verify server has all records
    const serverSales = await syncServer.getAllRecords('sales');
    expect(serverSales.length).toBe(saleCount);
  });
});

// Helper function
async function createLocalSale(localDb: LocalDatabase, id: string, receiptNumber: string, amount: number) {
  await localDb.execute(`
    INSERT INTO sales (id, tenant_id, branch_id, shift_id, receipt_number,
      subtotal, discount_amount, vat_amount, total_amount, payment_status,
      sale_status, sync_status, server_version, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, datetime('now'))`,
    [id, 'tenant-1', 'branch-1', uuidv7(), receiptNumber,
     amount, 0, amount * 0.1925, amount, 'completed', 'completed', 'user-1']
  );
}
```

## 7. Offline-Specific Testing

### 7.1 Network Loss Simulation

```typescript
// packages/sync-engine/src/test-helpers/network-simulator.ts
export class NetworkSimulator {
  private offline: boolean = false;
  private latency: number = 0; // ms
  private packetLoss: number = 0; // 0–1 probability
  private failurePatterns: Map<string, 'timeout' | 'error' | 'corrupt'> = new Map();

  setOffline(offline: boolean): void {
    this.offline = offline;
  }

  setLatency(ms: number): void {
    this.latency = ms;
  }

  setPacketLoss(probability: number): void {
    this.packetLoss = Math.max(0, Math.min(1, probability));
  }

  addFailurePattern(endpointPattern: string, failure: 'timeout' | 'error' | 'corrupt'): void {
    this.failurePatterns.set(endpointPattern, failure);
  }

  async isOnline(): Promise<boolean> {
    return !this.offline;
  }

  async simulateRequest<T>(endpoint: string, fn: () => Promise<T>): Promise<T> {
    if (this.offline) {
      throw new NetworkError('NETWORK_ERROR', 'No network connection');
    }

    // Simulate latency
    if (this.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latency));
    }

    // Simulate packet loss
    if (Math.random() < this.packetLoss) {
      throw new NetworkError('NETWORK_ERROR', 'Request timed out (simulated packet loss)');
    }

    // Simulate specific failure patterns
    for (const [pattern, failure] of this.failurePatterns) {
      if (endpoint.includes(pattern)) {
        switch (failure) {
          case 'timeout':
            throw new NetworkError('NETWORK_ERROR', 'Request timed out');
          case 'error':
            throw new NetworkError('SERVER_ERROR', 'Internal server error');
          case 'corrupt':
            throw new NetworkError('DATA_CORRUPTION', 'Checksum mismatch');
        }
      }
    }

    return fn();
  }
}
```

**Test scenarios for network simulation:**

| Scenario | Network State | Expected Behavior |
|----------|--------------|-------------------|
| Complete disconnect | Offline at start | App operates fully, all writes to local DB |
| Intermittent connection | Alternating online/offline every 30s | Sync retries on online cycles, no data loss |
| High latency | Latency > 2000ms | Sync continues, UI remains responsive |
| Timeout during sync push | Server endpoint times out | Retry with exponential backoff, no duplicate data |
| Server error during pull | Server returns 500 | Retry, preserve existing local data |
| Connection drops mid-sync | Offline mid-batch | Partial sync items retry, no duplicates |
| Data corruption | Invalid response data | Checksum fails, full re-sync triggered |

### 7.2 Sync Conflict Scenarios

| Scenario | Setup | Expected Resolution |
|----------|-------|-------------------|
| Same product sold at two branches (last unit) | Branch A and B each sell last unit offline | First to sync succeeds, second gets `insufficient_stock` conflict |
| Price changed while offline | Admin changes price server-side, cashier sells at old price offline | Server applies current price, flags for audit |
| Shift closed on another device | Supervisor closes shift while cashier is offline | Offline sales get `shift_already_closed` conflict, assigned to new shift |
| Concurrent shift open attempt | Two cashiers try to open shift on same terminal | Server rejects second, client shows "Shift already open" |
| Product deactivated during offline period | Admin deactivates product, cashier sells it offline | Server rejects sale, cashier must reconcile offline |
| Duplicate receipt number | Two terminals generate same receipt number offline | Server auto-assigns new receipt number on conflict |

### 7.3 Crash Recovery Scenarios

| Scenario | Trigger | Expected Recovery |
|----------|---------|-------------------|
| App crash during sale creation | Power loss mid-transaction | On restart, operation_log shows `started` status → rollback incomplete sale |
| App crash during sync push | Process killed while uploading batch | Sync queue items remain `pending` (never marked `synced`) → retry on next sync |
| App crash during sync pull | Process killed while applying remote changes | Operation log rollback reverts partially applied changes → full re-pull on next sync |
| SQLite corruption | Disk error or improper shutdown | WAL replay on next open, if that fails → restore from local backup |
| Operating system crash | Blue screen / kernel panic | Same as power loss — WAL replay recovers committed transactions |

### 7.4 Duplicated Request Protection Tests

```typescript
// apps/api/test/integration/idempotency.integration.spec.ts
describe('Idempotency (integration)', () => {
  it('should return cached response for exact duplicate request', async () => {
    const key = 'test-idempotent-key';
    const body = { /* sale data */ };

    const first = await request(app).post('/api/v1/sales')
      .set({ ...headers, 'X-Idempotency-Key': key })
      .send(body)
      .expect(201);

    const second = await request(app).post('/api/v1/sales')
      .set({ ...headers, 'X-Idempotency-Key': key })
      .send(body)
      .expect(201);

    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.body.data.receipt_number).toBe(first.body.data.receipt_number);
  });

  it('should return 409 for idempotency key with different request body', async () => {
    const key = 'test-replay-key';

    await request(app).post('/api/v1/sales')
      .set({ ...headers, 'X-Idempotency-Key': key })
      .send({ branch_id: 'uuid-1', items: [], payments: [], discount_amount: 0 })
      .expect(201);

    await request(app).post('/api/v1/sales')
      .set({ ...headers, 'X-Idempotency-Key': key })
      .send({ branch_id: 'uuid-2', items: [], payments: [], discount_amount: 0 })
      .expect(409); // IDEMPOTENCY_REPLAY
  });

  it('should expire idempotency cache after TTL', async () => {
    // Configure TTL to 1 second for testing
    const key = 'test-expiring-key';
    const body = { /* sale data */ };

    await request(app).post('/api/v1/sales')
      .set({ ...headers, 'X-Idempotency-Key': key })
      .send(body)
      .expect(201);

    // Wait for TTL expiry
    await new Promise(r => setTimeout(r, 1100));

    // Same key, same body should now create a new record
    // (This is acceptable — after TTL expiry, idempotency is best-effort)
    // In practice, this only happens if the server is restarted or Redis is cleared
    await request(app).post('/api/v1/sales')
      .set({ ...headers, 'X-Idempotency-Key': key })
      .send(body)
      .expect(201); // Creates new record — acceptable after TTL
  });

  it('should reject sync batch with duplicate idempotency keys', async () => {
    const batchKey = 'sync-batch-key-001';
    const response = await request(app).post('/api/v1/sync/push')
      .set(headers)
      .send({
        device_id: 'device-1',
        branch_id: 'branch-1',
        batch: [
          {
            table: 'sales',
            operation: 'create',
            record: { id: 'sale-1', /* ... */ },
            idempotency_key: batchKey,
          },
          {
            table: 'sales',
            operation: 'create',
            record: { id: 'sale-2', /* ... */ },
            idempotency_key: batchKey, // Duplicate!
          },
        ],
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

## 8. Test Data Management

### 8.1 Test Factories

```typescript
// packages/shared-types/src/test/factories.ts
import { v7 as uuidv7 } from 'uuid';
import { faker } from '@faker-js/faker';

export function buildSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: uuidv7(),
    tenant_id: overrides.tenant_id || uuidv7(),
    branch_id: overrides.branch_id || uuidv7(),
    shift_id: overrides.shift_id || uuidv7(),
    customer_id: null,
    receipt_number: `RCP-${faker.date.recent().toISOString().slice(0, 10).replace(/-/g, '')}-${faker.number.int({ min: 1, max: 999 })}`,
    subtotal: 15000,
    discount_amount: 0,
    discount_reason: null,
    vat_amount: 2887.50,
    total_amount: 15000,
    payment_status: 'completed',
    sale_status: 'completed',
    void_reason: null,
    voided_at: null,
    voided_by: null,
    sync_status: overrides.sync_status || 'synced',
    server_version: 1,
    idempotency_key: uuidv7(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: uuidv7(),
    updated_by: null,
    ...overrides,
  };
}

export function buildSaleItem(overrides: Partial<SaleItem> = {}): SaleItem {
  return {
    id: uuidv7(),
    sale_id: overrides.sale_id || uuidv7(),
    tenant_id: overrides.tenant_id || uuidv7(),
    product_id: overrides.product_id || uuidv7(),
    product_name: faker.commerce.productName(),
    sku: `TILE-${faker.string.alphanumeric(8).toUpperCase()}`,
    unit: 'BOX',
    quantity: faker.number.int({ min: 1, max: 50 }),
    unit_price: faker.number.int({ min: 5000, max: 50000 }),
    line_discount: 0,
    vat_rate: 19.25,
    vat_amount: 0,
    line_total: 0, // Computed after
    stock_unit_quantity: 0, // Computed after
    sync_status: 'synced',
    server_version: 1,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: uuidv7(),
    tenant_id: overrides.tenant_id || uuidv7(),
    sku: `TILE-${faker.string.alphanumeric(6).toUpperCase()}`,
    barcode: faker.string.numeric(13),
    name: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
    category_id: uuidv7(),
    brand: faker.company.name(),
    unit_of_measure: 'SQM',
    stock_unit: 'BOX',
    stock_to_sqm_factor: 1.44,
    stock_to_piece_factor: 10,
    is_active: true,
    is_damage_tracked: true,
    reorder_level: 50,
    reorder_quantity: 100,
    image_url: faker.image.url(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: uuidv7(),
    updated_by: null,
    ...overrides,
  };
}

export function buildShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: uuidv7(),
    tenant_id: overrides.tenant_id || uuidv7(),
    branch_id: overrides.branch_id || uuidv7(),
    cashier_id: overrides.cashier_id || uuidv7(),
    supervisor_id: null,
    opened_at: new Date(Date.now() - 28800000).toISOString(), // 8 hours ago
    closed_at: null,
    opening_balance: 50000,
    closing_balance: null,
    expected_balance: null,
    discrepancy: null,
    discrepancy_reason: null,
    status: 'open',
    sale_count: 0,
    total_sales: 0,
    total_cash: 0,
    total_momo: 0,
    total_other: 0,
    total_expenses: 0,
    total_discounts: 0,
    total_voids: 0,
    notes: null,
    sync_status: 'synced',
    server_version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: uuidv7(),
    updated_by: null,
    ...overrides,
  };
}
```

### 8.2 Database Seeds

```typescript
// apps/api/src/database/seeds/test-seed.ts
import { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import * as bcrypt from 'bcrypt';

export async function seedTestTenant(dataSource: DataSource): Promise<{
  tenantId: string;
  branchId: string;
  warehouseId: string;
  userId: string;
  headers: Record<string, string>;
}> {
  const tenantId = uuidv7();
  const branchId = uuidv7();
  const warehouseId = uuidv7();
  const userId = uuidv7();

  // Create tenant
  await dataSource.query(
    `INSERT INTO tenants (id, name, slug, config, is_active) VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`, '{}', true]
  );

  // Create branch
  await dataSource.query(
    `INSERT INTO branches (id, tenant_id, code, name, city, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [branchId, tenantId, 'TST-001', 'Test Branch Douala', 'Douala', true]
  );

  // Create warehouse
  await dataSource.query(
    `INSERT INTO warehouses (id, tenant_id, code, name, branch_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [warehouseId, tenantId, 'WH-001', 'Main Warehouse', branchId, true]
  );

  // Create user
  const passwordHash = await bcrypt.hash('testpassword123', 12);
  await dataSource.query(
    `INSERT INTO users (id, tenant_id, email, first_name, last_name, password_hash, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, tenantId, 'cashier@test.com', 'Test', 'Cashier', passwordHash, true]
  );

  // Create roles and assign
  const roleId = uuidv7();
  await dataSource.query(
    `INSERT INTO roles (id, tenant_id, name, slug, is_system) VALUES ($1, $2, $3, $4, $5)`,
    [roleId, tenantId, 'Cashier', 'cashier', true]
  );

  await dataSource.query(
    `INSERT INTO user_roles (user_id, role_id, tenant_id) VALUES ($1, $2, $3)`,
    [userId, roleId, tenantId]
  );

  // Create test products
  const productId = uuidv7();
  await dataSource.query(
    `INSERT INTO products (id, tenant_id, sku, barcode, name, unit_of_measure, stock_unit,
      stock_to_sqm_factor, is_active, reorder_level, reorder_quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [productId, tenantId, 'TILE-CERAMIC-60X60', '1234567890123',
     'Ceramic Tile 60x60', 'SQM', 'BOX', 1.44, true, 50, 100]
  );

  // Add price
  await dataSource.query(
    `INSERT INTO product_prices (product_id, tenant_id, branch_id, unit, selling_price, cost_price, min_price, vat_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [productId, tenantId, branchId, 'BOX', 15000, 8500, 9500, 19.25]
  );

  await dataSource.query(
    `INSERT INTO product_prices (product_id, tenant_id, branch_id, unit, selling_price, cost_price, min_price, vat_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [productId, tenantId, branchId, 'SQM', 10417, 8500, 6597, 19.25]
  );

  // Add initial stock (100 BOX in branch)
  await dataSource.query(
    `INSERT INTO inventory_movements (tenant_id, product_id, location_type, location_id,
      movement_type, quantity, unit, unit_quantity, reference_type, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [tenantId, productId, 'branch', branchId, 'purchase_receipt', 100, 'BOX', 100,
     'initial_seed', userId]
  );

  return {
    tenantId,
    branchId,
    warehouseId,
    userId,
    headers: {
      'X-Tenant-ID': tenantId,
      'X-Branch-ID': branchId,
      Authorization: `Bearer test-token`, // Set by auth helper
    },
  };
}
```

### 8.3 Test Tenant Isolation

Each test suite creates its own tenant and data, ensuring test isolation:

```typescript
// apps/api/test/helpers/test-app.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';

export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  await app.init();
  return app;
}
```

```typescript
// apps/api/test/helpers/db-cleaner.ts
export class DatabaseCleaner {
  private tables: string[] = [];

  async listTables(dataSource: DataSource): Promise<void> {
    const result = await dataSource.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('migrations')
      ORDER BY table_name
    `);
    this.tables = result.map((r: any) => r.table_name);
  }

  async clean(dataSource: DataSource): Promise<void> {
    await dataSource.query('SET session_replication_role = replica');
    for (const table of this.tables) {
      await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`);
    }
    await dataSource.query('SET session_replication_role = DEFAULT');
  }
}
```

## 9. CI Integration

### 9.1 CI Pipeline Stages

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    name: Lint & Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check

  typecheck:
    name: TypeScript Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit -- --coverage --coverage.thresholds.lines=80
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-unit
          path: coverage/

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: retailguard_test
          POSTGRES_USER: retailguard
          POSTGRES_PASSWORD: testpassword
          POSTGRES_HOST_AUTH_METHOD: trust
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6380:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Run database migrations
        run: pnpm db:migrate:test
        env:
          DATABASE_URL: postgres://retailguard:testpassword@localhost:5433/retailguard_test
      - name: Run integration tests
        run: pnpm test:integration -- --coverage --coverage.thresholds.lines=75
        env:
          DATABASE_URL: postgres://retailguard:testpassword@localhost:5433/retailguard_test
          REDIS_URL: redis://localhost:6380
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-integration
          path: coverage/

  sync-engine-tests:
    name: Sync Engine Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: retailguard_test
          POSTGRES_USER: retailguard
          POSTGRES_PASSWORD: testpassword
        ports:
          - 5433:5432
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Run sync engine tests
        run: pnpm test:sync-engine -- --coverage
        env:
          DATABASE_URL: postgres://retailguard:testpassword@localhost:5433/retailguard_test

  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: retailguard_test
          POSTGRES_USER: retailguard
          POSTGRES_PASSWORD: testpassword
        ports:
          - 5433:5432
      redis:
        image: redis:7-alpine
        ports:
          - 6380:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: Run database migrations
        run: pnpm db:migrate:test
        env:
          DATABASE_URL: postgres://retailguard:testpassword@localhost:5433/retailguard_test
      - name: Run E2E tests
        run: pnpm test:e2e -- --coverage
        env:
          DATABASE_URL: postgres://retailguard:testpassword@localhost:5433/retailguard_test
          REDIS_URL: redis://localhost:6380

  security-audit:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --prod
      - uses: aquasecurity/trivy-action@master
        with:
          scan-type: fs
          scan-ref: .
          format: sarif
          output: trivy-results.sarif

  build:
    name: Build Check
    runs-on: ubuntu-latest
    needs: [lint, typecheck, unit-tests, integration-tests, security-audit]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

### 9.2 Test Execution Strategy

| Test Type | Frequency | Parallelization | Requirements | Max Duration |
|-----------|-----------|-----------------|--------------|--------------|
| Lint | Every commit | Full parallel | None | 2 min |
| Type check | Every commit | Full parallel | None | 3 min |
| Unit tests | Every commit | Per-package parallel (4 forks) | None | 5 min |
| Integration tests | Every PR | Sharded by package | PostgreSQL + Redis | 10 min |
| Sync engine tests | Every PR | Sequential (shared state) | PostgreSQL | 10 min |
| E2E tests | Every PR, before merge | Sequential | PostgreSQL + Redis | 15 min |
| Security audit | Daily, every PR | Sequential | None | 5 min |
| Full test suite | Before release | As configured above | Full infra | 20 min |

### 9.3 Test Ordering and Isolation

```typescript
// vitest.config.ts — ordering
export default defineConfig({
  test: {
    // Run unit tests first, then integration, then E2E
    sequence: {
      // Files within the same shard run in definition order when sequential
      sequencer: class TestSequencer {
        public sort(files: string[]): string[] {
          // Order: unit → integration → e2e
          const priority: Record<string, number> = {
            spec: 0,       // Unit tests
            integration: 1, // Integration tests
            e2e: 2,        // E2E tests
          };

          return files.sort((a, b) => {
            const aExt = a.split('.').slice(-2, -1)[0];
            const bExt = b.split('.').slice(-2, -1)[0];
            return (priority[aExt] ?? 0) - (priority[bExt] ?? 0);
          });
        },
      },
    },

    // Pool configuration
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 4,
        singleFork: false,
      },
    },

    // Retry flaky tests
    retry: 1,  // Retry once for test stability
  },
});
```

### 9.4 Package.json Scripts

```json
{
  "scripts": {
    "test": "pnpm test:unit && pnpm test:integration && pnpm test:e2e",
    "test:unit": "vitest run --project unit --reporter=verbose",
    "test:integration": "vitest run --project integration --reporter=verbose",
    "test:e2e": "vitest run --project e2e --reporter=verbose",
    "test:sync-engine": "vitest run packages/sync-engine --reporter=verbose",
    "test:fraud-engine": "vitest run packages/fraud-engine --reporter=verbose",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint 'apps/*/src/**/*.ts' 'packages/*/src/**/*.ts' 'services/*/src/**/*.ts'",
    "format": "prettier --write '**/*.ts'",
    "format:check": "prettier --check '**/*.ts'",
    "typecheck": "tsc --noEmit"
  }
}
```

## 10. Limitations

1. **E2E tests are not run on every commit** — Full E2E suite takes ~15 minutes. It runs on every PR and before merge, but not on every push to a feature branch.
2. **Offline POS tests require Electron** — The POS terminal's offline behavior (sql.js, sync engine) is tested in a Node.js environment rather than a full Electron runtime. Tests that require actual Electron IPC (printer, barcode scanner, cash drawer) cannot be automated and must be manually tested.
3. **Mobile money webhook testing** — Testing the MTN MoMo and Orange Money callback webhooks requires either a sandbox API provided by the mobile money operator or a mock server. E2E tests use a mock server; real operator integration is tested in staging.
4. **Performance tests are not covered here** — Load testing and stress testing are documented in the operations manual (`docs/ops/performance-testing.md`), not in this testing strategy document.
5. **Snapshot testing is limited** — UI component snapshot tests are minimal because retail POS UI changes frequently based on customer feedback. We prioritize functional tests over visual regression tests.
6. **No fuzz testing in initial release** — Fuzz testing for input validation edge cases is deferred to a future phase. The Zod validation pipeline provides strong input protection.