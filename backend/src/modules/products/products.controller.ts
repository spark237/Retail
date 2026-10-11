import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProductsService } from './products.service';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { ProductQueryDto } from './dto/products.dto';

/**
 * Product catalog endpoints consumed by the RetailGuard SPA.
 * Shapes follow the frontend service contracts in frontend/src/api/services.ts.
 * All routes require a valid JWT; tenant scoping is applied via @TenantId()
 * so a tenant can only ever read its own catalog.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(
    @TenantId() tenantId: string,
    @Query() query?: ProductQueryDto,
  ) {
    return this.productsService.findAll(tenantId, query);
  }

  @Get('categories')
  async findCategories(@TenantId() tenantId: string) {
    return this.productsService.findAllCategories(tenantId);
  }
}