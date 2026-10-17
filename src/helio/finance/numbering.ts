// Invoice numbers follow the issue year: F-2026-0001, F-2026-0002, … A new
// invoice created without a number gets the next free one of the current
// year, so the form never asks the user to guess it.

import type { RequestContext } from "@antelopejs/interface-api";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { InvoiceModel } from "./database";

const SEQUENCE_WIDTH = 4;

/** The next free number of `year`, after the highest one already used. */
export async function nextInvoiceNumber(
  year = new Date().getFullYear(),
): Promise<string> {
  const prefix = `F-${year}-`;
  const invoices = await GetModel(InvoiceModel).getAll();
  const last = invoices.reduce((highest, invoice) => {
    if (!invoice.number?.startsWith(prefix)) return highest;
    const sequence = Number(invoice.number.slice(prefix.length));
    return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);
  return `${prefix}${String(last + 1).padStart(SEQUENCE_WIDTH, "0")}`;
}

function readBody(raw: Buffer | string): Record<string, unknown> | undefined {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
  if (!text) return undefined;
  const parsed: unknown = JSON.parse(text);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? Object.fromEntries(Object.entries(parsed))
    : undefined;
}

/**
 * The `new` route with the number filled in when the body leaves it empty.
 * The data API reads the raw request body, which a `new` guard only gets a
 * parsed copy of, so the number is written into the body before the route
 * (permission check, guard, validation) runs. Two invoices created in the
 * same instant could draw the same number: fine for a demo, a real ledger
 * would use an atomic counter.
 */
export function withInvoiceNumber(
  route: DataControllerCallback,
): DataControllerCallback {
  return {
    ...route,
    func: async function (
      this: unknown,
      ctx: RequestContext,
      params: unknown,
      raw: Buffer | string,
      ...rest: unknown[]
    ) {
      const body = readBody(raw);
      if (!body || body.number) {
        return route.func.call(this, ctx, params, raw, ...rest);
      }
      body.number = await nextInvoiceNumber();
      const filled = Buffer.from(JSON.stringify(body), "utf8");
      return route.func.call(this, ctx, params, filled, ...rest);
    },
  };
}
