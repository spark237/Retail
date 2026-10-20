import { IsOptional, IsString } from 'class-validator';

/**
 * Query DTO for GET /reports/cash.
 * The SPA sends an optional `date` (YYYY-MM-DD) — see
 * frontend/src/pages/CashReportPage.tsx / getCashReports in services.ts.
 */
export class CashReportQueryDto {
  @IsOptional()
  @IsString()
  date?: string;
}

/**
 * Query DTO for GET /reports/sales/summary.
 * The SPA sends optional startDate/endDate (YYYY-MM-DD), branchId (UUID) and
 * paymentMethod ('cash' | 'mtn' | 'orange' | 'bank') — see
 * frontend/src/pages/SalesReportPage.tsx / getSalesSummary in services.ts.
 */
export class SalesSummaryQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;
}