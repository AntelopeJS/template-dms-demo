import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { CustomerModel } from "../crm/database";
import { VAT_BUSINESS } from "./lines";

// The reduced Belgian rate (6 %) only covers renovation works in a private
// home over ten years old: a business is invoiced at the standard 21 %. The
// write routes refuse a business quote at a lower rate, whichever client sent
// it; a household may be quoted at either rate (a home under ten years pays
// 21 % too).
export async function assertVatRate(
  customerId: unknown,
  vatRate: unknown,
): Promise<void> {
  if (typeof customerId !== "string" || typeof vatRate !== "number") return;
  if (vatRate >= VAT_BUSINESS) return;
  const customer = await GetModel(CustomerModel).get(customerId);
  if (customer?.kind !== "business") return;
  throw new HTTPResult(400, {
    message: "$helio.sales.quotes.errors.businessVat",
    field: "vatRate",
  });
}
