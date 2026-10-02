import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting RetailGuard seed...');

  // ─── Tenant ───────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'retailguard-demo' },
    update: {},
    create: {
      name: 'RetailGuard Demo',
      slug: 'retailguard-demo',
      domain: 'demo.retailguard.com',
      config: {
        currency: 'XAF',
        timezone: 'Africa/Douala',
        dateFormat: 'DD/MM/YYYY',
        vatRate: 19.25,
      },
      subscriptionTier: 'enterprise',
      subscriptionExpiresAt: new Date('2027-12-31'),
    },
  });
  console.log(`✅ Tenant created: ${tenant.name} (${tenant.id})`);

  // ─── Permissions ──────────────────────────────────────────────────────
  const permissionDefs = [
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
    // Inventory
    { resource: 'inventory.stock', action: 'read' },
    { resource: 'inventory.movements', action: 'create' },
    { resource: 'inventory.movements', action: 'read' },
    { resource: 'inventory.transfers', action: 'create' },
    { resource: 'inventory.transfers', action: 'read' },
    { resource: 'inventory.transfers', action: 'approve' },
    { resource: 'inventory.transfers', action: 'dispatch' },
    { resource: 'inventory.transfers', action: 'receive' },
    { resource: 'inventory.transfers', action: 'cancel' },
    { resource: 'inventory.adjustments', action: 'create' },
    // Sales
    { resource: 'sales', action: 'create' },
    { resource: 'sales', action: 'read' },
    { resource: 'sales', action: 'void' },
    { resource: 'sales.payments', action: 'confirm' },
    // Shifts
    { resource: 'shifts', action: 'open' },
    { resource: 'shifts', action: 'close' },
    { resource: 'shifts', action: 'read' },
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
    // Analytics
    { resource: 'analytics.sales', action: 'read' },
    { resource: 'analytics.inventory', action: 'read' },
    { resource: 'analytics.cash', action: 'read' },
    { resource: 'analytics.fraud', action: 'read' },
    { resource: 'analytics.dashboard', action: 'read' },
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

  const permissions: Record<string, string> = {};
  for (const perm of permissionDefs) {
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
        tenantId: tenant.id,
        resource: perm.resource,
        action: perm.action,
        description: `${perm.action} ${perm.resource}`,
      },
    });
    permissions[`${perm.resource}.${perm.action}`] = p.id;
  }
  console.log(`✅ ${permissionDefs.length} permissions created`);

  // ─── Roles ────────────────────────────────────────────────────────────
  const roleDefs = [
    {
      name: 'Administrator',
      slug: 'admin',
      description: 'Full system access',
      isSystem: true,
      perms: permissionDefs.map((p) => `${p.resource}.${p.action}`),
    },
    {
      name: 'Branch Manager',
      slug: 'branch_manager',
      description: 'Manages branch operations',
      isSystem: true,
      perms: [
        'products.read', 'products.categories.read', 'products.prices.read',
        'inventory.stock.read', 'inventory.movements.read', 'inventory.transfers.create', 'inventory.transfers.read', 'inventory.transfers.approve', 'inventory.transfers.cancel', 'inventory.adjustments.create',
        'sales.create', 'sales.read', 'sales.void', 'sales.payments.confirm',
        'shifts.open', 'shifts.close', 'shifts.read',
        'expenses.create', 'expenses.read', 'expenses.approve',
        'damages.create', 'damages.read', 'damages.review',
        'sync.push', 'sync.pull',
        'fraud.alerts.read', 'fraud.alerts.resolve',
        'analytics.sales.read', 'analytics.inventory.read', 'analytics.cash.read', 'analytics.fraud.read', 'analytics.dashboard.read',
        'users.read',
      ],
    },
    {
      name: 'Supervisor',
      slug: 'supervisor',
      description: 'Supervises cashiers and approves voids',
      isSystem: true,
      perms: [
        'products.read', 'products.categories.read', 'products.prices.read',
        'inventory.stock.read', 'inventory.movements.read',
        'sales.read', 'sales.void',
        'shifts.open', 'shifts.close', 'shifts.read',
        'expenses.read', 'expenses.approve',
        'damages.read', 'damages.review',
        'fraud.alerts.read',
        'analytics.sales.read', 'analytics.dashboard.read',
      ],
    },
    {
      name: 'Cashier',
      slug: 'cashier',
      description: 'Processes sales at POS',
      isSystem: true,
      perms: [
        'products.read', 'products.prices.read',
        'inventory.stock.read',
        'sales.create', 'sales.read',
        'shifts.open', 'shifts.read',
        'expenses.create', 'expenses.read',
        'damages.create', 'damages.read',
      ],
    },
    {
      name: 'Warehouse Staff',
      slug: 'warehouse_staff',
      description: 'Manages warehouse inventory',
      isSystem: true,
      perms: [
        'products.read', 'products.categories.read', 'products.prices.read',
        'inventory.stock.read', 'inventory.movements.create', 'inventory.movements.read',
        'inventory.transfers.create', 'inventory.transfers.read', 'inventory.transfers.dispatch', 'inventory.transfers.receive',
        'inventory.adjustments.create',
        'damages.create', 'damages.read',
        'sync.push', 'sync.pull',
      ],
    },
  ];

  const roles: Record<string, string> = {};
  for (const roleDef of roleDefs) {
    const role = await prisma.role.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: roleDef.slug } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: roleDef.name,
        slug: roleDef.slug,
        description: roleDef.description,
        isSystem: roleDef.isSystem,
        createdBy: null,
        updatedBy: null,
      },
    });
    roles[roleDef.slug] = role.id;

    // Assign permissions to role
    for (const permKey of roleDef.perms) {
      const permId = permissions[permKey];
      if (permId) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permId } },
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
    where: { tenantId_code: { tenantId: tenant.id, code: 'DOUALA-CENTRE' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'DOUALA-CENTRE',
      name: 'Douala Centre',
      address: '123 Boulevard de la Liberté',
      city: 'Douala',
      region: 'Littoral',
      phone: '+237 612 345 678',
      email: 'douala.centre@retailguard-demo.com',
      taxId: 'TAX-DLA-001',
      posTimeoutMinutes: 480,
      requiresSupervisorOverride: true,
    },
  });
  console.log(`✅ Branch created: ${branch.name}`);

  // ─── Warehouse ────────────────────────────────────────────────────────
  const warehouse = await prisma.warehouse.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'WH-DOUALA' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'WH-DOUALA',
      name: 'Douala Main Warehouse',
      address: '456 Zone Industrielle, Bonabéri',
      city: 'Douala',
      region: 'Littoral',
      phone: '+237 698 765 432',
      isActive: true,
      branchId: branch.id,
    },
  });
  console.log(`✅ Warehouse created: ${warehouse.name}`);

  // ─── Product Categories ───────────────────────────────────────────────
  const categoryDefs = [
    { name: 'Ceramic Tiles', slug: 'ceramic-tiles', sortOrder: 1 },
    { name: 'Porcelain Tiles', slug: 'porcelain-tiles', sortOrder: 2 },
    { name: 'Cement & Binders', slug: 'cement-binders', sortOrder: 3 },
    { name: 'Adhesives & Grouts', slug: 'adhesives-grouts', sortOrder: 4 },
    { name: 'Sanitary Ware', slug: 'sanitary-ware', sortOrder: 5 },
    { name: 'Tools & Accessories', slug: 'tools-accessories', sortOrder: 6 },
  ];

  const categories: Record<string, string> = {};
  for (const catDef of categoryDefs) {
    const cat = await prisma.productCategory.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: catDef.slug } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: catDef.name,
        slug: catDef.slug,
        sortOrder: catDef.sortOrder,
      },
    });
    categories[catDef.slug] = cat.id;
  }
  console.log(`✅ ${categoryDefs.length} product categories created`);

  // ─── Products ─────────────────────────────────────────────────────────
  const productDefs = [
    {
      sku: 'TILE-CER-300X300',
      name: 'Ceramic Floor Tile 30x30cm',
      category: 'ceramic-tiles',
      brand: 'Ceramica',
      stockUnit: 'BOX',
      stockToSqmFactor: 1.44,
      stockToPieceFactor: 16,
      sellingPrice: 8500,
      costPrice: 5500,
      reorderLevel: 50,
    },
    {
      sku: 'TILE-CER-400X400',
      name: 'Ceramic Floor Tile 40x40cm',
      category: 'ceramic-tiles',
      brand: 'Ceramica',
      stockUnit: 'BOX',
      stockToSqmFactor: 1.60,
      stockToPieceFactor: 10,
      sellingPrice: 9500,
      costPrice: 6200,
      reorderLevel: 40,
    },
    {
      sku: 'TILE-POR-600X600',
      name: 'Porcelain Floor Tile 60x60cm',
      category: 'porcelain-tiles',
      brand: 'Porcelanosa',
      stockUnit: 'BOX',
      stockToSqmFactor: 1.44,
      stockToPieceFactor: 4,
      sellingPrice: 15000,
      costPrice: 9800,
      reorderLevel: 30,
    },
    {
      sku: 'TILE-POR-800X800',
      name: 'Porcelain Floor Tile 80x80cm',
      category: 'porcelain-tiles',
      brand: 'Porcelanosa',
      stockUnit: 'BOX',
      stockToSqmFactor: 1.28,
      stockToPieceFactor: 2,
      sellingPrice: 22000,
      costPrice: 14500,
      reorderLevel: 20,
    },
    {
      sku: 'CEMENT-PORT-42.5',
      name: 'Portland Cement 42.5R 50kg',
      category: 'cement-binders',
      brand: 'Dangote',
      stockUnit: 'BAG',
      stockToSqmFactor: null,
      stockToPieceFactor: 1,
      sellingPrice: 5500,
      costPrice: 3800,
      reorderLevel: 200,
    },
    {
      sku: 'CEMENT-PORT-32.5',
      name: 'Portland Cement 32.5R 50kg',
      category: 'cement-binders',
      brand: 'Cimencam',
      stockUnit: 'BAG',
      stockToSqmFactor: null,
      stockToPieceFactor: 1,
      sellingPrice: 4800,
      costPrice: 3200,
      reorderLevel: 200,
    },
    {
      sku: 'ADHESIVE-TILE-25KG',
      name: 'Tile Adhesive Premium 25kg',
      category: 'adhesives-grouts',
      brand: 'Mapei',
      stockUnit: 'BAG',
      stockToSqmFactor: null,
      stockToPieceFactor: 1,
      sellingPrice: 6500,
      costPrice: 4200,
      reorderLevel: 50,
    },
    {
      sku: 'GROUT-WHITE-5KG',
      name: 'White Grout 5kg',
      category: 'adhesives-grouts',
      brand: 'Mapei',
      stockUnit: 'BAG',
      stockToSqmFactor: null,
      stockToPieceFactor: 1,
      sellingPrice: 3500,
      costPrice: 2200,
      reorderLevel: 30,
    },
    {
      sku: 'WC-VITREOUS-1PC',
      name: 'Vitreous China WC Suite',
      category: 'sanitary-ware',
      brand: 'Roca',
      stockUnit: 'PIECE',
      stockToSqmFactor: null,
      stockToPieceFactor: 1,
      sellingPrice: 85000,
      costPrice: 55000,
      reorderLevel: 10,
    },
    {
      sku: 'BASIN-WALL-60CM',
      name: 'Wall-Hung Basin 60cm',
      category: 'sanitary-ware',
      brand: 'Roca',
      stockUnit: 'PIECE',
      stockToSqmFactor: null,
      stockToPieceFactor: 1,
      sellingPrice: 45000,
      costPrice: 29000,
      reorderLevel: 10,
    },
    {
      sku: 'TROWEL-300MM',
      name: 'Notched Trowel 300mm',
      category: 'tools-accessories',
      brand: 'Rubi',
      stockUnit: 'PIECE',
      stockToSqmFactor: null,
      stockToPieceFactor: 1,
      sellingPrice: 2500,
      costPrice: 1500,
      reorderLevel: 50,
    },
    {
      sku: 'TILE-CUTTER-600MM',
      name: 'Manual Tile Cutter 600mm',
      category: 'tools-accessories',
      brand: 'Rubi',
      stockUnit: 'PIECE',
      stockToSqmFactor: null,
      stockToPieceFactor: 1,
      sellingPrice: 18000,
      costPrice: 11500,
      reorderLevel: 5,
    },
  ];

  const productIds: string[] = [];
  for (const prodDef of productDefs) {
    const product = await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: prodDef.sku } },
      update: {},
      create: {
        tenantId: tenant.id,
        sku: prodDef.sku,
        name: prodDef.name,
        categoryId: categories[prodDef.category],
        brand: prodDef.brand,
        unitOfMeasure: 'UNIT',
        stockUnit: prodDef.stockUnit,
        stockToSqmFactor: prodDef.stockToSqmFactor ?? null,
        stockToPieceFactor: prodDef.stockToPieceFactor ?? null,
        isDamageTracked: true,
        reorderLevel: prodDef.reorderLevel,
        reorderQuantity: prodDef.reorderLevel * 2,
        createdBy: null,
        updatedBy: null,
      },
    });

    // Create prices
    await prisma.productPrice.upsert({
      where: {
        productId_tenantId_branchId_unit_validTo: {
          productId: product.id,
          tenantId: tenant.id,
          branchId: '00000000-0000-0000-0000-000000000000',
          unit: prodDef.stockUnit,
          validTo: null as any,
        },
      },
      update: { sellingPrice: prodDef.sellingPrice },
      create: {
        productId: product.id,
        tenantId: tenant.id,
        branchId: null,
        unit: prodDef.stockUnit,
        sellingPrice: prodDef.sellingPrice,
        costPrice: prodDef.costPrice,
        minPrice: prodDef.costPrice * 1.1,
        vatRate: 19.25,
        createdBy: null,
      },
    });

    // Also create SQM price if conversion factor exists
    if (prodDef.stockToSqmFactor) {
      const sqmPrice = prodDef.sellingPrice / prodDef.stockToSqmFactor;
      await prisma.productPrice.upsert({
        where: {
          productId_tenantId_branchId_unit_validTo: {
            productId: product.id,
            tenantId: tenant.id,
            branchId: '00000000-0000-0000-0000-000000000000',
            unit: 'SQM',
            validTo: null as any,
          },
        },
        update: { sellingPrice: Math.round(sqmPrice) },
        create: {
          productId: product.id,
          tenantId: tenant.id,
          branchId: null,
          unit: 'SQM',
          sellingPrice: Math.round(sqmPrice),
          costPrice: prodDef.costPrice ? Math.round(prodDef.costPrice / prodDef.stockToSqmFactor) : null,
          minPrice: prodDef.costPrice ? Math.round((prodDef.costPrice * 1.1) / prodDef.stockToSqmFactor) : null,
          vatRate: 19.25,
          createdBy: null,
        },
      });
    }

    productIds.push(product.id);
  }
  console.log(`✅ ${productDefs.length} products created with prices`);

  // ─── Users ────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('password123', 12);

  const userDefs = [
    {
      email: 'admin@retailguard-demo.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
    },
    {
      email: 'manager@retailguard-demo.com',
      firstName: 'Jean',
      lastName: 'Mbarga',
      role: 'branch_manager',
    },
    {
      email: 'supervisor@retailguard-demo.com',
      firstName: 'Marie',
      lastName: 'Nkeng',
      role: 'supervisor',
    },
    {
      email: 'cashier1@retailguard-demo.com',
      firstName: 'Paul',
      lastName: 'Biya',
      role: 'cashier',
    },
    {
      email: 'cashier2@retailguard-demo.com',
      firstName: 'Alice',
      lastName: 'Ngo',
      role: 'cashier',
    },
    {
      email: 'warehouse@retailguard-demo.com',
      firstName: 'Pierre',
      lastName: 'Tchinda',
      role: 'warehouse_staff',
    },
  ];

  for (const userDef of userDefs) {
    const user = await prisma.user.upsert({
      where: { email: userDef.email },
      update: {},
      create: {
        tenantId: tenant.id,
        email: userDef.email,
        phone: null,
        firstName: userDef.firstName,
        lastName: userDef.lastName,
        passwordHash,
        isActive: true,
        requiresPasswordChange: false,
      },
    });

    // Assign role
    const roleId = roles[userDef.role];
    if (roleId) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        update: {},
        create: {
          userId: user.id,
          roleId,
          tenantId: tenant.id,
          assignedBy: null,
        },
      });
    }

    // Assign to branch
    await prisma.userBranch.upsert({
      where: { userId_branchId: { userId: user.id, branchId: branch.id } },
      update: {},
      create: {
        userId: user.id,
        branchId: branch.id,
        tenantId: tenant.id,
        isPrimary: true,
      },
    });
  }
  console.log(`✅ ${userDefs.length} users created`);

  // ─── Initial Inventory ────────────────────────────────────────────────
  const initialMovements = [
    { sku: 'TILE-CER-300X300', quantity: 200, unit: 'BOX' },
    { sku: 'TILE-CER-400X400', quantity: 150, unit: 'BOX' },
    { sku: 'TILE-POR-600X600', quantity: 100, unit: 'BOX' },
    { sku: 'TILE-POR-800X800', quantity: 80, unit: 'BOX' },
    { sku: 'CEMENT-PORT-42.5', quantity: 500, unit: 'BAG' },
    { sku: 'CEMENT-PORT-32.5', quantity: 400, unit: 'BAG' },
    { sku: 'ADHESIVE-TILE-25KG', quantity: 100, unit: 'BAG' },
    { sku: 'GROUT-WHITE-5KG', quantity: 80, unit: 'BAG' },
    { sku: 'WC-VITREOUS-1PC', quantity: 30, unit: 'PIECE' },
    { sku: 'BASIN-WALL-60CM', quantity: 25, unit: 'PIECE' },
    { sku: 'TROWEL-300MM', quantity: 100, unit: 'PIECE' },
    { sku: 'TILE-CUTTER-600MM', quantity: 15, unit: 'PIECE' },
  ];

  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@retailguard-demo.com' } });

  for (const mov of initialMovements) {
    const product = await prisma.product.findFirst({
      where: { tenantId: tenant.id, sku: mov.sku },
    });
    if (product) {
      const existingMovement = await prisma.inventoryMovement.findFirst({
        where: { tenantId: tenant.id, productId: product.id, movementType: 'initial_stock' },
      });
      if (!existingMovement) {
        await prisma.inventoryMovement.create({
          data: {
            tenantId: tenant.id,
            productId: product.id,
            locationType: 'warehouse',
            locationId: warehouse.id,
            movementType: 'initial_stock',
            quantity: mov.quantity,
            unit: mov.unit,
            reason: 'Initial stock on seed',
            recordedBy: adminUser?.id || '00000000-0000-0000-0000-000000000000',
          },
        });
      }
    }
  }
  console.log(`✅ ${initialMovements.length} initial inventory movements created`);

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Login Credentials:');
  console.log('   Password for all users: password123');
  console.log('   Admin:     admin@retailguard-demo.com');
  console.log('   Manager:   manager@retailguard-demo.com');
  console.log('   Supervisor: supervisor@retailguard-demo.com');
  console.log('   Cashier 1: cashier1@retailguard-demo.com');
  console.log('   Cashier 2: cashier2@retailguard-demo.com');
  console.log('   Warehouse: warehouse@retailguard-demo.com');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });