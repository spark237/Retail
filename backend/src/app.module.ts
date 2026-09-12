import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { BranchesModule } from './modules/branches/branches.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SalesModule } from './modules/sales/sales.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { DamagesModule } from './modules/damages/damages.module';
import { SyncModule } from './modules/sync/sync.module';
import { FraudModule } from './modules/fraud/fraud.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PrismaModule } from './database/prisma.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([{
      name: 'global',
      ttl: 60000,
      limit: 100,
    }]),

    // Database
    PrismaModule,

    // Feature modules
    AuthModule,
    UsersModule,
    TenantsModule,
    BranchesModule,
    WarehousesModule,
    ProductsModule,
    InventoryModule,
    SalesModule,
    ShiftsModule,
    ExpensesModule,
    DamagesModule,
    SyncModule,
    FraudModule,
    AnalyticsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}