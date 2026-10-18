// What the projects data routes enforce whatever form writes to them (the
// projects table's drawer, the detail page's form, a duplicate):
//
// - the code follows the others: CH-0101 is the oldest seeded project, and a
//   new project left without a code takes the next free one, like a ticket's
//   number; a duplicate starts without the code of the project it copies;
// - a code names one project only;
// - a project never ends before it starts;
// - the quote a project carries out is one of its customer's (the form's
//   quote picker lists every quote: the DMS cannot narrow a relation picker
//   to the customer chosen in the same form).

import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { QuoteModel } from "../sales/database";
import { ProjectModel } from "./database";

const PREFIX = "CH-";
const DIGITS = 4;

/** The next free code, after the highest one already used. */
export async function nextProjectCode(): Promise<string> {
  const projects = await GetModel(ProjectModel).getAll();
  const last = projects.reduce((highest, project) => {
    if (!project.code?.startsWith(PREFIX)) return highest;
    const sequence = Number(project.code.slice(PREFIX.length));
    return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);
  return `${PREFIX}${String(last + 1).padStart(DIGITS, "0")}`;
}

function readBody(raw: Buffer | string): Record<string, unknown> | undefined {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
  if (!text) return undefined;
  const parsed: unknown = JSON.parse(text);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? Object.fromEntries(Object.entries(parsed))
    : undefined;
}

const blank = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "");

/**
 * The `new` route with the code filled in when the body leaves it empty. The
 * data API reads the raw body, which a `new` guard only gets a parsed copy
 * of, so the code is written into the body before the route (permission
 * check, guards, validation) runs.
 */
export function withProjectCode(
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
      if (!body || !blank(body.code)) {
        return route.func.call(this, ctx, params, raw, ...rest);
      }
      body.code = await nextProjectCode();
      const filled = Buffer.from(JSON.stringify(body), "utf8");
      return route.func.call(this, ctx, params, filled, ...rest);
    },
  };
}

/**
 * The `get` route, without the code when the row is read for a duplicate
 * (`?action=duplicate`): the copy then takes the next code on creation
 * instead of offering the original's, which the code rule would refuse.
 */
export function withoutCodeOnDuplicate(
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
      if (ctx.url?.searchParams.get("action") !== "duplicate") return row;
      if (!row || typeof row !== "object") return row;
      return { ...row, code: undefined };
    },
  };
}

// The calendar day of a date, as a sortable number (20261019): a project may
// start and end the same day, whatever hours the form and the seed store.
const dayOf = (value: unknown): number | undefined => {
  if (blank(value)) return undefined;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Number(value.replace(/-/g, ""));
  }
  const date = new Date(value as string | Date);
  if (Number.isNaN(date.getTime())) return undefined;
  return (
    date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
  );
};

/** Refuses (400) a code another project already carries. */
export async function assertUniqueCode(
  code: unknown,
  ownId?: string,
): Promise<void> {
  if (typeof code !== "string" || code.trim() === "") return;
  const taken = await GetModel(ProjectModel).getBy("code", code.trim());
  if (taken.some((project) => project._id !== ownId)) {
    throw new HTTPResult(400, {
      message: "$helio.projects.rules.codeTaken",
      field: "code",
    });
  }
}

/** Refuses (400) an end before the start. */
export function assertEndAfterStart(start: unknown, end: unknown): void {
  const from = dayOf(start);
  const to = dayOf(end);
  if (from !== undefined && to !== undefined && to < from) {
    throw new HTTPResult(400, {
      message: "$helio.projects.rules.endBeforeStart",
      field: "plannedEnd",
    });
  }
}

/** Refuses (400) a quote made out to another customer than the project's. */
export async function assertQuoteOfCustomer(
  customer: unknown,
  quote: unknown,
): Promise<void> {
  if (blank(customer) || blank(quote) || typeof quote !== "string") return;
  const row = await GetModel(QuoteModel).get(quote);
  if (row && row.customer !== customer) {
    throw new HTTPResult(400, {
      message: "$helio.projects.rules.quoteOfOtherCustomer",
      field: "quote",
    });
  }
}
