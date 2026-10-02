# Folder Structure — RetailGuard Monorepo

## Top-Level Structure

```
retailguard/
├── apps/                          # Application entry points
│   ├── pos/                       # Electron POS terminal app
│   ├── admin/                     # Web admin dashboard
│   ├── mobile/                    # React Native mobile app (future)
│   └── api/                       # NestJS API server
├── packages/                      # Shared libraries
│   ├── shared-types/              # TypeScript types shared across all apps
│   ├── database/                  # Database schemas, migrations, seeds
│   ├── sync-engine/               # Sync protocol (client + server)
│   ├── fraud-engine/              # Fraud detection rules engine
│   ├── ui-kit/                    # Shared React components
│   └── utils/                     # Shared utilities
├── services/                      # Standalone microservices
│   ├── sync-worker/               # Background sync processing worker
│   ├── fraud-worker/              # Background fraud analysis worker
│   ├── notification-worker/       # Email/SMS notification worker
│   └── backup-worker/             # Database backup worker
├── infrastructure/                # Infrastructure as code
│   ├── docker/                    # Dockerfiles
│   ├── terraform/                 # Terraform configs
│   ├── kubernetes/                # K8s manifests
│   └── scripts/                   # Deployment scripts
├── docs/                          # Documentation
│   ├── architecture/              # Architecture decision records
│   ├── api/                       # API documentation
│   ├── ops/                       # Operations manual
│   └── guides/                    # User guides
├── config/                        # Configuration
│   ├── eslint/                    # ESLint configs
│   ├── tsconfig/                  # TypeScript configs
│   ├── jest/                      # Jest configs
│   └── commitlint/               # Commit linting
├── .github/                       # GitHub CI/CD
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── cd-staging.yml
│   │   └── cd-production.yml
│   └── CODEOWNERS
├── .cursor/                       # Cursor AI rules
│   └── rules/
├── turbo.json                     # Turborepo configuration
├── package.json                   # Root package.json
├── pnpm-workspace.yaml            # pnpm workspace config
├── tsconfig.json                  # Root TypeScript config
├── docker-compose.yml             # Local development
├── docker-compose.prod.yml        # Production deployment
├── .env.example                   # Environment variables template
├── .gitignore
├── README.md
└── LICENSE
```

## Application Structure

### `apps/pos/` — Electron POS Terminal

```
apps/pos/
├── src/
│   ├── main/                      # Electron main process
│   │   ├── index.ts
│   │   ├── ipc-handlers.ts        # IPC handlers for native features
│   │   ├── printer.ts             # Receipt printing
│   │   ├── barcode-scanner.ts     # Barcode scanner integration
│   │   ├── database.ts            # SQLite database lifecycle
│   │   ├── cash-drawer.ts         # Cash drawer control
│   │   ├── updater.ts             # Auto-update mechanism
│   │   └── sync-scheduler.ts      # Background sync scheduler
│   ├── renderer/                  # React renderer process
│   │   ├── components/            # UI components
│   │   │   ├── pos/               # POS-specific components
│   │   │   │   ├── ProductGrid.tsx
│   │   │   │   ├── Cart.tsx
│   │   │   │   ├── CartItem.tsx
│   │   │   │   ├── PaymentModal.tsx
│   │   │   │   ├── ReceiptPreview.tsx
│   │   │   │   ├── ShiftPanel.tsx
│   │   │   │   ├── SyncIndicator.tsx
│   │   │   │   └── OfflineBadge.tsx
│   │   │   ├── inventory/         # Inventory screens
│   │   │   │   ├── StockView.tsx
│   │   │   │   ├── TransferForm.tsx
│   │   │   │   ├── DamageReport.tsx
│   │   │   │   └── StockCount.tsx
│   │   │   ├── reports/           # Reports & analytics
│   │   │   │   ├── DailyReport.tsx
│   │   │   │   ├── CashReconciliation.tsx
│   │   │   │   └── ExpenseReport.tsx
│   │   │   ├── shared/            # Shared components
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Table.tsx
│   │   │   │   ├── FormField.tsx
│   │   │   │   ├── LoadingSpinner.tsx
│   │   │   │   ├── ErrorBoundary.tsx
│   │   │   │   └── Toast.tsx
│   │   │   └── layout/            # Layout components
│   │   │       ├── AppLayout.tsx
│   │   │       ├── Sidebar.tsx
│   │   │       ├── Header.tsx
│   │   │       └── SyncStatusBar.tsx
│   │   ├── hooks/                 # React hooks
│   │   │   ├── useOnlineStatus.ts
│   │   │   ├── useSync.ts
│   │   │   ├── useShift.ts
│   │   │   ├── useInventory.ts
│   │   │   ├── useSales.ts
│   │   │   ├── useAuth.ts
│   │   │   └── useLocalDatabase.ts
│   │   ├── stores/                # Zustand stores
│   │   │   ├── authStore.ts
│   │   │   ├── shiftStore.ts
│   │   │   ├── cartStore.ts
│   │   │   ├── syncStore.ts
│   │   │   └── uiStore.ts
│   │   ├── lib/                   # Library code
│   │   │   ├── database.ts        # SQLite database client
│   │   │   ├── sync.ts            # Sync engine client
│   │   │   ├── api.ts             # API client (fetch wrapper)
│   │   │   ├── auth.ts            # Auth helpers
│   │   │   ├── printer.ts         # Printer client
│   │   │   ├── barcode.ts         # Barcode utilities
│   │   │   ├── pricing.ts         # Price calculation
│   │   │   └── currency.ts        # Currency formatting
│   │   ├── pages/                 # Route pages
│   │   │   ├── LoginPage.tsx
│   │   │   ├── PosPage.tsx
│   │   │   ├── InventoryPage.tsx
│   │   │   ├── TransfersPage.tsx
│   │   │   ├── ReportsPage.tsx
│   │   │   ├── ExpensesPage.tsx
│   │   │   ├── SettingsPage.tsx
│   │   │   └── ShiftPage.tsx
│   │   ├── App.tsx
│   │   ├── routes.ts
│   │   └── index.tsx
│   └── preload/                   # Electron preload scripts
│       ├── index.ts
│       └── context-bridge.ts
├── electron-builder.yml           # Electron builder config
├── vite.config.ts                 # Vite config
├── tsconfig.json
└── package.json
```

### `apps/admin/` — Web Admin Dashboard

```
apps/admin/
├── src/
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── SalesChart.tsx
│   │   │   ├── InventoryOverview.tsx
│   │   │   ├── FraudAlerts.tsx
│   │   │   ├── SyncHealth.tsx
│   │   │   ├── BranchPerformance.tsx
│   │   │   └── KpiCards.tsx
│   │   ├── settings/
│   │   │   ├── BranchSettings.tsx
│   │   │   ├── ProductManagement.tsx
│   │   │   ├── UserManagement.tsx
│   │   │   ├── RoleManagement.tsx
│   │   │   └── PricingRules.tsx
│   │   ├── reports/
│   │   │   ├── SalesReport.tsx
│   │   │   ├── InventoryReport.tsx
│   │   │   ├── AuditLog.tsx
│   │   │   ├── FraudReport.tsx
│   │   │   └── SyncReport.tsx
│   │   └── shared/
│   │       ├── DataTable.tsx
│   │       ├── FilterPanel.tsx
│   │       ├── ExportButton.tsx
│   │       └── DateRangePicker.tsx
│   ├── hooks/
│   ├── lib/
│   ├── pages/
│   ├── stores/
│   ├── App.tsx
│   └── main.tsx
├── tsconfig.json
├── vite.config.ts
└── package.json
```

### `apps/api/` — NestJS API Server

```
apps/api/
├── src/
│   ├── main.ts                    # Entry point
│   ├── app.module.ts              # Root module
│   ├── common/                    # Cross-cutting concerns
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   ├── roles.decorator.ts
│   │   │   ├── tenant.decorator.ts
│   │   │   └── public.decorator.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   ├── roles.guard.ts
│   │   │   └── tenant.guard.ts
│   │   ├── interceptors/
│   │   │   ├── logging.interceptor.ts
│   │   │   ├── transform.interceptor.ts
│   │   │   └── timeout.interceptor.ts
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── pipes/
│   │   │   ├── validation.pipe.ts
│   │   │   └── parse-uuid.pipe.ts
│   │   ├── interfaces/
│   │   │   ├── i-user.ts
│   │   │   ├── i-request.ts
│   │   │   └── i-paginated.ts
│   │   └── constants/
│   │       ├── roles.constant.ts
│   │       └── error-codes.constant.ts
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── strategies/
│   │   │   │   ├── jwt.strategy.ts
│   │   │   │   └── jwt-refresh.strategy.ts
│   │   │   ├── dto/
│   │   │   │   ├── login.dto.ts
│   │   │   │   ├── refresh-token.dto.ts
│   │   │   │   ├── device-trust.dto.ts
│   │   │   │   └── change-password.dto.ts
│   │   │   └── entities/
│   │   │       ├── user.entity.ts
│   │   │       ├── refresh-token.entity.ts
│   │   │       └── device-trust.entity.ts
│   │   ├── pos/
│   │   │   ├── pos.module.ts
│   │   │   ├── pos.controller.ts
│   │   │   ├── pos.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-sale.dto.ts
│   │   │   │   ├── create-payment.dto.ts
│   │   │   │   ├── void-sale.dto.ts
│   │   │   │   └── create-shift.dto.ts
│   │   │   ├── entities/
│   │   │   │   ├── sale.entity.ts
│   │   │   │   ├── sale-item.entity.ts
│   │   │   │   ├── payment.entity.ts
│   │   │   │   └── shift.entity.ts
│   │   │   └── validators/
│   │   │       └── sale.validator.ts
│   │   ├── inventory/
│   │   │   ├── inventory.module.ts
│   │   │   ├── inventory.controller.ts
│   │   │   ├── inventory.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-movement.dto.ts
│   │   │   │   ├── transfer.dto.ts
│   │   │   │   ├── damage-report.dto.ts
│   │   │   │   └── stock-count.dto.ts
│   │   │   ├── entities/
│   │   │   │   ├── product.entity.ts
│   │   │   │   ├── product-price.entity.ts
│   │   │   │   ├── inventory-movement.entity.ts
│   │   │   │   ├── branch-stock.entity.ts
│   │   │   │   └── warehouse-stock.entity.ts
│   │   │   └── validators/
│   │   │       └── movement.validator.ts
│   │   ├── sync/
│   │   │   ├── sync.module.ts
│   │   │   ├── sync.controller.ts
│   │   │   ├── sync.service.ts
│   │   │   ├── sync.processor.ts      # Bull queue processor
│   │   │   ├── dto/
│   │   │   │   ├── push-batch.dto.ts
│   │   │   │   ├── pull-request.dto.ts
│   │   │   │   └── conflict-resolution.dto.ts
│   │   │   └── entities/
│   │   │       ├── sync-log.entity.ts
│   │   │       └── sync-conflict.entity.ts
│   │   ├── fraud/
│   │   │   ├── fraud.module.ts
│   │   │   ├── fraud.controller.ts
│   │   │   ├── fraud.service.ts
│   │   │   ├── fraud.rules.ts          # Rule definitions
│   │   │   ├── fraud.scorer.ts         # Scoring engine
│   │   │   ├── dto/
│   │   │   │   └── fraud-alert.dto.ts
│   │   │   └── entities/
│   │   │       └── fraud-alert.entity.ts
│   │   ├── analytics/
│   │   │   ├── analytics.module.ts
│   │   │   ├── analytics.controller.ts
│   │   │   ├── analytics.service.ts
│   │   │   └── dto/
│   │   │       ├── sales-report.dto.ts
│   │   │       ├── inventory-report.dto.ts
│   │   │       └── dashboard.dto.ts
│   │   ├── admin/
│   │   │   ├── admin.module.ts
│   │   │   ├── admin.controller.ts
│   │   │   ├── admin.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-user.dto.ts
│   │   │   │   ├── update-user.dto.ts
│   │   │   │   ├── create-branch.dto.ts
│   │   │   │   ├── create-product.dto.ts
│   │   │   │   ├── create-role.dto.ts
│   │   │   │   └── tenant-config.dto.ts
│   │   │   └── entities/
│   │   │       ├── branch.entity.ts
│   │   │       ├── warehouse.entity.ts
│   │   │       ├── role.entity.ts
│   │   │       └── permission.entity.ts
│   │   └── expenses/
│   │       ├── expenses.module.ts
│   │       ├── expenses.controller.ts
│   │       ├── expenses.service.ts
│   │       ├── dto/
│   │       │   └── create-expense.dto.ts
│   │       └── entities/
│   │           └── expense.entity.ts
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── database.providers.ts
│   │   ├── migrations/
│   │   ├── seeds/
│   │   └── views/
│   │       ├── current-stock.sql
│   │       └── daily-sales-summary.sql
│   └── config/
│       ├── config.module.ts
│       ├── config.service.ts
│       ├── database.config.ts
│       ├── redis.config.ts
│       └── auth.config.ts
├── test/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
└── package.json
```

## Justification of Structure

### Monorepo (Turborepo + pnpm)

**Why monorepo instead of polyrepo:**
- Shared types between frontend and backend are critical for sync protocol
- Single version of dependencies (no drift between frontend and backend versions)
- Atomic commits across packages (e.g., schema change + migration + API change + frontend update)
- Single CI pipeline with dependency-aware builds
- Turborepo provides caching, parallel execution, and dependency graph awareness

### `apps/` vs `packages/` vs `services/` Separation

- **`apps/`**: Runable applications with their own entry points. Each app is independently deployable.
- **`packages/`**: Shared libraries. `shared-types` is the single source of truth for TypeScript interfaces, DTOs, and enums. `database` contains the canonical schema definitions (both PostgreSQL and SQLite).
- **`services/`**: Standalone microservices that run as separate processes. These are separated because they have different scaling requirements and failure domains.

### Why `apps/api/` is a module-based NestJS app

The module structure mirrors the business domains: auth, POS, inventory, sync, fraud, analytics, admin, expenses. Each module contains:
- `*.controller.ts` — HTTP route handlers
- `*.service.ts` — Business logic
- `dto/` — Data Transfer Objects (validated by NestJS pipes)
- `entities/` — TypeORM entity definitions
- `validators/` — Domain-specific validation logic

This separation ensures that each domain can be developed, tested, and reasoned about independently.

### Why `apps/pos/` has main/renderer separation

The Electron architecture requires:
- **main process**: Native OS access (printer, barcode scanner, file system, auto-updater)
- **renderer process**: React UI (runs in a Chromium context)
- **preload**: Bridge layer that exposes select main-process APIs to the renderer via `contextBridge`

This separation is mandatory for security — the renderer should never have direct access to Node.js APIs.

### Why `packages/sync-engine/` is a shared package

The sync protocol is used by:
1. **POS app** (client-side sync engine)
2. **API server** (server-side sync processing)
3. **Mobile app** (future, same sync protocol)

By centralizing the sync logic in a shared package, we ensure the same conflict detection, batch formats, and protocol versioning across all clients and servers.

### Why `services/fraud-worker/` is separate

Fraud detection is CPU-intensive (rule evaluation, scoring, historical analysis). Running it as a separate worker:
- Doesn't block POS API requests
- Can scale independently (more workers during peak hours)
- Can be pulled into a separate queue for processing
- Failure in fraud detection doesn't affect POS operations