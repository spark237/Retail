import { ProductPrice } from '@prisma/client';

/**
 * Server-side price resolution helpers.
 *
 * The client-supplied unit price in a sale payload is never trusted at face
 * value: the canonical selling price is resolved from `product_prices`
 * (branch-scoped row for the sale's branch if one exists, otherwise the
 * tenant-wide row) for the item's unit and treated as the authoritative price.
 */

/**
 * Pick the applicable price row for a branch: a branch-scoped row wins over
 * the tenant-wide (branch_id NULL) row. Returns undefined when neither exists.
 */
export function pickPriceForBranch(
  rows: ProductPrice[],
  branchId: string | null,
): ProductPrice | undefined {
  if (branchId) {
    const branchRow = rows.find((r) => r.branchId === branchId);
    if (branchRow) return branchRow;
  }
  return rows.find((r) => r.branchId === null);
}

/** Canonical selling price for a resolved row, or null when no row exists. */
export function canonicalPrice(row: ProductPrice | undefined): number | null {
  return row ? Number(row.sellingPrice) : null;
}

/**
 * The floor under which a sale line must not be priced: `min_price` when set,
 * falling back to the canonical selling price. Returns null when no row exists.
 */
export function priceFloor(row: ProductPrice | undefined): number | null {
  if (!row) return null;
  return row.minPrice != null ? Number(row.minPrice) : Number(row.sellingPrice);
}