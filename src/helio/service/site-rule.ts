import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { SiteModel } from "../monitoring/database";

const blank = (value: unknown): boolean =>
  value === undefined || value === null || value === "";

/**
 * Refuses (400) a site of another customer than the ticket's. The form's site
 * picker already lists only the chosen customer's sites (`filterBy`), but that
 * only narrows what is offered, so the data routes enforce it with this check.
 */
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
