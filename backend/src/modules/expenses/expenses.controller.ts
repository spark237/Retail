import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExpensesService } from './expenses.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { ApproveExpenseDto, CreateExpenseDto, ExpenseQueryDto } from './dto/expenses.dto';

/**
 * Expense endpoints. Not yet called by the SPA services.ts, but exposed for
 * the Reports/ops workflows; shapes match the service DTOs directly.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateExpenseDto,
    @CurrentUser('id') createdBy: string,
  ) {
    return this.expensesService.create(tenantId, dto, createdBy);
  }

  @Get()
  async findAll(
    @TenantId() tenantId: string,
    @Query() query?: ExpenseQueryDto,
  ) {
    return this.expensesService.findAll(tenantId, query);
  }

  @Get(':id')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.expensesService.findOne(tenantId, id);
  }

  @Post(':id/approve')
  async approve(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ApproveExpenseDto,
  ) {
    return this.expensesService.approve(tenantId, id, dto);
  }
}