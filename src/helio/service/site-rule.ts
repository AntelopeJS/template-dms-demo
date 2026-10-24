// The installation a ticket is about belongs to the ticket's customer. The
// form's site picker lists the chosen customer's sites only (`filterBy`), but
// that narrows what is offered, not what is written: the data routes still
// refuse a mismatch instead of storing it.

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
