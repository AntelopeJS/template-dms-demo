// The installation a ticket is about belongs to the ticket's customer. The
// form's site picker lists every site: the DMS cannot narrow a relation
// picker to the customer chosen in the same form, so the data routes refuse
// a mismatch instead of storing it.

import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { SiteModel } from "../monitoring/database";

const blank = (value: unknown): boolean =>
  value === undefined || value === null || value === "";

/** Refuses (400) a site of another customer than the ticket's. */
export async function assertSiteOfCustomer(
  customer: unknown,
  site: unknown,
): Promise<void> {
  if (blank(customer) || blank(site) || typeof site !== "string") return;
  const row = await GetModel(SiteModel).get(site);
  if (row && row.customer !== customer) {
    throw new HTTPResult(400, {
      message: "$helio.service.rules.siteOfOtherCustomer",
      field: "site",
    });
  }
}
