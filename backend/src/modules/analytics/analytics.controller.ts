import { Controller, Get, Logger, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AnalyticsService } from './analytics.service';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { DashboardQueryDto } from './dto/analytics.dto';

/**
 * Dashboard endpoints consumed by the RetailGuard SPA.
 * Shapes match the frontend service contracts in frontend/src/api/services.ts.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('dashboard')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('kpis')
  async getKpis(@TenantId() tenantId: string, @Query() query: DashboardQueryDto) {
    const kpis = await this.analyticsService.getDashboardKPIs(tenantId, query);
    return {
      todaySales: kpis.today.sales,
      pendingSync: kpis.operations.pendingSync,
      openShifts: kpis.operations.openShifts,
      activeAlerts: kpis.operations.openFraudAlerts,
    };
  }

  @Get('sales-trend')
  async getSalesTrend(@TenantId() tenantId: string, @Query() query: DashboardQueryDto) {
    return this.analyticsService.getSalesTrend(tenantId, query);
  }

  @Get('payment-breakdown')
  async getPaymentBreakdown(@TenantId() tenantId: string, @Query() query: DashboardQueryDto) {
    return this.analyticsService.getPaymentBreakdown(tenantId, query);
  }

  @Get('recent-sales')
  async getRecentSales(@TenantId() tenantId: string, @Query() query: DashboardQueryDto) {
    return this.analyticsService.getRecentSales(tenantId, query);
  }
}