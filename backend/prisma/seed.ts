import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Check if database is reachable by running a lightweight query.
 * Returns false if connection fails, so the script can exit gracefully.
 */
async function isDatabaseAvailable(): Promise<boolean> {
  try {
    // Set a short connection timeout to fail fast if DB is unreachable
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log('🌱 RetailGuard Seed — Phase 2a');
  console.log('────────────────────────────────────────');

  // ─── Database Availability Check ──────────────────────────────────────
  const dbAvailable = await isDatabaseAvailable();
  if (!dbAvailable) {
    console.log('');
    console.log('⚠️  Database is not available.');
    console.log('   This seed script requires a running PostgreSQL instance.');
    console.log('   Set DATABASE_URL in your environment and ensure the');
    console.log('   database is reachable, then run:');
    console.log('     npx prisma migrate dev  (first time)');
    console.log('     npx prisma db seed      (subsequent runs)');
    console.log('');
    console.log('   The script is syntactically valid TypeScript — it simply');
    console.log('   detected no database connection and exited early.');
    return;
  }

  // ─── Tenant ───────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      id: uuid(),
      name: 'RetailGuard Demo',
      slug: 'demo',
      domain: 'demo.retailguard.cm',
      config: {
        currency: 'XAF',
        timezone: 'Africa/Douala',
        dateFormat: 'DD/MM/YYYY',
        vatRate: 19.25,
      },
      subscriptionTier: 'enterprise',
      subscriptionExpiresAt: new Date('2027-12-31T23:59:59Z'),
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.slug})`);

  // ─── Permissions ──────────────────────────────────────────────────────
  interface PermissionDef {
    resource: string;
    action: string;
  }

  const allPermissions: PermissionDef[] = [
    // Products
    { resource: 'products', action: 'create' },
    { resource: 'products', action: 'read' },
    { resource: 'products', action: 'update' },
    { resource: 'products', action: 'delete' },
    { resource: 'products.categories', action: 'create' },
    { resource: 'products.categories', action: 'read' },
    { resource: 'products.categories', action: 'update' },
    { resource: 'products.categories', action: 'delete' },
    { resource: 'products.prices', action: 'create' },
    { resource: 'products.prices', action: 'read' },
    { resource: 'products.prices', action: 'update' },
    { resource: 'products.prices', action: 'override' },
    // Inventory
    { resource: 'inventory.stock', action: 'read' },
    { resource: 'inventory.movements', action: 'create' },
    { resource: 'inventory.movements', action: 'read' },
    { resource: 'inventory.adjustments', action: 'create' },
    { resource: 'inventory.adjustments', action: 'approve' },
    // Transfers
    { resource: 'inventory.transfers', action: 'create' },
    { resource: 'inventory.transfers', action: 'read' },
    { resource: 'inventory.transfers', action: 'approve' },
    { resource: 'inventory.transfers', action: 'dispatch' },
    { resource: 'inventory.transfers', action: 'receive' },
    { resource: 'inventory.transfers', action: 'cancel' },
    // Sales
    { resource: 'sales', action: 'create' },
    { resource: 'sales', action: 'read' },
    { resource: 'sales', action: 'void' },
    { resource: 'sales', action: 'void_approve' },
    { resource: 'sales.payments', action: 'record' },
    { resource: 'sales.payments', action: 'confirm' },
    // Shifts
    { resource: 'shifts', action: 'open' },
    { resource: 'shifts', action: 'close' },
    { resource: 'shifts', action: 'read' },
    { resource: 'shifts', action: 'manage' },
    // Expenses
    { resource: 'expenses', action: 'create' },
    { resource: 'expenses', action: 'read' },
    { resource: 'expenses', action: 'approve' },
    // Damages
    { resource: 'damages', action: 'create' },
    { resource: 'damages', action: 'read' },
    { resource: 'damages', action: 'review' },
    // Sync
    { resource: 'sync', action: 'push' },
    { resource: 'sync', action: 'pull' },
    // Fraud
    { resource: 'fraud', action: 'detect' },
    { resource: 'fraud.alerts', action: 'read' },
    { resource: 'fraud.alerts', action: 'resolve' },
    // Analytics / Reports
    { resource: 'analytics.sales', action: 'read' },
    { resource: 'analytics.inventory', action: 'read' },
    { resource: 'analytics.cash', action: 'read' },
    { resource: 'analytics.fraud', action: 'read' },
    { resource: 'analytics.dashboard', action: 'read' },
    { resource: 'analytics.reports', action: 'read' },
    { resource: 'analytics.reports', action: 'export' },
    // Users
    { resource: 'users', action: 'create' },
    { resource: 'users', action: 'read' },
    { resource: 'users', action: 'update' },
    { resource: 'users', action: 'delete' },
    { resource: 'users', action: 'assign_roles' },
    { resource: 'users', action: 'assign_branches' },
    // Branches
    { resource: 'branches', action: 'create' },
    { resource: 'branches', action: 'read' },
    { resource: 'branches', action: 'update' },
    { resource: 'branches', action: 'delete' },
    // Warehouses
    { resource: 'warehouses', action: 'create' },
    { resource: 'warehouses', action: 'read' },
    { resource: 'warehouses', action: 'update' },
    { resource: 'warehouses', action: 'delete' },
    // Tenants
    { resource: 'tenants', action: 'read' },
    { resource: 'tenants', action: 'update' },
  ];

  const permissionMap: Record<string, string> = {};
  for (const perm of allPermissions) {
    const p = await prisma.permission.upsert({
      where: {
        tenantId_resource_action: {
          tenantId: tenant.id,
          resource: perm.resource,
          action: perm.action,
        },
      },
      update: {},
      create: {
        id: uuid(),
        tenantId: tenant.id,
        resource: perm.resource,
        action: perm.action,
        description: `${perm.action} ${perm.resource}`,
      },
    });
    permissionMap[`${perm.resource}.${perm.action}`] = p.id;
  }
  console.log(`✅ ${allPermissions.length} permissions created`);

  // ─── Roles ────────────────────────────────────────────────────────────
  interface RoleDef {
    name: string;
    slug: string;
    description: string;
    permissions: string[];
  }

  const roleDefs: RoleDef[] = [
    {
      name: 'Administrator',
      slug: 'admin',
      description: 'Full system access — all permissions',
      permissions: allPermissions.map((p) => `${p.resource}.${p.action}`),
    },
    {
      name: 'Branch Manager',
      slug: 'branch_manager',
      description: 'Manages branch operations, inventory, transfers, and reports',
      permissions: [
        // manage shifts
        'shifts.open', 'shifts.close', 'shifts.read', 'shifts.manage',
        // view sales
        'sales.create', 'sales.read', 'sales.void',
        // manage expenses
        'expenses.create', 'expenses.read', 'expenses.approve',
        // view inventory
        'inventory.stock.read', 'inventory.movements.read',
        // manage transfers
        'inventory.transfers.create', 'inventory.transfers.read',
        'inventory.transfers.approve', 'inventory.transfers.cancel',
        'inventory.adjustments.create',
        // view reports
        'analytics.sales.read', 'analytics.inventory.read',
        'analytics.cash.read', 'analytics.dashboard.read',
        'analytics.reports.read', 'analytics.reports.export',
        // products (read)
        'products.read', 'products.categories.read', 'products.prices.read',
        // damages
        'damages.create', 'damages.read', 'damages.review',
        // sync
        'sync.push', 'sync.pull',
        // fraud alerts
        'fraud.alerts.read', 'fraud.alerts.resolve',
        // users (read)
        'users.read',
      ],
    },
    {
      name: 'Supervisor',
      slug: 'supervisor',
      description: 'Supervises cashiers, approves voids and expenses, overrides prices',
      permissions: [
        // manage shifts
        'shifts.open', 'shifts.close', 'shifts.read', 'shifts.manage',
        // override prices
        'products.prices.override',
        // approve voids
        'sales.void_approve',
        // approve expenses
        'expenses.approve',
        // view sales
        'sales.read',
        // products (read)
        'products.read', 'products.categories.read', 'products.prices.read',
        // inventory (read)
        'inventory.stock.read', 'inventory.movements.read',
        // damages
        'damages.read', 'damages.review',
        // fraud alerts (read)
        'fraud.alerts.read',
        // analytics (dashboard)
        'analytics.sales.read', 'analytics.dashboard.read',
      ],
    },
    {
      name: 'Cashier',
      slug: 'cashier',
      description: 'Processes sales, records payments, opens/closes shifts, views inventory',
      permissions: [
        // create sales
        'sales.create', 'sales.read',
        // record payments
        'sales.payments.record',
        // open/close shifts
        'shifts.open', 'shifts.close', 'shifts.read',
        // view inventory
        'inventory.stock.read',
        // products (read)
        'products.read', 'products.prices.read',
        // expenses (create)
        'expenses.create', 'expenses.read',
        // damages
        'damages.create', 'damages.read',
      ],
    },
    {
      name: 'Warehouse Staff',
      slug: 'warehouse_staff',
      description: 'Manages warehouse inventory, transfers, and damages',
      permissions: [
        // manage inventory
        'inventory.stock.read', 'inventory.movements.create', 'inventory.movements.read',
        'inventory.adjustments.create',
        // manage transfers
        'inventory.transfers.create', 'inventory.transfers.read',
        'inventory.transfers.dispatch', 'inventory.transfers.receive',
        // report damages
        'damages.create', 'damages.read',
        // view products
        'products.read', 'products.categories.read', 'products.prices.read',
        // sync
        'sync.push', 'sync.pull',
      ],
    },
  ];

  const roleMap: Record<string, string> = {};
  for (const roleDef of roleDefs) {
    const role = await prisma.role.upsert({
      where: {
        tenantId_slug: { tenantId: tenant.id, slug: roleDef.slug },
      },
      update: { name: roleDef.name, description: roleDef.description },
      create: {
        id: uuid(),
        tenantId: tenant.id,
        name: roleDef.name,
        slug: roleDef.slug,
        description: roleDef.description,
        isSystem: true,
      },
    });
    roleMap[roleDef.slug] = role.id;

    // Assign permissions
    for (const permKey of roleDef.permissions) {
      const permId = permissionMap[permKey];
      if (permId) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: { roleId: role.id, permissionId: permId },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permId,
            tenantId: tenant.id,
          },
        });
      }
    }
  }
  console.log(`✅ ${roleDefs.length} roles created with permissions`);

  // ─── Branch ───────────────────────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: {
      tenantId_code: { tenantId: tenant.id, code: 'DOUALA-MAIN' },
    },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      code: 'DOUALA-MAIN',
      name: 'Douala Main Branch',
      address: '123 Boulevard de la Liberté, Bonanjo',
      city: 'Douala',
      region: 'Littoral',
      phone: '+237 612 345 678',
      email: 'douala.main@retailguard-demo.com',
      taxId: 'TAX-DLA-001',
      posTimeoutMinutes: 480,
      requiresSupervisorOverride: true,
    },
  });
  console.log(`✅ Branch: ${branch.name} (${branch.code})`);

  // ─── Warehouse ────────────────────────────────────────────────────────
  const warehouse = await prisma.warehouse.upsert({
    where: {
      tenantId_code: { tenantId: tenant.id, code: 'WH-DOUALA-CENTRAL' },
    },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      code: 'WH-DOUALA-CENTRAL',
      name: 'Douala Central Warehouse',
      address: '456 Zone Industrielle, Bonabéri',
      city: 'Douala',
      region: 'Littoral',
      phone: '+237 698 765 432',
      isActive: true,
      branchId: branch.id,
    },
  });
  console.log(`✅ Warehouse: ${warehouse.name} (${warehouse.code})`);

  // ─── Product Categories ───────────────────────────────────────────────
  const categoryDefs = [
    { name: 'Ceramic Tiles', slug: 'ceramic-tiles', sortOrder: 1 },
    { name: 'Porcelain Tiles', slug: 'porcelain-tiles', sortOrder: 2 },
    { name: 'Cement & Binders', slug: 'cement-binders', sortOrder: 3 },
    { name: 'Adhesives & Grouts', slug: 'adhesives-grouts', sortOrder: 4 },
  ];

  const categoryMap: Record<string, string> = {};
  for (const catDef of categoryDefs) {
    const cat = await prisma.productCategory.upsert({
      where: {
        tenantId_slug: { tenantId: tenant.id, slug: catDef.slug },
      },
      update: {},
      create: {
        id: uuid(),
        tenantId: tenant.id,
        name: catDef.name,
        slug: catDef.slug,
        sortOrder: catDef.sortOrder,
      },
    });
    categoryMap[catDef.slug] = cat.id;
  }
  console.log(`✅ ${categoryDefs.length} product categories created`);

  // ─── Products ─────────────────────────────────────────────────────────
  interface ProductDef {
    sku: string;
    barcode: string;
    name: string;
    categorySlug: string;
    brand: string;
    unitOfMeasure: string;
    stockUnit: string;
    piecesPerBox: number;
    stockToSqmFactor: number | null;
    sellingPrice: number;
    costPrice: number;
    reorderLevel: number;
    reorderQuantity: number;
  }

  const productDefs: ProductDef[] = [
    {
      sku: 'TILE-CER-60X60',
      barcode: '5901234567890',
      name: 'Ceramic Floor Tile 60x60',
      categorySlug: 'ceramic-tiles',
      brand: 'Ceramica',
      unitOfMeasure: 'UNIT',
      stockUnit: 'BOX',
      piecesPerBox: 4,
      stockToSqmFactor: 1.44, // 0.6m * 0.6m * 4 pcs = 1.44 sqm
      sellingPrice: 12500,
      costPrice: 7800,
      reorderLevel: 50,
      reorderQuantity: 100,
    },
    {
      sku: 'TILE-WALL-30X60',
      barcode: '5901234567891',
      name: 'Wall Tile 30x60',
      categorySlug: 'ceramic-tiles',
      brand: 'Ceramica',
      unitOfMeasure: 'UNIT',
      stockUnit: 'BOX',
      piecesPerBox: 8,
      stockToSqmFactor: 1.44, // 0.3m * 0.6m * 8 pcs = 1.44 sqm
      sellingPrice: 8500,
      costPrice: 5200,
      reorderLevel: 50,
      reorderQuantity: 100,
    },
    {
      sku: 'TILE-POR-80X80',
      barcode: '5901234567892',
      name: 'Porcelain Tile 80x80',
      categorySlug: 'porcelain-tiles',
      brand: 'Porcelanosa',
      unitOfMeasure: 'UNIT',
      stockUnit: 'BOX',
      piecesPerBox: 3,
      stockToSqmFactor: 1.92, // 0.8m * 0.8m * 3 pcs = 1.92 sqm
      sellingPrice: 18000,
      costPrice: 11500,
      reorderLevel: 30,
      reorderQuantity: 60,
    },
    {
      sku: 'CEMENT-42.5R',
      barcode: '5901234567893',
      name: 'Cement 42.5R',
      categorySlug: 'cement-binders',
      brand: 'Dangote',
      unitOfMeasure: 'UNIT',
      stockUnit: 'BAG',
      piecesPerBox: 1,
      stockToSqmFactor: null,
      sellingPrice: 4500,
      costPrice: 3100,
      reorderLevel: 200,
      reorderQuantity: 400,
    },
    {
      sku: 'ADHESIVE-TILE-25KG',
      barcode: '5901234567894',
      name: 'Tile Adhesive 25kg',
      categorySlug: 'adhesives-grouts',
      brand: 'Mapei',
      unitOfMeasure: 'UNIT',
      stockUnit: 'BAG',
      piecesPerBox: 1,
      stockToSqmFactor: null,
      sellingPrice: 3200,
      costPrice: 2100,
      reorderLevel: 50,
      reorderQuantity: 100,
    },
    {
      sku: 'GROUT-WHITE-5KG',
      barcode: '5901234567895',
      name: 'Grout White 5kg',
      categorySlug: 'adhesives-grouts',
      brand: 'Mapei',
      unitOfMeasure: 'UNIT',
      stockUnit: 'BAG',
      piecesPerBox: 1,
      stockToSqmFactor: null,
      sellingPrice: 1800,
      costPrice: 1100,
      reorderLevel: 30,
      reorderQuantity: 60,
    },
  ];

  const productMap: Record<string, string> = {};
  for (const prodDef of productDefs) {
    const product = await prisma.product.upsert({
      where: {
        tenantId_sku: { tenantId: tenant.id, sku: prodDef.sku },
      },
      update: {
        name: prodDef.name,
        brand: prodDef.brand,
      },
      create: {
        id: uuid(),
        tenantId: tenant.id,
        sku: prodDef.sku,
        barcode: prodDef.barcode,
        name: prodDef.name,
        categoryId: categoryMap[prodDef.categorySlug],
        brand: prodDef.brand,
        unitOfMeasure: prodDef.unitOfMeasure,
        stockUnit: prodDef.stockUnit,
        stockToSqmFactor: prodDef.stockToSqmFactor,
        stockToPieceFactor: prodDef.piecesPerBox,
        isDamageTracked: true,
        reorderLevel: prodDef.reorderLevel,
        reorderQuantity: prodDef.reorderQuantity,
      },
    });
    productMap[prodDef.sku] = product.id;

    // ─── Product Price (stock unit) ──────────────────────────────────
    // Composite unique: [productId, tenantId, branchId ?? default, unit, validTo]
    // branchId=null + validTo=null means global current price
    const existingStockPrice = await prisma.productPrice.findFirst({
      where: {
        productId: product.id,
        tenantId: tenant.id,
        branchId: null,
        unit: prodDef.stockUnit,
        validTo: null,
      },
    });

    if (!existingStockPrice) {
      await prisma.productPrice.create({
        data: {
          id: uuid(),
          productId: product.id,
          tenantId: tenant.id,
          branchId: null,
          unit: prodDef.stockUnit,
          sellingPrice: prodDef.sellingPrice,
          costPrice: prodDef.costPrice,
          minPrice: Math.round(prodDef.costPrice * 1.1),
          vatRate: 19.25,
          validFrom: new Date('2025-01-01T00:00:00Z'),
          validTo: null,
        },
      });
    }

    // ─── Product Price (SQM) — only for tiles ───────────────────────
    if (prodDef.stockToSqmFactor) {
      const sqmSellingPrice = Math.round(prodDef.sellingPrice / prodDef.stockToSqmFactor);
      const sqmCostPrice = Math.round(prodDef.costPrice / prodDef.stockToSqmFactor);

      const existingSqmPrice = await prisma.productPrice.findFirst({
        where: {
          productId: product.id,
          tenantId: tenant.id,
          branchId: null,
          unit: 'SQM',
          validTo: null,
        },
      });

      if (!existingSqmPrice) {
        await prisma.productPrice.create({
          data: {
            id: uuid(),
            productId: product.id,
            tenantId: tenant.id,
            branchId: null,
            unit: 'SQM',
            sellingPrice: sqmSellingPrice,
            costPrice: sqmCostPrice,
            minPrice: Math.round(sqmCostPrice * 1.1),
            vatRate: 19.25,
            validFrom: new Date('2025-01-01T00:00:00Z'),
            validTo: null,
          },
        });
      }
    }
  }
  console.log(`✅ ${productDefs.length} products created with prices`);

  // ─── Users & Password Hashing ─────────────────────────────────────────
  interface UserDef {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    roleSlug: string;
    assignedToBranch: boolean;
    assignedToWarehouse: boolean;
  }

  const userDefs: UserDef[] = [
    {
      email: 'admin@retailguard.cm',
      password: 'admin123',
      firstName: 'Admin',
      lastName: 'User',
      roleSlug: 'admin',
      assignedToBranch: false,
      assignedToWarehouse: false,
    },
    {
      email: 'manager@retailguard.cm',
      password: 'manager123',
      firstName: 'Jean',
      lastName: 'Mbarga',
      roleSlug: 'branch_manager',
      assignedToBranch: true,
      assignedToWarehouse: false,
    },
    {
      email: 'supervisor@retailguard.cm',
      password: 'supervisor123',
      firstName: 'Marie',
      lastName: 'Nkeng',
      roleSlug: 'supervisor',
      assignedToBranch: true,
      assignedToWarehouse: false,
    },
    {
      email: 'cashier@retailguard.cm',
      password: 'cashier123',
      firstName: 'Paul',
      lastName: 'Biya',
      roleSlug: 'cashier',
      assignedToBranch: true,
      assignedToWarehouse: false,
    },
    {
      email: 'warehouse@retailguard.cm',
      password: 'warehouse123',
      firstName: 'Pierre',
      lastName: 'Tchinda',
      roleSlug: 'warehouse_staff',
      assignedToBranch: false,
      assignedToWarehouse: true,
    },
  ];

  const userIds: string[] = [];
  for (const userDef of userDefs) {
    const passwordHash = await bcrypt.hash(userDef.password, 12);

    const user = await prisma.user.upsert({
      where: { email: userDef.email },
      update: {
        firstName: userDef.firstName,
        lastName: userDef.lastName,
        passwordHash,
        isActive: true,
      },
      create: {
        id: uuid(),
        tenantId: tenant.id,
        email: userDef.email,
        firstName: userDef.firstName,
        lastName: userDef.lastName,
        passwordHash,
        isActive: true,
        requiresPasswordChange: false,
      },
    });
    userIds.push(user.id);

    // Assign role
    const roleId = roleMap[userDef.roleSlug];
    if (roleId) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: { userId: user.id, roleId },
        },
        update: {},
        create: {
          userId: user.id,
          roleId,
          tenantId: tenant.id,
        },
      });
    }

    // Assign to branch if applicable
    if (userDef.assignedToBranch) {
      await prisma.userBranch.upsert({
        where: {
          userId_branchId: { userId: user.id, branchId: branch.id },
        },
        update: {},
        create: {
          userId: user.id,
          branchId: branch.id,
          tenantId: tenant.id,
          isPrimary: true,
        },
      });
    }

    // Assign to warehouse if applicable
    if (userDef.assignedToWarehouse) {
      await prisma.userBranch.upsert({
        where: {
          userId_branchId: { userId: user.id, branchId: branch.id },
        },
        update: {},
        create: {
          userId: user.id,
          branchId: branch.id,
          tenantId: tenant.id,
          isPrimary: true,
        },
      });
    }
  }
  console.log(`✅ ${userDefs.length} users created with bcrypt (saltRounds=12)`);

  // ─── Initial Stock — Warehouse ────────────────────────────────────────
  interface StockMovement {
    sku: string;
    quantity: number;
    unit: string;
  }

  const warehouseStock: StockMovement[] = [
    { sku: 'TILE-CER-60X60', quantity: 50, unit: 'BOX' },
    { sku: 'TILE-WALL-30X60', quantity: 30, unit: 'BOX' },
    { sku: 'TILE-POR-80X80', quantity: 20, unit: 'BOX' },
    { sku: 'CEMENT-42.5R', quantity: 100, unit: 'BAG' },
    { sku: 'ADHESIVE-TILE-25KG', quantity: 40, unit: 'BAG' },
    { sku: 'GROUT-WHITE-5KG', quantity: 25, unit: 'BAG' },
  ];

  const branchStock: StockMovement[] = [
    { sku: 'TILE-CER-60X60', quantity: 10, unit: 'BOX' },
    { sku: 'TILE-WALL-30X60', quantity: 5, unit: 'BOX' },
    { sku: 'TILE-POR-80X80', quantity: 3, unit: 'BOX' },
    { sku: 'CEMENT-42.5R', quantity: 20, unit: 'BAG' },
    { sku: 'ADHESIVE-TILE-25KG', quantity: 8, unit: 'BAG' },
    { sku: 'GROUT-WHITE-5KG', quantity: 5, unit: 'BAG' },
  ];

  // Find the admin user to use as recordedBy
  const adminUser = await prisma.user.findUnique({
    where: { email: 'admin@retailguard.cm' },
  });
  const recordedById = adminUser?.id ?? '00000000-0000-0000-0000-000000000000';

  // Get the warehouse staff user
  const warehouseUser = await prisma.user.findUnique({
    where: { email: 'warehouse@retailguard.cm' },
  });
  const warehouseRecordedById = warehouseUser?.id ?? recordedById;

  for (const mov of warehouseStock) {
    const productId = productMap[mov.sku];
    if (!productId) {
      console.warn(`  ⚠️  Product not found for SKU: ${mov.sku} — skipping warehouse stock`);
      continue;
    }

    // Check if initial stock movement already exists for this product+location+type
    const existing = await prisma.inventoryMovement.findFirst({
      where: {
        tenantId: tenant.id,
        productId,
        locationType: 'warehouse',
        locationId: warehouse.id,
        movementType: 'initial_stock',
      },
    });

    if (!existing) {
      await prisma.inventoryMovement.create({
        data: {
          id: uuid(),
          tenantId: tenant.id,
          productId,
          locationType: 'warehouse',
          locationId: warehouse.id,
          movementType: 'initial_stock',
          quantity: mov.quantity,
          unit: mov.unit,
          unitQuantity: mov.quantity,
          reason: 'Initial stock on seed — warehouse',
          recordedBy: warehouseRecordedById,
          recordedAt: new Date('2025-01-01T00:00:00Z'),
        },
      });
    }
  }
  console.log(`✅ ${warehouseStock.length} warehouse initial stock entries created`);

  for (const mov of branchStock) {
    const productId = productMap[mov.sku];
    if (!productId) {
      console.warn(`  ⚠️  Product not found for SKU: ${mov.sku} — skipping branch stock`);
      continue;
    }

    const existing = await prisma.inventoryMovement.findFirst({
      where: {
        tenantId: tenant.id,
        productId,
        locationType: 'branch',
        locationId: branch.id,
        movementType: 'initial_stock',
      },
    });

    if (!existing) {
      await prisma.inventoryMovement.create({
        data: {
          id: uuid(),
          tenantId: tenant.id,
          productId,
          locationType: 'branch',
          locationId: branch.id,
          movementType: 'initial_stock',
          quantity: mov.quantity,
          unit: mov.unit,
          unitQuantity: mov.quantity,
          reason: 'Initial stock on seed — branch',
          recordedBy: recordedById,
          recordedAt: new Date('2025-01-01T00:00:00Z'),
        },
      });
    }
  }
  console.log(`✅ ${branchStock.length} branch initial stock entries created`);

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log('');
  console.log('🎉 Seed completed successfully!');
  console.log('');
  console.log('📋 Login Credentials');
  console.log('────────────────────');
  console.log('  Admin:     admin@retailguard.cm / admin123');
  console.log('  Manager:   manager@retailguard.cm / manager123');
  console.log('  Supervisor: supervisor@retailguard.cm / supervisor123');
  console.log('  Cashier:   cashier@retailguard.cm / cashier123');
  console.log('  Warehouse: warehouse@retailguard.cm / warehouse123');
  console.log('');
  console.log('🏪 Branches & Warehouses');
  console.log('─────────────────────────');
  console.log('  Branch:    Douala Main Branch');
  console.log('  Warehouse: Douala Central Warehouse');
  console.log('');
  console.log('📦 Products');
  console.log('────────────');
  for (const prodDef of productDefs) {
    console.log(`  ${prodDef.sku.padEnd(20)} ${prodDef.name.padEnd(30)} ${prodDef.sellingPrice.toLocaleString()} XAF/${prodDef.stockUnit}`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });