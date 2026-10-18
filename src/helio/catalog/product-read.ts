import type { RequestContext } from "@antelopejs/interface-api";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { ProductModel } from "./database";

// The products controller keeps two database @Computed fields (the family and
// the low-stock flag) that its views and quick filters narrow on. On this
// stack, a single-row read of a controller with a @Computed field resolves
// its relations against the wrong document (the MongoDB pipeline nests the
// row twice), so `get` answered `category: null` while the list joined it,
// and the edit form opened with an empty range. The form's cascader takes the
// plain range id as well as the joined row, so the read puts back the id the
// product stores whenever the join came back empty.

type ReadRow = Record<string, unknown> & { _id?: unknown; category?: unknown };

async function storedCategory(id: unknown): Promise<string | undefined> {
  if (typeof id !== "string") return undefined;
  const product = await GetModel(ProductModel).get(id);
  return product?.category || undefined;
}

/** The `get` route, with the stored range id when the join came back empty. */
export function withStoredCategory(
  route: DataControllerCallback,
): DataControllerCallback {
  return {
    ...route,
    func: async function (
      this: unknown,
      ctx: RequestContext,
      ...rest: unknown[]
    ) {
      const read = route.func as (...args: unknown[]) => unknown;
      const row: unknown = await read.call(this, ctx, ...rest);
      if (!row || typeof row !== "object") return row;
      const product = row as ReadRow;
      if (product.category) return row;
      const category = await storedCategory(product._id);
      return category ? { ...product, category } : row;
    },
  };
}
