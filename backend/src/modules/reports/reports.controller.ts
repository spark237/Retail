import { Controller, Get, Logger, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CashReportQueryDto, SalesSummaryQueryDto } from './dto/reports.dto';

/**
 * Reports endpoints consumed by the RetailGuard SPA.
 * Response shapes match the frontend service contracts in
 * frontend/src/api/services.ts (CashReportRow[] and the sales summary object);
 * every query is scoped to the authenticated user's tenant (TenantId from JWT).
 */
@UseGuards(AuthGuard('jwt'))
@Controller('reports')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(private readonly reportsService: ReportsService) {}

  @Get('cash')
  async getCashReport(
    @TenantId() tenantId: string,
    @Query() query: CashReportQueryDto,
  ) {
    return this.reportsService.getCashReport(tenantId, query);
  }

  @Get('sales/summary')
  async getSalesSummary(
    @TenantId() tenantId: string,
    @Query() query: SalesSummaryQueryDto,
  ) {
    return this.reportsService.getSalesSummary(tenantId, query);
  }
}