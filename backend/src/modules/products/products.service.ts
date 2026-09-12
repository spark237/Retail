import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto, UpdateProductDto, CreateProductCategoryDto, UpdateProductCategoryDto, CreateProductPriceDto, UpdateProductPriceDto, ProductQueryDto } from './dto/products.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Categories ───────────────────────────────────────────────────────

  async createCategory(tenantId: string, dto: CreateProductCategoryDto, createdBy: string) {
    const existing = await this.prisma.productCategory.findFirst({
      where: { tenantId, slug: dto.slug, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A category with this slug already exists',
      });
    }

    if (dto.parentId) {
      const parent = await this.prisma.productCategory.findFirst({
        where: { id: dto.parentId, tenantId, deletedAt: null },
      });
      if (!parent) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Parent category not found',
        });
      }
    }

    const category = await this.prisma.productCategory.create({
      data: {
        tenantId,
        name: dto.name,
        slug: dto.slug,
        description: dto.description || null,
        parentId: dto.parentId || null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    this.logger.log(`Product category created: ${category.name} (tenant: ${tenantId})`);
    return category;
  }

  async findAllCategories(tenantId: string) {
    return this.prisma.productCategory.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        _count: { select: { products: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOneCategory(tenantId: string, id: string) {
    const category = await this.prisma.productCategory.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: { where: { deletedAt: null, isActive: true } },
        _count: { select: { products: true } },
      },
    });

    if (!category) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Product category not found',
      });
    }

    return category;
  }

  async updateCategory(tenantId: string, id: string, dto: UpdateProductCategoryDto, updatedBy: string) {
    await this.findOneCategory(tenantId, id);

    if (dto.slug) {
      const existing = await this.prisma.productCategory.findFirst({
        where: { tenantId, slug: dto.slug, id: { not: id }, deletedAt: null },
      });
      if (existing) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'A category with this slug already exists',
        });
      }
    }

    if (dto.parentId && dto.parentId === id) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'A category cannot be its own parent',
      });
    }

    const category = await this.prisma.productCategory.update({
      where: { id },
      data: { ...dto },
    });

    this.logger.log(`Product category updated: ${category.name}`);
    return category;
  }

  async removeCategory(tenantId: string, id: string, deletedBy: string) {
    await this.findOneCategory(tenantId, id);

    // Check if category has products
    const productCount = await this.prisma.product.count({
      where: { categoryId: id, tenantId, deletedAt: null },
    });
    if (productCount > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Cannot delete category. ${productCount} product(s) are assigned to it.`,
      });
    }

    await this.prisma.productCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    this.logger.log(`Product category soft-deleted: ${id}`);
    return { message: 'Category deleted successfully' };
  }

  // ─── Products ─────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateProductDto, createdBy: string) {
    const existing = await this.prisma.product.findFirst({
      where: { tenantId, sku: dto.sku, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A product with this SKU already exists',
      });
    }

    if (dto.barcode) {
      const barcodeExists = await this.prisma.product.findFirst({
        where: { tenantId, barcode: dto.barcode, deletedAt: null },
      });
      if (barcodeExists) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'A product with this barcode already exists',
        });
      }
    }

    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findFirst({
        where: { id: dto.categoryId, tenantId, deletedAt: null },
      });
      if (!category) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Category not found',
        });
      }
    }

    const product = await this.prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          tenantId,
          sku: dto.sku,
          barcode: dto.barcode || null,
          name: dto.name,
          description: dto.description || null,
          categoryId: dto.categoryId || null,
          brand: dto.brand || null,
          unitOfMeasure: dto.unitOfMeasure || 'UNIT',
          stockUnit: dto.stockUnit,
          stockToSqmFactor: dto.stockToSqmFactor ?? null,
          stockToPieceFactor: dto.stockToPieceFactor ?? null,
          isDamageTracked: dto.isDamageTracked ?? true,
          reorderLevel: dto.reorderLevel ?? null,
          reorderQuantity: dto.reorderQuantity ?? null,
          imageUrl: dto.imageUrl || null,
          createdBy,
          updatedBy: createdBy,
        },
      });

      // Create prices if provided
      if (dto.prices?.length) {
        await tx.productPrice.createMany({
          data: dto.prices.map((price: { branchId?: string; unit: string; sellingPrice: number; costPrice?: number; minPrice?: number; vatRate?: number; isPromotional?: boolean; createdBy?: string }) => ({
            productId: p.id,
            tenantId,
            branchId: price.branchId || null,
            unit: price.unit,
            sellingPrice: price.sellingPrice,
            costPrice: price.costPrice ?? null,
            minPrice: price.minPrice ?? null,
            vatRate: price.vatRate ?? 19.25,
            isPromotional: price.isPromotional ?? false,
            createdBy,
          })),
        });
      }

      return tx.product.findUnique({
        where: { id: p.id },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          productPrices: true,
        },
      });
    });

    this.logger.log(`Product created: ${product!.name} (SKU: ${product!.sku}, tenant: ${tenantId})`);
    return product!;
  }

  async findAll(tenantId: string, query?: ProductQueryDto) {
    const where: any = { tenantId, deletedAt: null };

    if (query?.isActive !== undefined) where.isActive = query.isActive;
    if (query?.categoryId) where.categoryId = query.categoryId;
    if (query?.includeInactive) delete where.isActive;

    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { barcode: { contains: query.search, mode: 'insensitive' } },
        { brand: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        productPrices: {
          where: { validTo: null },
        },
        _count: {
          select: { inventoryMovements: true, saleItems: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        productPrices: {
          where: { validTo: null },
          include: { branch: { select: { id: true, name: true, code: true } } },
        },
      },
    });

    if (!product) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Product not found',
      });
    }

    return product;
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto, updatedBy: string) {
    await this.findOne(tenantId, id);

    if (dto.sku) {
      const existing = await this.prisma.product.findFirst({
        where: { tenantId, sku: dto.sku, id: { not: id }, deletedAt: null },
      });
      if (existing) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'A product with this SKU already exists',
        });
      }
    }

    if (dto.barcode) {
      const barcodeExists = await this.prisma.product.findFirst({
        where: { tenantId, barcode: dto.barcode, id: { not: id }, deletedAt: null },
      });
      if (barcodeExists) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'A product with this barcode already exists',
        });
      }
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        updatedBy,
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        productPrices: {
          where: { validTo: null },
        },
      },
    });

    this.logger.log(`Product updated: ${product.name}`);
    return product;
  }

  async remove(tenantId: string, id: string, deletedBy: string) {
    await this.findOne(tenantId, id);

    await this.prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        updatedBy: deletedBy,
      },
    });

    this.logger.log(`Product soft-deleted: ${id}`);
    return { message: 'Product deleted successfully' };
  }

  // ─── Product Prices ──────────────────────────────────────────────────

  async addPrice(tenantId: string, productId: string, dto: CreateProductPriceDto, createdBy: string) {
    await this.findOne(tenantId, productId);

    const price = await this.prisma.productPrice.create({
      data: {
        productId,
        tenantId,
        branchId: dto.branchId || null,
        unit: dto.unit,
        sellingPrice: dto.sellingPrice,
        costPrice: dto.costPrice ?? null,
        minPrice: dto.minPrice ?? null,
        vatRate: dto.vatRate ?? 19.25,
        isPromotional: dto.isPromotional ?? false,
        createdBy,
      },
    });

    this.logger.log(`Price added for product ${productId}: ${dto.unit} = ${dto.sellingPrice}`);
    return price;
  }

  async findPrices(tenantId: string, productId: string) {
    await this.findOne(tenantId, productId);

    return this.prisma.productPrice.findMany({
      where: { productId, tenantId, validTo: null },
      include: { branch: { select: { id: true, name: true, code: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updatePrice(tenantId: string, productId: string, priceId: string, dto: UpdateProductPriceDto) {
    await this.findOne(tenantId, productId);

    const existing = await this.prisma.productPrice.findFirst({
      where: { id: priceId, productId, tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Product price not found',
      });
    }

    const price = await this.prisma.productPrice.update({
      where: { id: priceId },
      data: { ...dto },
    });

    this.logger.log(`Price updated for product ${productId}`);
    return price;
  }
}