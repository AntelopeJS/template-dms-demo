import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { ProductCategoryModel, ProductModel } from "./database";

// What hangs off a category: its products, and for a family its ranges. The
// category list counts them, and deleting a category that still holds any
// is refused, so no product nor range is left pointing at nothing.

const CONFLICT = 409;

async function rangesOf(familyId: string): Promise<string[]> {
  const ranges = await GetModel(ProductCategoryModel).getBy("parent", familyId);
  return ranges.map((range) => range._id);
}

/** Products filed under a range, or under every range of a family. */
export async function countCategoryProducts(
  id: string,
  isFamily: boolean,
): Promise<number> {
  const categories = isFamily ? [id, ...(await rangesOf(id))] : [id];
  const products = await GetModel(ProductModel).getBy(
    "category",
    ...categories,
  );
  return products.length;
}

/** Refuses to delete a category that still holds products or ranges. */
export async function refuseUsedCategories(ids: string[]): Promise<void> {
  const [products, ranges] = await Promise.all([
    GetModel(ProductModel).getBy("category", ...ids),
    GetModel(ProductCategoryModel).getBy("parent", ...ids),
  ]);
  if (products.length > 0) {
    throw new HTTPResult(CONFLICT, "$helio.catalog.categories.errors.inUse");
  }
  if (ranges.length > 0) {
    throw new HTTPResult(
      CONFLICT,
      "$helio.catalog.categories.errors.hasRanges",
    );
  }
}
