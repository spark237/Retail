import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FraudService } from './fraud.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { FraudQueryDto, ResolveAlertDto, RunDetectionDto } from './dto/fraud.dto';

/**
 * Fraud alert endpoints. The SPA (services.ts) calls GET /fraud-alerts
 * (optionally ?severity=&status=) and POST /fraud-alerts/:id/resolve with an
 * empty body; ResolveAlertDto is fully optional so an empty body validates
 * cleanly. POST /run-detection and GET /summary are exposed for ops tooling.
 * NOTE: the SPA contract is /fraud-alerts (dash), not /fraud/alerts.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('fraud-alerts')
export class FraudController {
  constructor(private readonly fraudService: FraudService) {}

  @Get()
  async findAll(
    @TenantId() tenantId: string,
    @Query() query?: FraudQueryDto,
  ) {
    return this.fraudService.findAllAlerts(tenantId, query);
  }

  @Post('run-detection')
  async runDetection(
    @TenantId() tenantId: string,
    @Body() dto?: RunDetectionDto,
  ) {
    return this.fraudService.runDetection(tenantId, dto);
  }

  @Get('summary')
  async summary(@TenantId() tenantId: string) {
    return this.fraudService.getAlertSummary(tenantId);
  }

  @Get(':id')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.fraudService.findOneAlert(tenantId, id);
  }

  @Post(':id/resolve')
  async resolve(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ResolveAlertDto,
    @CurrentUser('id') resolvedBy: string,
  ) {
    return this.fraudService.resolveAlert(tenantId, id, dto, resolvedBy);
  }
}