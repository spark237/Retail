-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "domain" VARCHAR(255),
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "subscription_tier" VARCHAR(50) NOT NULL DEFAULT 'standard',
    "subscription_expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "requires_password_change" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "last_login_ip" INET,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "user_branches" (
    "user_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_branches_pkey" PRIMARY KEY ("user_id","branch_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "device_id" VARCHAR(255),
    "device_name" VARCHAR(255),
    "ip_address" INET,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_trust" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "device_id" VARCHAR(255) NOT NULL,
    "device_name" VARCHAR(255),
    "public_key" TEXT NOT NULL,
    "is_trusted" BOOLEAN NOT NULL DEFAULT false,
    "trusted_at" TIMESTAMPTZ,
    "last_used_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_trust_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" TEXT,
    "city" VARCHAR(100),
    "region" VARCHAR(100),
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "tax_id" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "pos_timeout_minutes" INTEGER NOT NULL DEFAULT 480,
    "requires_supervisor_override" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" TEXT,
    "city" VARCHAR(100),
    "region" VARCHAR(100),
    "phone" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "branch_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sku" VARCHAR(100) NOT NULL,
    "barcode" VARCHAR(100),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category_id" UUID,
    "brand" VARCHAR(255),
    "unit_of_measure" VARCHAR(50) NOT NULL,
    "stock_unit" VARCHAR(50) NOT NULL,
    "stock_to_sqm_factor" DECIMAL(10,6),
    "stock_to_piece_factor" DECIMAL(10,6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_damage_tracked" BOOLEAN NOT NULL DEFAULT true,
    "reorder_level" DECIMAL(15,3),
    "reorder_quantity" DECIMAL(15,3),
    "image_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "unit" VARCHAR(50) NOT NULL,
    "selling_price" DECIMAL(15,2) NOT NULL,
    "cost_price" DECIMAL(15,2),
    "min_price" DECIMAL(15,2),
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 19.25,
    "valid_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ,
    "is_promotional" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_type" VARCHAR(20) NOT NULL,
    "location_id" UUID NOT NULL,
    "movement_type" VARCHAR(50) NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "unit_quantity" DECIMAL(15,3),
    "reference_type" VARCHAR(50),
    "reference_id" UUID,
    "correction_id" UUID,
    "reason" TEXT,
    "batch_number" VARCHAR(100),
    "expires_at" TIMESTAMPTZ,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" UUID NOT NULL,
    "sync_status" VARCHAR(20) NOT NULL DEFAULT 'synced',
    "server_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "customer_id" UUID,
    "receipt_number" VARCHAR(100) NOT NULL,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount_reason" VARCHAR(255),
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL,
    "payment_status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "sale_status" VARCHAR(50) NOT NULL DEFAULT 'completed',
    "void_reason" TEXT,
    "voided_at" TIMESTAMPTZ,
    "voided_by" UUID,
    "sync_status" VARCHAR(20) NOT NULL DEFAULT 'synced',
    "server_version" INTEGER NOT NULL DEFAULT 1,
    "idempotency_key" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" VARCHAR(255) NOT NULL,
    "sku" VARCHAR(100) NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "line_discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 19.25,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(15,2) NOT NULL,
    "stock_unit_quantity" DECIMAL(15,3),
    "sync_status" VARCHAR(20) NOT NULL DEFAULT 'synced',
    "server_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_type" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'XAF',
    "reference" VARCHAR(255),
    "confirmation_status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "confirmed_at" TIMESTAMPTZ,
    "confirmed_by" UUID,
    "momo_phone" VARCHAR(20),
    "momo_provider" VARCHAR(50),
    "momo_transaction_id" VARCHAR(255),
    "change_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sync_status" VARCHAR(20) NOT NULL DEFAULT 'synced',
    "server_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "supervisor_id" UUID,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,
    "opening_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "closing_balance" DECIMAL(15,2),
    "expected_balance" DECIMAL(15,2),
    "discrepancy" DECIMAL(15,2),
    "discrepancy_reason" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'open',
    "sale_count" INTEGER NOT NULL DEFAULT 0,
    "total_sales" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_cash" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_momo" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_other" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_expenses" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_discounts" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_voids" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sync_status" VARCHAR(20) NOT NULL DEFAULT 'synced',
    "server_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "shift_id" UUID,
    "expense_category" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "description" TEXT NOT NULL,
    "receipt_image_url" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "sync_status" VARCHAR(20) NOT NULL DEFAULT 'synced',
    "server_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "damage_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "warehouse_id" UUID,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "damage_type" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "photo_urls" TEXT[],
    "estimated_loss" DECIMAL(15,2),
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending_review',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "review_notes" TEXT,
    "sync_status" VARCHAR(20) NOT NULL DEFAULT 'synced',
    "server_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "damage_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" UUID,
    "details" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "device_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "device_id" VARCHAR(255) NOT NULL,
    "branch_id" UUID,
    "sync_type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "records_synced" INTEGER NOT NULL DEFAULT 0,
    "records_failed" INTEGER NOT NULL DEFAULT 0,
    "conflicts_detected" INTEGER NOT NULL DEFAULT 0,
    "conflicts_resolved" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "client_version" VARCHAR(50),
    "idempotency_key" VARCHAR(255),
    "started_at" TIMESTAMPTZ NOT NULL,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "alert_type" VARCHAR(100) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "details" JSONB,
    "status" VARCHAR(50) NOT NULL DEFAULT 'open',
    "assigned_to" UUID,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ,
    "resolution_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "fraud_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "reference_number" VARCHAR(100) NOT NULL,
    "from_location_type" VARCHAR(20) NOT NULL,
    "from_location_id" UUID NOT NULL,
    "to_location_type" VARCHAR(20) NOT NULL,
    "to_location_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "received_by" UUID,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ,
    "in_transit_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "notes" TEXT,
    "sync_status" VARCHAR(20) NOT NULL DEFAULT 'synced',
    "server_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "warehouse_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transfer_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "received_quantity" DECIMAL(15,3),
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "sync_status" VARCHAR(20) NOT NULL DEFAULT 'synced',
    "server_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_slug_idx" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_is_active_idx" ON "tenants"("is_active");

-- CreateIndex
CREATE INDEX "roles_tenant_id_idx" ON "roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_slug_key" ON "roles"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "permissions_tenant_id_idx" ON "permissions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_tenant_id_resource_action_key" ON "permissions"("tenant_id", "resource", "action");

-- CreateIndex
CREATE INDEX "role_permissions_tenant_id_idx" ON "role_permissions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenant_id_is_active_idx" ON "users"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "user_roles_tenant_id_idx" ON "user_roles"("tenant_id");

-- CreateIndex
CREATE INDEX "user_branches_tenant_id_idx" ON "user_branches"("tenant_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_tenant_id_idx" ON "refresh_tokens"("user_id", "tenant_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_device_id_idx" ON "refresh_tokens"("device_id");

-- CreateIndex
CREATE INDEX "device_trust_tenant_id_idx" ON "device_trust"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_trust_user_id_device_id_key" ON "device_trust"("user_id", "device_id");

-- CreateIndex
CREATE INDEX "branches_tenant_id_idx" ON "branches"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_code_key" ON "branches"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "warehouses_tenant_id_idx" ON "warehouses"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenant_id_code_key" ON "warehouses"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "product_categories_tenant_id_idx" ON "product_categories"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_tenant_id_slug_key" ON "product_categories"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "products_tenant_id_idx" ON "products"("tenant_id");

-- CreateIndex
CREATE INDEX "products_barcode_idx" ON "products"("barcode");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_tenant_id_is_active_idx" ON "products"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "product_prices_product_id_tenant_id_idx" ON "product_prices"("product_id", "tenant_id");

-- CreateIndex
CREATE INDEX "product_prices_branch_id_idx" ON "product_prices"("branch_id");

-- CreateIndex
CREATE INDEX "product_prices_valid_to_idx" ON "product_prices"("valid_to");

-- CreateIndex
CREATE UNIQUE INDEX "product_prices_product_id_tenant_id_branch_id_unit_valid_to_key" ON "product_prices"("product_id", "tenant_id", "branch_id", "unit", "valid_to");

-- CreateIndex
CREATE INDEX "inventory_movements_tenant_id_idx" ON "inventory_movements"("tenant_id");

-- CreateIndex
CREATE INDEX "inventory_movements_product_id_tenant_id_idx" ON "inventory_movements"("product_id", "tenant_id");

-- CreateIndex
CREATE INDEX "inventory_movements_location_type_location_id_tenant_id_idx" ON "inventory_movements"("location_type", "location_id", "tenant_id");

-- CreateIndex
CREATE INDEX "inventory_movements_reference_type_reference_id_idx" ON "inventory_movements"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "inventory_movements_recorded_at_idx" ON "inventory_movements"("recorded_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_movements_movement_type_idx" ON "inventory_movements"("movement_type");

-- CreateIndex
CREATE INDEX "inventory_movements_sync_status_idx" ON "inventory_movements"("sync_status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_id_server_version_key" ON "inventory_movements"("id", "server_version");

-- CreateIndex
CREATE UNIQUE INDEX "sales_idempotency_key_key" ON "sales"("idempotency_key");

-- CreateIndex
CREATE INDEX "sales_tenant_id_idx" ON "sales"("tenant_id");

-- CreateIndex
CREATE INDEX "sales_branch_id_tenant_id_idx" ON "sales"("branch_id", "tenant_id");

-- CreateIndex
CREATE INDEX "sales_shift_id_idx" ON "sales"("shift_id");

-- CreateIndex
CREATE INDEX "sales_created_at_idx" ON "sales"("created_at" DESC);

-- CreateIndex
CREATE INDEX "sales_sale_status_idx" ON "sales"("sale_status");

-- CreateIndex
CREATE INDEX "sales_sync_status_idx" ON "sales"("sync_status");

-- CreateIndex
CREATE INDEX "sales_receipt_number_tenant_id_idx" ON "sales"("receipt_number", "tenant_id");

-- CreateIndex
CREATE INDEX "sales_idempotency_key_idx" ON "sales"("idempotency_key");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_tenant_id_idx" ON "sale_items"("sale_id", "tenant_id");

-- CreateIndex
CREATE INDEX "sale_items_product_id_tenant_id_idx" ON "sale_items"("product_id", "tenant_id");

-- CreateIndex
CREATE INDEX "sale_items_sync_status_idx" ON "sale_items"("sync_status");

-- CreateIndex
CREATE INDEX "payments_sale_id_tenant_id_idx" ON "payments"("sale_id", "tenant_id");

-- CreateIndex
CREATE INDEX "payments_payment_type_idx" ON "payments"("payment_type");

-- CreateIndex
CREATE INDEX "payments_confirmation_status_idx" ON "payments"("confirmation_status");

-- CreateIndex
CREATE INDEX "payments_sync_status_idx" ON "payments"("sync_status");

-- CreateIndex
CREATE INDEX "shifts_tenant_id_idx" ON "shifts"("tenant_id");

-- CreateIndex
CREATE INDEX "shifts_branch_id_tenant_id_idx" ON "shifts"("branch_id", "tenant_id");

-- CreateIndex
CREATE INDEX "shifts_cashier_id_idx" ON "shifts"("cashier_id");

-- CreateIndex
CREATE INDEX "shifts_status_idx" ON "shifts"("status");

-- CreateIndex
CREATE INDEX "shifts_opened_at_idx" ON "shifts"("opened_at" DESC);

-- CreateIndex
CREATE INDEX "shifts_sync_status_idx" ON "shifts"("sync_status");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_idx" ON "expenses"("tenant_id");

-- CreateIndex
CREATE INDEX "expenses_branch_id_tenant_id_idx" ON "expenses"("branch_id", "tenant_id");

-- CreateIndex
CREATE INDEX "expenses_shift_id_idx" ON "expenses"("shift_id");

-- CreateIndex
CREATE INDEX "expenses_created_at_idx" ON "expenses"("created_at" DESC);

-- CreateIndex
CREATE INDEX "expenses_sync_status_idx" ON "expenses"("sync_status");

-- CreateIndex
CREATE INDEX "damage_reports_tenant_id_idx" ON "damage_reports"("tenant_id");

-- CreateIndex
CREATE INDEX "damage_reports_status_idx" ON "damage_reports"("status");

-- CreateIndex
CREATE INDEX "damage_reports_sync_status_idx" ON "damage_reports"("sync_status");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_user_id_tenant_id_idx" ON "audit_logs"("user_id", "tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_tenant_id_idx" ON "audit_logs"("action", "tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "sync_logs_tenant_id_created_at_idx" ON "sync_logs"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sync_logs_device_id_tenant_id_idx" ON "sync_logs"("device_id", "tenant_id");

-- CreateIndex
CREATE INDEX "sync_logs_status_idx" ON "sync_logs"("status");

-- CreateIndex
CREATE INDEX "fraud_alerts_tenant_id_created_at_idx" ON "fraud_alerts"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "fraud_alerts_branch_id_tenant_id_idx" ON "fraud_alerts"("branch_id", "tenant_id");

-- CreateIndex
CREATE INDEX "fraud_alerts_alert_type_idx" ON "fraud_alerts"("alert_type");

-- CreateIndex
CREATE INDEX "fraud_alerts_severity_idx" ON "fraud_alerts"("severity");

-- CreateIndex
CREATE INDEX "fraud_alerts_status_idx" ON "fraud_alerts"("status");

-- CreateIndex
CREATE INDEX "warehouse_transfers_tenant_id_idx" ON "warehouse_transfers"("tenant_id");

-- CreateIndex
CREATE INDEX "warehouse_transfers_from_location_type_from_location_id_idx" ON "warehouse_transfers"("from_location_type", "from_location_id");

-- CreateIndex
CREATE INDEX "warehouse_transfers_to_location_type_to_location_id_idx" ON "warehouse_transfers"("to_location_type", "to_location_id");

-- CreateIndex
CREATE INDEX "warehouse_transfers_status_idx" ON "warehouse_transfers"("status");

-- CreateIndex
CREATE INDEX "warehouse_transfers_sync_status_idx" ON "warehouse_transfers"("sync_status");

-- CreateIndex
CREATE INDEX "transfer_items_transfer_id_tenant_id_idx" ON "transfer_items"("transfer_id", "tenant_id");

-- CreateIndex
CREATE INDEX "transfer_items_product_id_tenant_id_idx" ON "transfer_items"("product_id", "tenant_id");

-- CreateIndex
CREATE INDEX "transfer_items_sync_status_idx" ON "transfer_items"("sync_status");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_trust" ADD CONSTRAINT "device_trust_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_trust" ADD CONSTRAINT "device_trust_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "inventory_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "warehouse_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
