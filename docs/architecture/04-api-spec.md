# API Specification — RetailGuard

## 1. Protocol Choice: REST

**Chosen: REST over GraphQL**

**Rationale:**
- The sync protocol is inherently batch-oriented (push/pull batches of records)
- REST maps naturally to sync operations: `POST /sync/push`, `GET /sync/pull`
- Simpler caching, rate limiting, and monitoring
- GraphQL's query complexity analysis and resolver batching add overhead for a sync-heavy system
- Tooling: OpenAPI/Swagger for documentation, NestJS Swagger plugin for auto-generation

**API Base URL:** `https://api.retailguard.com/v1` (production) / `http://localhost:3000/api/v1` (development)

**All responses wrap in:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 100,
    "total": 500,
    "server_time": "2026-07-18T12:00:00Z"
  },
  "error": null
}
```

**Error response:**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Insufficient stock for product 'Ceramic Tile 60x60'. Available: 5, Requested: 10",
    "details": {
      "product_id": "uuid",
      "available": 5,
      "requested": 10
    }
  }
}
```

**Standard headers:**
```
Authorization: Bearer <jwt_token>
X-Tenant-ID: <tenant_uuid>
X-Branch-ID: <branch_uuid>
X-Device-ID: <device_uuid>
X-Idempotency-Key: <uuid>
Content-Type: application/json
```

**Rate limiting:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1626600000
```

## 2. Endpoints

### 2.1 Authentication

#### POST /auth/login
Authenticate user and return JWT tokens.

```
Request:
{
  "email": "user@example.com",
  "password": "securePassword123",
  "device_id": "uuid",
  "device_name": "POS Terminal #1"
}

Response 200:
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "dGhpcyBpcyBhIHJlZnJl...",
  "expires_in": 900,           // 15 minutes
  "refresh_expires_in": 2592000,  // 30 days
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "roles": ["cashier"],
    "permissions": ["sales.create", "sales.read", "inventory.read"],
    "branches": ["branch_uuid"],
    "tenant_id": "tenant_uuid"
  }
}

Response 401:
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}

Response 423:
{
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account locked due to too many failed attempts. Try again in 15 minutes."
  }
}
```

#### POST /auth/refresh
Refresh access token using refresh token.

```
Request:
{
  "refresh_token": "dGhpcyBpcyBhIHJlZnJl...",
  "device_id": "uuid"
}

Response 200:
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "bmV3IHJlZnJl...",
  "expires_in": 900,
  "refresh_expires_in": 2592000
}

Response 401:
{
  "error": {
    "code": "INVALID_REFRESH_TOKEN",
    "message": "Refresh token expired or revoked"
  }
}
```

#### POST /auth/logout
Revoke all tokens for this device.

```
Request:
{
  "refresh_token": "dGhpcyBpcyBhIHJlZnJl...",
  "device_id": "uuid"
}

Response 204: No Content
```

#### POST /auth/device/trust
Register a device as trusted for offline auth.

```
Request:
{
  "device_id": "uuid",
  "device_name": "POS Terminal #1",
  "public_key": "base64_encoded_ed25519_public_key",
  "device_info": {
    "os": "Windows 10",
    "app_version": "1.0.0",
    "hardware_id": "some_unique_id"
  }
}

Response 200:
{
  "device_id": "uuid",
  "is_trusted": true,
  "trusted_at": "2026-07-18T12:00:00Z",
  "expires_at": "2026-08-17T12:00:00Z",
  "challenge": "base64_challenge"   // Signed by device to complete trust
}
```

#### POST /auth/device/verify
Verify a device for offline authentication.

```
Request:
{
  "device_id": "uuid",
  "user_id": "uuid",
  "signature": "base64_signed_challenge"
}

Response 200:
{
  "verified": true,
  "offline_token": "eyJhbGciOiJSUzI1NiIs...",   // Short-lived token for offline auth
  "expires_at": "2026-07-18T14:00:00Z"
}
```

#### POST /auth/change-password
Change password (requires current password).

```
Request:
{
  "current_password": "oldPassword123",
  "new_password": "newSecurePassword456"
}

Response 200:
{
  "message": "Password changed successfully",
  "requires_relogin": true
}
```

### 2.2 Shifts

#### POST /shifts/open
Open a new cash register shift.

```
Request:
{
  "branch_id": "uuid",
  "opening_balance": 50000.00,
  "notes": "Morning shift"
}

Response 201:
{
  "id": "uuid",
  "branch_id": "uuid",
  "cashier_id": "uuid",
  "opened_at": "2026-07-18T06:00:00Z",
  "opening_balance": 50000.00,
  "status": "open"
}

Error 400:
{
  "error": {
    "code": "SHIFT_ALREADY_OPEN",
    "message": "An open shift already exists for this cashier at this branch"
  }
}
```

#### POST /shifts/{id}/close
Close a shift and perform cash reconciliation.

```
Request:
{
  "closing_balance": 185000.00,
  "cash_breakdown": {
    "10000": 5,       // 5 x 10,000 XAF notes
    "5000": 10,       // 10 x 5,000 XAF notes
    "2000": 15,       // 15 x 2,000 XAF notes
    "1000": 20,       // 20 x 1,000 XAF notes
    "500": 10,        // 10 x 500 XAF coins
    "100": 25         // 25 x 100 XAF coins
  },
  "notes": "End of day shift"
}

Response 200:
{
  "id": "uuid",
  "status": "closed",
  "closed_at": "2026-07-18T14:00:00Z",
  "opening_balance": 50000.00,
  "closing_balance": 185000.00,
  "expected_balance": 183500.00,
  "discrepancy": 1500.00,
  "discrepancy_percentage": 0.82,
  "sale_count": 42,
  "total_sales": 145000.00,
  "total_cash": 120000.00,
  "total_momo": 25000.00,
  "total_expenses": 8500.00,
  "total_discounts": 3200.00,
  "total_voids": 0.00
}

Error 400:
{
  "error": {
    "code": "DISCREPANCY_EXCEEDS_THRESHOLD",
    "message": "Cash discrepancy of 1,500 XAF (0.82%) exceeds threshold of 0.5%. Supervisor approval required."
  }
}
```

#### GET /shifts
List shifts with optional filters.

```
Query params:
  ?branch_id=uuid
  &cashier_id=uuid
  &status=open|closed|flagged|reconciled
  &from=2026-07-01T00:00:00Z
  &to=2026-07-18T23:59:59Z
  &page=1
  &limit=50

Response 200:
{
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 15
  }
}
```

#### GET /shifts/{id}
Get shift details with all associated sales and expenses.

### 2.3 POS (Sales)

#### POST /sales
Create a new sale. This is the core POS operation.

```
Request:
{
  "branch_id": "uuid",
  "shift_id": "uuid",
  "customer_id": "uuid",              // optional
  "items": [
    {
      "product_id": "uuid",
      "unit": "SQM",
      "quantity": 4.32,
      "unit_price": 10417.00,
      "line_discount": 0
    }
  ],
  "payments": [
    {
      "payment_type": "cash",
      "amount": 45000.00
    }
  ],
  "discount_amount": 0,
  "discount_reason": null,
  "notes": "Customer requested delivery"
}

Response 201 (synchronous for cash/credit):
{
  "id": "uuid",
  "receipt_number": "RCP-20260718-0042",
  "branch_id": "uuid",
  "shift_id": "uuid",
  "subtotal": 45000.00,
  "discount_amount": 0,
  "vat_amount": 8662.50,
  "total_amount": 45000.00,
  "payment_status": "completed",
  "sale_status": "completed",
  "items": [ ... ],
  "payments": [
    {
      "id": "uuid",
      "payment_type": "cash",
      "amount": 45000.00,
      "change_amount": 0,
      "confirmation_status": "confirmed"
    }
  ],
  "created_at": "2026-07-18T12:30:00Z"
}

Response 201 (for mobile money - async):
{
  "id": "uuid",
  "receipt_number": "RCP-20260718-0043",
  "payment_status": "pending_confirmation",
  "sale_status": "pending",
  "payments": [
    {
      "id": "uuid",
      "payment_type": "mtn_momo",
      "amount": 25000.00,
      "confirmation_status": "pending_confirmation",
      "momo_phone": "237670000000"
    }
  ],
  "message": "Waiting for mobile money confirmation. Sale will complete once payment is confirmed."
}

Error 400:
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Insufficient stock for product 'Ceramic Tile 60x60'. Available: 5 BOX, Requested: 10 BOX"
  }
}

Error 400:
{
  "error": {
    "code": "NO_OPEN_SHIFT",
    "message": "No open shift found for this cashier. Please open a shift first."
  }
}

Error 400:
{
  "error": {
    "code": "PRICE_EXCEEDS_MIN_PRICE",
    "message": "Selling price 8,000 XAF is below minimum price 9,500 XAF for product 'Ceramic Tile 60x60'"
  }
}
```

#### POST /sales/{id}/confirm-payment
Confirm a mobile money payment (called by webhook or manual confirmation).

```
Request:
{
  "payment_id": "uuid",
  "provider": "mtn",
  "transaction_id": "MTN-1234567890",
  "confirmed_amount": 25000.00,
  "confirmed_at": "2026-07-18T12:31:00Z"
}

Response 200:
{
  "id": "uuid",
  "payment_status": "completed",
  "sale_status": "completed",
  "payments": [
    {
      "id": "uuid",
      "confirmation_status": "confirmed",
      "momo_transaction_id": "MTN-1234567890"
    }
  ]
}
```

#### POST /sales/{id}/void
Void a sale (requires supervisor approval).

```
Request:
{
  "reason": "Customer returned items - wrong size",
  "supervisor_id": "uuid",
  "supervisor_password": "supervisorPass"
}

Response 200:
{
  "id": "uuid",
  "sale_status": "voided",
  "voided_at": "2026-07-18T14:00:00Z",
  "voided_by": "uuid"
}

Error 403:
{
  "error": {
    "code": "SUPERVISOR_REQUIRED",
    "message": "Sale void requires supervisor approval"
  }
}

Error 400:
{
  "error": {
    "code": "SALE_ALREADY_VOIDED",
    "message": "Sale has already been voided"
  }
}
```

#### GET /sales/{id}
Get sale details.

#### GET /sales
List sales with filters.

```
Query params:
  ?branch_id=uuid
  &shift_id=uuid
  &cashier_id=uuid
  &sale_status=completed|voided|flagged|pending
  &payment_status=completed|pending|pending_confirmation|refunded
  &from=2026-07-01T00:00:00Z
  &to=2026-07-18T23:59:59Z
  &page=1
  &limit=50
  &sync_status=synced|pending|conflict
```

### 2.4 Inventory

#### GET /products
List active products with current stock.

```
Query params:
  ?branch_id=uuid
  &category_id=uuid
  &search=ceramic tile
  &include_inactive=false
  &page=1
  &limit=100

Response 200:
{
  "data": [
    {
      "id": "uuid",
      "sku": "TILE-60X60-CERAMIC",
      "barcode": "1234567890123",
      "name": "Ceramic Tile 60x60",
      "unit_of_measure": "SQM",
      "stock_unit": "BOX",
      "stock_to_sqm_factor": 1.44,
      "current_stock": 84.50,         // In stock_unit (BOX)
      "current_stock_sqm": 121.68,    // Calculated: 84.50 * 1.44
      "prices": [
        { "unit": "BOX", "selling_price": 15000.00, "cost_price": 8500.00 },
        { "unit": "SQM", "selling_price": 10417.00 }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 100, "total": 250 }
}
```

#### GET /products/{id}
Get product details with full price history and stock movements.

#### GET /stock
Get current stock for a branch or warehouse.

```
Query params:
  ?location_type=branch|warehouse
  &location_id=uuid
  &product_id=uuid              // optional, filter by product
  &below_reorder=false          // optional, filter items below reorder level

Response 200:
{
  "data": [
    {
      "product_id": "uuid",
      "product_name": "Ceramic Tile 60x60",
      "sku": "TILE-60X60-CERAMIC",
      "stock_unit": "BOX",
      "current_quantity": 84.50,
      "reorder_level": 50,
      "reorder_quantity": 100,
      "needs_reorder": false,
      "last_movement_at": "2026-07-18T12:30:00Z"
    }
  ]
}
```

#### GET /inventory/movements
List inventory movements (immutable ledger).

```
Query params:
  ?product_id=uuid
  &location_type=branch|warehouse
  &location_id=uuid
  &movement_type=sale_deduction|purchase_receipt|transfer_out|transfer_in|damage_write_off|stock_count_adjustment|correction
  &from=2026-07-01T00:00:00Z
  &to=2026-07-18T23:59:59Z
  &page=1
  &limit=100

Response 200:
{
  "data": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "product_name": "Ceramic Tile 60x60",
      "location_type": "branch",
      "location_id": "uuid",
      "movement_type": "sale_deduction",
      "quantity": -4.32,
      "unit": "SQM",
      "unit_quantity": -3.00,       // In stock_unit (BOX): -4.32 / 1.44 = -3
      "reference_type": "sale",
      "reference_id": "uuid",
      "recorded_by": "uuid",
      "recorded_by_name": "John Doe",
      "recorded_at": "2026-07-18T12:30:00Z"
    }
  ]
}
```

### 2.5 Warehouse Transfers

#### POST /transfers
Create a new warehouse/branch transfer request.

```
Request:
{
  "from_location_type": "warehouse",
  "from_location_id": "uuid",
  "to_location_type": "branch",
  "to_location_id": "uuid",
  "items": [
    {
      "product_id": "uuid",
      "quantity": 50,
      "unit": "BOX"
    }
  ],
  "notes": "Restock for end of month promotion"
}

Response 201:
{
  "id": "uuid",
  "reference_number": "TRF-20260718-001",
  "status": "pending",
  "items": [ ... ],
  "requested_by": "uuid",
  "requested_at": "2026-07-18T10:00:00Z"
}
```

#### PUT /transfers/{id}/approve
Approve a transfer request.

```
Request:
{
  "approved_by": "uuid"
}

Response 200:
{
  "status": "in_transit",
  "approved_by": "uuid",
  "approved_at": "2026-07-18T10:30:00Z"
}
```

#### PUT /transfers/{id}/receive
Confirm receipt of a transfer.

```
Request:
{
  "received_by": "uuid",
  "items": [
    {
      "id": "transfer_item_id",
      "received_quantity": 48,
      "notes": "2 boxes damaged in transit"
    }
  ]
}

Response 200:
{
  "status": "completed",
  "items": [
    {
      "product": "Ceramic Tile 60x60",
      "requested": 50,
      "received": 48,
      "damaged": 2
    }
  ]
}
```

#### GET /transfers
List transfers with filters.

### 2.6 Damages

#### POST /damages
Report damaged goods.

```
Request:
{
  "branch_id": "uuid",           // optional
  "warehouse_id": "uuid",         // optional
  "product_id": "uuid",
  "quantity": 3,
  "unit": "BOX",
  "damage_type": "cracked",
  "description": "Tiles cracked during unloading",
  "estimated_loss": 45000.00
}

Response 201:
{
  "id": "uuid",
  "status": "pending_review",
  "movement_id": "uuid"           // Inventory movement created (damage_write_off)
}
```

### 2.7 Expenses

#### POST /expenses
Record an expense.

```
Request:
{
  "branch_id": "uuid",
  "shift_id": "uuid",
  "expense_category": "transport",
  "amount": 5000.00,
  "description": "Customer delivery transport"
}

Response 201:
{
  "id": "uuid",
  "expense_category": "transport",
  "amount": 5000.00,
  "status": "pending_approval"
}
```

### 2.8 Cash Reconciliation

#### POST /shifts/{id}/reconcile
Final reconciliation with supervisor sign-off.

```
Request:
{
  "closing_balance": 185000.00,
  "cash_breakdown": { ... },
  "discrepancy_reason": "Rounding difference",
  "supervisor_id": "uuid",
  "supervisor_password": "supervisorPass"
}

Response 200:
{
  "status": "reconciled",
  "discrepancy": 0.00,
  "reconciled_at": "2026-07-18T14:30:00Z"
}
```

### 2.9 Fraud

#### GET /fraud/alerts
List fraud alerts.

```
Query params:
  ?branch_id=uuid
  &alert_type=cash_shortage|inventory_mismatch|excessive_discounts|suspicious_offline_behavior|unauthorized_adjustment|long_unsynced_shift|frequent_sale_voids
  &severity=low|medium|high|critical
  &status=open|investigating|resolved|false_positive
  &from=2026-07-01T00:00:00Z
  &to=2026-07-18T23:59:59Z
  &page=1
  &limit=50
```

#### PUT /fraud/alerts/{id}
Update fraud alert status.

```
Request:
{
  "status": "investigating",
  "assigned_to": "uuid"
}

or

{
  "status": "resolved",
  "resolution_notes": "Investigated - customer returned items, cashier followed procedure"
}
```

### 2.10 Analytics

#### GET /analytics/dashboard
Dashboard KPIs for a branch.

```
Query params:
  ?branch_id=uuid
  &period=today|yesterday|this_week|this_month|custom
  &from=2026-07-01T00:00:00Z
  &to=2026-07-18T23:59:59Z

Response 200:
{
  "kpis": {
    "total_sales": 1450000.00,
    "sale_count": 420,
    "average_transaction": 3452.38,
    "total_cash": 980000.00,
    "total_momo": 375000.00,
    "total_other": 95000.00,
    "total_discounts": 28500.00,
    "total_voids": 12000.00,
    "total_expenses": 85000.00,
    "gross_margin": 32.5,
    "fraud_alerts": 3
  },
  "trends": {
    "sales_by_day": [ ... ],
    "sales_by_hour": [ ... ],
    "top_products": [ ... ],
    "payment_methods": [
      { "type": "cash", "percentage": 67.6 },
      { "type": "mtn_momo", "percentage": 20.7 },
      { "type": "orange_money", "percentage": 5.2 },
      { "type": "other", "percentage": 6.5 }
    ]
  },
  "sync_health": {
    "devices_online": 5,
    "devices_offline": 2,
    "pending_sync_count": 45,
    "last_sync_at": "2026-07-18T12:00:00Z",
    "sync_failures_24h": 3
  }
}
```

#### GET /analytics/sales-report
Detailed sales report with export options.

#### GET /analytics/inventory-report
Inventory movement report.

### 2.11 Sync

#### POST /sync/push
Push batch of local changes to server.

```
Request:
{
  "device_id": "uuid",
  "branch_id": "uuid",
  "batch": [
    {
      "table": "sales",
      "operation": "create",
      "record": { ... },          // Full record data
      "idempotency_key": "uuid",
      "local_updated_at": "2026-07-18T12:00:00Z"
    },
    {
      "table": "inventory_movements",
      "operation": "create",
      "record": { ... },
      "idempotency_key": "uuid",
      "local_updated_at": "2026-07-18T12:00:00Z"
    }
  ]
}

Response 200:
{
  "results": [
    {
      "idempotency_key": "uuid",
      "status": "created",
      "server_id": "uuid",
      "server_version": 1
    },
    {
      "idempotency_key": "uuid",
      "status": "conflict",
      "conflict_type": "insufficient_stock",
      "message": "Insufficient stock for product 'Ceramic Tile 60x60'",
      "resolution": "rejected"
    }
  ],
  "server_time": "2026-07-18T12:01:00Z"
}
```

#### GET /sync/pull
Pull changes from server since last sync.

```
Query params:
  ?device_id=uuid
  &branch_id=uuid
  &since=2026-07-18T11:00:00Z
  &tables=products,product_prices,users,branches,inventory_movements

Response 200:
{
  "changes": {
    "products": {
      "updated": [ ... ],
      "deleted": [ "uuid1", "uuid2" ]
    },
    "product_prices": {
      "updated": [ ... ]
    },
    "inventory_movements": {
      "created": [ ... ]
    }
  },
  "server_time": "2026-07-18T12:01:00Z",
  "has_more": false
}
```

#### GET /sync/status
Get sync status for a device.

```
Response 200:
{
  "device_id": "uuid",
  "last_sync_at": "2026-07-18T12:00:00Z",
  "pending_push_count": 0,
  "pending_pull_count": 5,
  "conflicts_count": 0,
  "is_online": true,
  "server_version": 15342
}
```

### 2.12 Admin (Management)

#### CRUD for each entity:
- `GET/POST/PUT/DELETE /admin/users`
- `GET/POST/PUT/DELETE /admin/roles`
- `GET/POST/PUT/DELETE /admin/branches`
- `GET/POST/PUT/DELETE /admin/warehouses`
- `GET/POST/PUT/DELETE /admin/products`
- `GET/POST /admin/products/{id}/prices`
- `GET /admin/audit-logs`
- `GET /admin/sync-logs`
- `GET/PUT /admin/settings`

## 3. Error Codes

| Code | HTTP Status | Description |
|------|------------|-------------|
| VALIDATION_ERROR | 400 | Request body validation failed |
| INSUFFICIENT_STOCK | 400 | Not enough stock for sale |
| SHIFT_ALREADY_OPEN | 400 | Cashier already has open shift |
| NO_OPEN_SHIFT | 400 | No open shift found |
| SALE_ALREADY_VOIDED | 400 | Sale already voided |
| DISCREPANCY_EXCEEDS_THRESHOLD | 400 | Cash discrepancy too large |
| PRICE_EXCEEDS_MIN_PRICE | 400 | Price below minimum allowed |
| PAYMENT_FAILED | 400 | Payment processing failed |
| INVALID_CREDENTIALS | 401 | Invalid email/password |
| INVALID_REFRESH_TOKEN | 401 | Refresh token expired/revoked |
| TOKEN_EXPIRED | 401 | Access token expired |
| DEVICE_NOT_TRUSTED | 401 | Device not trusted for offline auth |
| FORBIDDEN | 403 | Insufficient permissions |
| SUPERVISOR_REQUIRED | 403 | Supervisor approval needed |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource conflict (e.g., duplicate) |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |
| SYNC_CONFLICT | 409 | Sync conflict detected |
| TENANT_MISMATCH | 403 | Tenant ID mismatch |
| IDEMPOTENCY_REPLAY | 409 | Idempotency key already used with different data |

## 4. Rate Limiting

| Endpoint | Rate | Scope |
|----------|------|-------|
| POST /auth/login | 5/minute | Per IP |
| POST /auth/refresh | 10/minute | Per device |
| POST /auth/device/* | 3/minute | Per device |
| POST /sales | 60/minute | Per branch |
| POST /sync/push | 30/minute | Per device |
| GET /sync/pull | 60/minute | Per device |
| GET /analytics/* | 30/minute | Per user |
| All other endpoints | 100/minute | Per user |

## 5. Idempotency

Every mutation endpoint supports `X-Idempotency-Key` header.

**Idempotency key generation (client):**
```typescript
// Generate a unique key per operation
const idempotencyKey = uuidv7(); // Time-sortable UUID

// For sync batches, generate per-record
const recordKey = `${tableName}:${recordId}:${operation}`;
const idempotencyKey = crypto.createHash('sha256').update(recordKey).digest('hex');
```

**Server behavior:**
1. Check if idempotency key exists in `idempotency_cache` (Redis, TTL 24 hours)
2. If exists and same request → return cached response
3. If exists and different request → return 409 Conflict
4. If not exists → process request, store result in cache