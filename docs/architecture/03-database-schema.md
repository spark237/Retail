# Database Schema — RetailGuard

## 1. Design Principles

1. **tenant_id on every table** — Multi-tenant from day one. Every query MUST include `WHERE tenant_id = current_tenant`.
2. **Immutable inventory ledger** — `inventory_movements` is append-only. Never UPDATE, never DELETE. Stock is computed as `SUM(quantity)`.
3. **UUID primary keys** — All tables use UUIDv7 (time-sortable) for primary keys. This enables offline ID generation without collision.
4. **Soft deletes** — No hard DELETE operations. Use `deleted_at` timestamp for logical deletion.
5. **Audit columns** — Every table has `created_at`, `updated_at`, `created_by`, `updated_by`.
6. **Sync metadata** — Every table that syncs offline has `sync_status`, `server_version`, `local_updated_at`.
7. **Pricing single source of truth** — Canonical price exists only for the stock unit (e.g., BOX). Selling in SQM uses conversion factor.

## 2. PostgreSQL Schema

### 2.1 Tenants

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    domain VARCHAR(255),
    config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    subscription_tier VARCHAR(50) NOT NULL DEFAULT 'standard',
    subscription_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_is_active ON tenants(is_active);
```

### 2.2 Users & Authentication

```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    resource VARCHAR(100) NOT NULL,       -- e.g., 'sales', 'inventory', 'users'
    action VARCHAR(50) NOT NULL,          -- e.g., 'create', 'read', 'update', 'delete', 'approve'
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, resource, action)
);

CREATE INDEX idx_permissions_tenant ON permissions(tenant_id);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_tenant ON role_permissions(tenant_id);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    requires_password_change BOOLEAN NOT NULL DEFAULT false,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    last_login_ip INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tenant_active ON users(tenant_id, is_active);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id);

CREATE TABLE user_branches (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, branch_id)
);

CREATE INDEX idx_user_branches_tenant ON user_branches(tenant_id);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    device_id VARCHAR(255),
    device_name VARCHAR(255),
    ip_address INET,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id, tenant_id);
CREATE INDEX idx_refresh_tokens_device ON refresh_tokens(device_id);

CREATE TABLE device_trust (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    public_key TEXT NOT NULL,           -- Ed25519 public key for device auth
    is_trusted BOOLEAN NOT NULL DEFAULT false,
    trusted_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, device_id)
);

CREATE INDEX idx_device_trust_tenant ON device_trust(tenant_id);
```

### 2.3 Branches & Warehouses

```sql
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    region VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(255),
    tax_id VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    pos_timeout_minutes INTEGER NOT NULL DEFAULT 480,  -- 8 hours default shift
    requires_supervisor_override BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_branches_tenant ON branches(tenant_id);

CREATE TABLE warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    region VARCHAR(100),
    phone VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT true,
    branch_id UUID REFERENCES branches(id),  -- Optional: warehouse belongs to a branch
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_warehouses_tenant ON warehouses(tenant_id);
```

### 2.4 Products & Pricing

```sql
CREATE TABLE product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES product_categories(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_product_categories_tenant ON product_categories(tenant_id);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    barcode VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES product_categories(id),
    brand VARCHAR(255),
    unit_of_measure VARCHAR(50) NOT NULL,  -- 'BOX', 'SQM', 'PIECE', 'KG', 'BAG'
    stock_unit VARCHAR(50) NOT NULL,       -- Canonical stock unit, e.g. 'BOX'
    stock_to_sqm_factor DECIMAL(10,6),     -- e.g., 1 BOX = 1.44 SQM
    stock_to_piece_factor DECIMAL(10,6),   -- e.g., 1 BOX = 10 PIECES
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_damage_tracked BOOLEAN NOT NULL DEFAULT true,
    reorder_level DECIMAL(15,3),
    reorder_quantity DECIMAL(15,3),
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    UNIQUE(tenant_id, sku)
);

CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(tenant_id, is_active);

-- Product pricing model: canonical price is for the stock unit (e.g., BOX)
-- Selling in SQM uses conversion factor. NEVER store dual canonical prices.
CREATE TABLE product_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id),  -- NULL = default price for all branches
    unit VARCHAR(50) NOT NULL,               -- Which unit this price is for: 'BOX', 'SQM', 'PIECE'
    selling_price DECIMAL(15,2) NOT NULL,    -- Price in XAF (or local currency)
    cost_price DECIMAL(15,2),                -- Cost price for margin calculation
    min_price DECIMAL(15,2),                 -- Minimum allowed selling price (anti-fraud)
    vat_rate DECIMAL(5,2) NOT NULL DEFAULT 19.25,  -- Cameroon VAT
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ,                    -- NULL = currently active
    is_promotional BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    -- Constraint: one active price per product+unit+branch
    UNIQUE(product_id, tenant_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'), unit, valid_to)
);

CREATE INDEX idx_product_prices_product ON product_prices(product_id, tenant_id);
CREATE INDEX idx_product_prices_branch ON product_prices(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX idx_product_prices_active ON product_prices(valid_to) WHERE valid_to IS NULL;

-- Explain pricing model:
-- stock_unit = 'BOX' (canonical stock unit)
-- selling_price = 15,000 XAF per BOX
-- stock_to_sqm_factor = 1.44 (1 BOX = 1.44 SQM)
-- Price per SQM = 15,000 / 1.44 = 10,417 XAF
-- This is CALCULATED at query time, never stored as a separate canonical price.
-- The product_prices table stores price for the unit being sold (can be BOX or SQM).
-- For SQM: price is stored as 10,417 XAF per SQM (derived from BOX price).
-- The cost_price is always in stock_unit (BOX).
```

### 2.5 Inventory — Immutable Ledger

```sql
-- Current stock is ALWAYS computed as SUM(quantity) FROM inventory_movements
-- This table is IMMUTABLE: INSERT only, no UPDATE, no DELETE
-- Any correction requires a new movement record with a reference to the original
CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location_type VARCHAR(20) NOT NULL CHECK (location_type IN ('branch', 'warehouse')),
    location_id UUID NOT NULL,                                    -- branch_id or warehouse_id
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN (
        'purchase_receipt',     -- Stock received from supplier
        'sale_deduction',       -- Stock deducted from sale
        'transfer_out',         -- Sent to another location
        'transfer_in',          -- Received from another location
        'damage_write_off',     -- Damaged goods written off
        'stock_count_adjustment', -- Physical count adjustment
        'return_from_customer', -- Customer returned goods
        'return_to_supplier',   -- Returned goods to supplier
        'correction'            -- Error correction (references corrected movement)
    )),
    quantity DECIMAL(15,3) NOT NULL,  -- Positive = stock in, Negative = stock out
    unit VARCHAR(50) NOT NULL,        -- Unit of measurement for this movement
    unit_quantity DECIMAL(15,3),      -- Quantity in stock_unit (for conversion tracking)
    reference_type VARCHAR(50),       -- Entity type that triggered this movement
    reference_id UUID,                -- Entity ID (sale_id, transfer_id, etc.)
    correction_id UUID REFERENCES inventory_movements(id),  -- NULL unless correction
    reason TEXT,                      -- Human-readable reason
    batch_number VARCHAR(100),        -- For batch tracking
    expires_at TIMESTAMPTZ,           -- For expiry tracking (adhesives, etc.)
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by UUID NOT NULL REFERENCES users(id),
    sync_status VARCHAR(20) NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('pending', 'synced', 'conflict')),
    server_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- No updated_at — this table is IMMUTABLE
    -- Enforce UNIQUE(id, server_version) for sync tracking
    UNIQUE(id, server_version)
);

-- Critical indexes for inventory queries
CREATE INDEX idx_inventory_movements_tenant ON inventory_movements(tenant_id);
CREATE INDEX idx_inventory_movements_product ON inventory_movements(product_id, tenant_id);
CREATE INDEX idx_inventory_movements_location ON inventory_movements(location_type, location_id, tenant_id);
CREATE INDEX idx_inventory_movements_reference ON inventory_movements(reference_type, reference_id);
CREATE INDEX idx_inventory_movements_recorded ON inventory_movements(recorded_at DESC);
CREATE INDEX idx_inventory_movements_type ON inventory_movements(movement_type);
CREATE INDEX idx_inventory_movements_sync ON inventory_movements(sync_status) WHERE sync_status = 'pending';

-- Materialized view for current stock (refreshed periodically)
-- For critical operations, compute stock directly from movements
CREATE MATERIALIZED VIEW current_stock AS
SELECT
    tenant_id,
    product_id,
    location_type,
    location_id,
    SUM(quantity) AS current_quantity,
    COUNT(*) AS movement_count,
    MAX(recorded_at) AS last_movement_at
FROM inventory_movements
GROUP BY tenant_id, product_id, location_type, location_id;

CREATE UNIQUE INDEX idx_current_stock ON current_stock(tenant_id, product_id, location_type, location_id);
CREATE INDEX idx_current_stock_product ON current_stock(product_id, tenant_id);
```

### 2.6 Sales

```sql
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id),
    shift_id UUID NOT NULL REFERENCES shifts(id),
    customer_id UUID,                                -- NULL for walk-in
    receipt_number VARCHAR(100) NOT NULL,
    subtotal DECIMAL(15,2) NOT NULL,
    discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    discount_reason VARCHAR(255),
    vat_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'pending_confirmation', 'completed', 'refunded', 'voided')),
    sale_status VARCHAR(50) NOT NULL DEFAULT 'completed'
        CHECK (sale_status IN ('pending', 'completed', 'voided', 'flagged')),
    void_reason TEXT,
    voided_at TIMESTAMPTZ,
    voided_by UUID REFERENCES users(id),
    sync_status VARCHAR(20) NOT NULL DEFAULT 'synced'
        CHECK (sync_status IN ('pending', 'synced', 'conflict', 'failed')),
    server_version INTEGER NOT NULL DEFAULT 1,
    idempotency_key VARCHAR(255) UNIQUE,             -- For duplicate request protection
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

CREATE INDEX idx_sales_tenant ON sales(tenant_id);
CREATE INDEX idx_sales_branch ON sales(branch_id, tenant_id);
CREATE INDEX idx_sales_shift ON sales(shift_id);
CREATE INDEX idx_sales_created ON sales(created_at DESC);
CREATE INDEX idx_sales_status ON sales(sale_status);
CREATE INDEX idx_sales_sync ON sales(sync_status) WHERE sync_status = 'pending';
CREATE INDEX idx_sales_receipt ON sales(receipt_number, tenant_id);
CREATE INDEX idx_sales_idempotency ON sales(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,              -- Denormalized for offline
    sku VARCHAR(100) NOT NULL,                       -- Denormalized for offline
    unit VARCHAR(50) NOT NULL,                       -- Unit sold in (e.g., 'BOX', 'SQM')
    quantity DECIMAL(15,3) NOT NULL,
    unit_price DECIMAL(15,2) NOT NULL,
    line_discount DECIMAL(15,2) NOT NULL DEFAULT 0,
    vat_rate DECIMAL(5,2) NOT NULL DEFAULT 19.25,
    vat_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    line_total DECIMAL(15,2) NOT NULL,
    stock_unit_quantity DECIMAL(15,3),               -- Quantity in stock_unit (for inventory deduction)
    sync_status VARCHAR(20) NOT NULL DEFAULT 'synced'
        CHECK (sync_status IN ('pending', 'synced', 'conflict')),
    server_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sale_items_sale ON sale_items(sale_id, tenant_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id, tenant_id);
CREATE INDEX idx_sale_items_sync ON sale_items(sync_status) WHERE sync_status = 'pending';

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payment_type VARCHAR(50) NOT NULL CHECK (payment_type IN (
        'cash', 'mtn_momo', 'orange_money', 'card', 'bank_transfer', 'credit', 'mixed'
    )),
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'XAF',
    reference VARCHAR(255),                          -- Payment reference / transaction ID
    confirmation_status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (confirmation_status IN ('pending', 'pending_confirmation', 'confirmed', 'failed', 'refunded')),
    confirmed_at TIMESTAMPTZ,
    confirmed_by UUID REFERENCES users(id),
    momo_phone VARCHAR(20),                          -- For mobile money
    momo_provider VARCHAR(50),                       -- 'mtn' or 'orange'
    momo_transaction_id VARCHAR(255),                -- Provider transaction ID
    change_amount DECIMAL(15,2) NOT NULL DEFAULT 0,  -- Cash change given
    sync_status VARCHAR(20) NOT NULL DEFAULT 'synced'
        CHECK (sync_status IN ('pending', 'synced', 'conflict')),
    server_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_sale ON payments(sale_id, tenant_id);
CREATE INDEX idx_payments_type ON payments(payment_type);
CREATE INDEX idx_payments_confirmation ON payments(confirmation_status);
CREATE INDEX idx_payments_sync ON payments(sync_status) WHERE sync_status = 'pending';
```

### 2.7 Shifts

```sql
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id),
    cashier_id UUID NOT NULL REFERENCES users(id),
    supervisor_id UUID REFERENCES users(id),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    opening_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
    closing_balance DECIMAL(15,2),
    expected_balance DECIMAL(15,2),                  -- Calculated from sales
    discrepancy DECIMAL(15,2),                       -- closing_balance - expected_balance
    discrepancy_reason TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'closed', 'flagged', 'reconciled')),
    sale_count INTEGER NOT NULL DEFAULT 0,
    total_sales DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_cash DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_momo DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_other DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_expenses DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_discounts DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_voids DECIMAL(15,2) NOT NULL DEFAULT 0,
    notes TEXT,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'synced'
        CHECK (sync_status IN ('pending', 'synced', 'conflict')),
    server_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

CREATE INDEX idx_shifts_tenant ON shifts(tenant_id);
CREATE INDEX idx_shifts_branch ON shifts(branch_id, tenant_id);
CREATE INDEX idx_shifts_cashier ON shifts(cashier_id);
CREATE INDEX idx_shifts_status ON shifts(status);
CREATE INDEX idx_shifts_opened ON shifts(opened_at DESC);
CREATE INDEX idx_shifts_sync ON shifts(sync_status) WHERE sync_status = 'pending';
```

### 2.8 Expenses

```sql
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id),
    shift_id UUID REFERENCES shifts(id),
    expense_category VARCHAR(100) NOT NULL CHECK (expense_category IN (
        'petty_cash', 'transport', 'utilities', 'maintenance', 'supplies',
        'staff_meals', 'other'
    )),
    amount DECIMAL(15,2) NOT NULL,
    description TEXT NOT NULL,
    receipt_image_url TEXT,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'synced'
        CHECK (sync_status IN ('pending', 'synced', 'conflict')),
    server_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

CREATE INDEX idx_expenses_tenant ON expenses(tenant_id);
CREATE INDEX idx_expenses_branch ON expenses(branch_id, tenant_id);
CREATE INDEX idx_expenses_shift ON expenses(shift_id);
CREATE INDEX idx_expenses_created ON expenses(created_at DESC);
CREATE INDEX idx_expenses_sync ON expenses(sync_status) WHERE sync_status = 'pending';
```

### 2.9 Damage Reports

```sql
CREATE TABLE damage_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id),
    warehouse_id UUID REFERENCES warehouses(id),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity DECIMAL(15,3) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    damage_type VARCHAR(100) NOT NULL CHECK (damage_type IN (
        'broken', 'cracked', 'water_damage', 'chipping', 'packaging_damage',
        'manufacturing_defect', 'storage_damage', 'transport_damage', 'other'
    )),
    description TEXT NOT NULL,
    photo_urls TEXT[],                               -- Array of photo URLs
    estimated_loss DECIMAL(15,2),
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending_review', 'approved', 'rejected', 'written_off')),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'synced'
        CHECK (sync_status IN ('pending', 'synced', 'conflict')),
    server_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

CREATE INDEX idx_damage_reports_tenant ON damage_reports(tenant_id);
CREATE INDEX idx_damage_reports_location ON damage_reports(
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000')
);
CREATE INDEX idx_damage_reports_status ON damage_reports(status);
CREATE INDEX idx_damage_reports_sync ON damage_reports(sync_status) WHERE sync_status = 'pending';
```

### 2.10 Audit Logs

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,                    -- e.g., 'sale.created', 'shift.closed', 'user.login'
    resource_type VARCHAR(100) NOT NULL,             -- e.g., 'sale', 'shift', 'user'
    resource_id UUID,
    details JSONB,                                   -- Free-form details about the action
    ip_address INET,
    user_agent TEXT,
    device_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partitioned by month for performance
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, tenant_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, tenant_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
```

### 2.11 Sync Logs

```sql
CREATE TABLE sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    branch_id UUID REFERENCES branches(id),
    sync_type VARCHAR(20) NOT NULL CHECK (sync_type IN ('push', 'pull', 'full')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'partial')),
    records_synced INTEGER NOT NULL DEFAULT 0,
    records_failed INTEGER NOT NULL DEFAULT 0,
    conflicts_detected INTEGER NOT NULL DEFAULT 0,
    conflicts_resolved INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    duration_ms INTEGER,
    client_version VARCHAR(50),
    idempotency_key VARCHAR(255),
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_logs_tenant ON sync_logs(tenant_id, created_at DESC);
CREATE INDEX idx_sync_logs_device ON sync_logs(device_id, tenant_id);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);
```

### 2.12 Fraud Alerts

```sql
CREATE TABLE fraud_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id),
    alert_type VARCHAR(100) NOT NULL CHECK (alert_type IN (
        'cash_shortage',
        'inventory_mismatch',
        'excessive_discounts',
        'suspicious_offline_behavior',
        'unauthorized_adjustment',
        'long_unsynced_shift',
        'frequent_sale_voids',
        'unusual_sale_pattern',
        'price_override',
        'negative_stock'
    )),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    score DECIMAL(5,2) NOT NULL,                     -- 0.00 to 100.00
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    details JSONB,                                   -- Contextual data for the alert
    status VARCHAR(50) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive')),
    assigned_to UUID REFERENCES users(id),
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fraud_alerts_tenant ON fraud_alerts(tenant_id, created_at DESC);
CREATE INDEX idx_fraud_alerts_branch ON fraud_alerts(branch_id, tenant_id);
CREATE INDEX idx_fraud_alerts_type ON fraud_alerts(alert_type);
CREATE INDEX idx_fraud_alerts_severity ON fraud_alerts(severity);
CREATE INDEX idx_fraud_alerts_status ON fraud_alerts(status);
```

### 2.13 Warehouse Transfers

```sql
CREATE TABLE warehouse_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    reference_number VARCHAR(100) NOT NULL,
    from_location_type VARCHAR(20) NOT NULL CHECK (from_location_type IN ('branch', 'warehouse')),
    from_location_id UUID NOT NULL,
    to_location_type VARCHAR(20) NOT NULL CHECK (to_location_type IN ('branch', 'warehouse')),
    to_location_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending', 'in_transit', 'completed', 'cancelled', 'partially_received')),
    requested_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    received_by UUID REFERENCES users(id),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    in_transit_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'synced'
        CHECK (sync_status IN ('pending', 'synced', 'conflict')),
    server_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_warehouse_transfers_tenant ON warehouse_transfers(tenant_id);
CREATE INDEX idx_warehouse_transfers_from ON warehouse_transfers(from_location_type, from_location_id);
CREATE INDEX idx_warehouse_transfers_to ON warehouse_transfers(to_location_type, to_location_id);
CREATE INDEX idx_warehouse_transfers_status ON warehouse_transfers(status);
CREATE INDEX idx_warehouse_transfers_sync ON warehouse_transfers(sync_status) WHERE sync_status = 'pending';

CREATE TABLE transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES warehouse_transfers(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity DECIMAL(15,3) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    received_quantity DECIMAL(15,3),                 -- NULL until received
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_transit', 'received', 'partially_received', 'cancelled')),
    sync_status VARCHAR(20) NOT NULL DEFAULT 'synced'
        CHECK (sync_status IN ('pending', 'synced', 'conflict')),
    server_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transfer_items_transfer ON transfer_items(transfer_id, tenant_id);
CREATE INDEX idx_transfer_items_product ON transfer_items(product_id, tenant_id);
CREATE INDEX idx_transfer_items_sync ON transfer_items(sync_status) WHERE sync_status = 'pending';
```

## 3. SQLite Schema (Offline/POS database)

The SQLite schema mirrors the PostgreSQL schema with these differences:
1. No foreign key constraints (enforced at application layer)
2. Additional sync metadata columns
3. No materialized views
4. No partitioning
5. Executed via `sql.js` WASM module

### 3.1 SQLite-Specific Additions

```sql
-- SQLite-specific pragmas set at connection time
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;
PRAGMA foreign_keys = ON;
PRAGMA auto_vacuum = INCREMENTAL;

-- Sync metadata table (tracks what needs to sync)
CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,                    -- UUID of the record
    operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
    payload TEXT NOT NULL,                       -- JSON payload of the record
    idempotency_key TEXT NOT NULL UNIQUE,        -- UUID for dedup
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'syncing', 'synced', 'failed', 'conflict')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sync_queue_status ON sync_queue(status);
CREATE INDEX idx_sync_queue_table ON sync_queue(table_name);
CREATE INDEX idx_sync_queue_idempotency ON sync_queue(idempotency_key);

-- Local settings key-value store
CREATE TABLE local_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sync cursor tracking
CREATE TABLE sync_cursors (
    table_name TEXT PRIMARY KEY,
    last_synced_at TEXT,                         -- ISO timestamp
    last_server_version INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cache for product images (blobs stored as base64)
CREATE TABLE product_images (
    product_id TEXT PRIMARY KEY,
    image_data TEXT,                             -- Base64 encoded
    image_url TEXT,
    last_fetched_at TEXT,
    expires_at TEXT
);

-- Offline operation log (for crash recovery)
CREATE TABLE operation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_name TEXT NOT NULL,                 -- e.g., 'create_sale', 'create_movement'
    input_params TEXT NOT NULL,                   -- JSON of input parameters
    status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed')),
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);
```

### 3.2 SQLite Table Modifications

For each synced table, add these sync-specific columns (in addition to the PostgreSQL columns):

```sql
-- Example: SQLite version of sales table
CREATE TABLE sales (
    -- All columns from PostgreSQL schema (same names, same types mapped to SQLite)
    id TEXT PRIMARY KEY,                          -- UUID in SQLite
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    shift_id TEXT NOT NULL,
    -- ... all other columns from PostgreSQL ...
    
    -- SQLite-specific sync columns
    sync_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (sync_status IN ('pending', 'synced', 'conflict', 'failed')),
    server_version INTEGER NOT NULL DEFAULT 0,    -- 0 until first sync
    server_id TEXT,                                -- Server-assigned ID (same as local ID on first sync)
    local_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_deleted INTEGER NOT NULL DEFAULT 0,         -- Soft delete flag
    conflict_resolution TEXT,                      -- JSON of conflict resolution data
    UNIQUE(id, server_version)                     -- Same constraint as PostgreSQL
);

-- Note: SQLite does not support ENUM types. Use TEXT with CHECK constraints.
-- Note: SQLite does not support UUID type. Use TEXT.
-- Note: SQLite does not support JSONB. Use TEXT for JSON fields.
-- Note: SQLite does not support ARRAY types. Use TEXT (JSON array) for arrays.
```

## 4. Pricing Model Explanation

**Canonical price = stock unit price. Never store dual canonical prices.**

### Example:
- Product: "Ceramic Tile 60x60"
- stock_unit: "BOX"
- 1 BOX = 1.44 SQM (stock_to_sqm_factor = 1.44)
- Canonical price: 15,000 XAF per BOX (cost_price = 8,500 XAF per BOX)
- SQM price: 15,000 / 1.44 = 10,417 XAF per SQM (calculated at query time)

### How it works:
1. **Stock is tracked in canonical unit (BOX).** The `inventory_movements` `quantity` column is always in the canonical unit.
2. **Sales can be in any unit.** The `sale_items.unit` column records what unit the customer bought in. The `stock_unit_quantity` column converts to stock unit for inventory deduction.
3. **Prices are stored per unit.** `product_prices` stores the selling price for each unit (BOX, SQM, PIECE). The cost_price is always in stock_unit.
4. **Conversion factors are on the product.** `stock_to_sqm_factor` and `stock_to_piece_factor` allow conversion at query time.

### Constraints:
- `cost_price` in `product_prices` is always in `stock_unit` (e.g., per BOX)
- `selling_price` in `product_prices` is for the specified `unit`
- There is exactly ONE way to calculate the cost of goods sold: cost_price * (quantity / stock_unit_quantity)

## 5. Row-Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
-- ... repeat for all tables

-- Tenant isolation policy
CREATE POLICY tenant_isolation ON users
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation ON sales
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation ON inventory_movements
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Branch-level isolation (users can only see their branch data)
CREATE POLICY branch_isolation ON sales
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id')::UUID
        AND (
            branch_id = current_setting('app.current_branch_id')::UUID
            OR current_setting('app.user_role') IN ('super_admin', 'admin', 'manager')
        )
    );
```

## 6. Error Handling

### Transaction integrity for sales:

```sql
-- Sales are atomic: all-or-nothing
BEGIN;
    -- 1. Insert sale record
    INSERT INTO sales (...) VALUES (...);
    -- 2. Insert sale items
    INSERT INTO sale_items (...) VALUES (...);
    -- 3. Insert inventory movement (deduction)
    INSERT INTO inventory_movements (
        tenant_id, product_id, location_type, location_id,
        movement_type, quantity, unit, unit_quantity,
        reference_type, reference_id, recorded_by
    ) VALUES (
        p_tenant_id, p_product_id, 'branch', p_branch_id,
        'sale_deduction', -p_quantity, p_unit, p_stock_unit_quantity,
        'sale', p_sale_id, p_user_id
    );
    -- 4. Update shift totals
    UPDATE shifts SET
        sale_count = sale_count + 1,
        total_sales = total_sales + p_total,
        total_cash = total_cash + CASE WHEN p_payment_type = 'cash' THEN p_amount ELSE 0 END,
        total_momo = total_momo + CASE WHEN p_payment_type IN ('mtn_momo', 'orange_money') THEN p_amount ELSE 0 END
    WHERE id = p_shift_id;
    -- 5. Insert payment
    INSERT INTO payments (...) VALUES (...);
COMMIT;

-- On any error, ROLLBACK and return error
-- If payment is mobile money and confirmation fails, sale stays as 'pending_confirmation'
-- Inventory is reserved (not deducted) until payment is confirmed
```

## 7. Index Strategy Summary

| Table | Indexes | Purpose |
|-------|---------|---------|
| inventory_movements | tenant_id, product_id, location, reference_type, recorded_at, sync_status | Fast stock queries, audit trail, sync |
| sales | tenant_id, branch_id, shift_id, created_at, status, sync_status | POS queries, reports, sync |
| sale_items | sale_id, product_id, sync_status | Sale detail, inventory deduction |
| payments | sale_id, confirmation_status, sync_status | Payment tracking |
| shifts | branch_id, cashier_id, status, opened_at | Shift management |
| users | tenant_id, email | Login, RBAC |
| audit_logs | tenant_id + created_at, user_id, action, resource | Auditing (partitioned) |
| sync_logs | tenant_id + created_at, device_id, status | Sync monitoring |
| fraud_alerts | tenant_id + created_at, branch_id, severity, status | Fraud monitoring |
| product_prices | product_id, branch_id, valid_to | Price lookup |
| products | tenant_id, barcode, sku, category_id | Product lookup |