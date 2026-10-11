import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ShiftsService } from './shifts.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { CloseShiftDto, OpenShiftDto, ShiftQueryDto } from './dto/shifts.dto';

/**
 * Shift lifecycle endpoints consumed by the RetailGuard SPA:
 * POST /shifts/open (openShift), GET /shifts/current?branchId= (getCurrentShift).
 * GET /current must be declared before GET /:id so the literal segment wins.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post('open')
  async open(
    @TenantId() tenantId: string,
    @Body() dto: OpenShiftDto,
    @CurrentUser('id') cashierId: string,
  ) {
    return this.shiftsService.open(tenantId, dto, cashierId);
  }

  @Get('current')
  async getCurrent(
    @TenantId() tenantId: string,
    @Query('branchId') branchId?: string,
    // cashierId is sent by the SPA; the shift is scoped to the authenticated
    // user server-side, so it is accepted but not used for lookups.
    @Query('cashierId') _cashierId?: string,
  ) {
    if (!branchId) {
      return null;
    }
    return this.shiftsService.getCurrentShift(tenantId, branchId);
  }

  @Post(':id/close')
  async close(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CloseShiftDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.shiftsService.close(tenantId, id, dto, userId);
  }

  @Get()
  async findAll(
    @TenantId() tenantId: string,
    @Query() query?: ShiftQueryDto,
  ) {
    return this.shiftsService.findAll(tenantId, query);
  }

  @Get(':id')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.shiftsService.findOne(tenantId, id);
  }
}