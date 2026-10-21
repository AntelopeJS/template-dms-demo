import type { RequestContext } from "@antelopejs/interface-api";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";

type Body = Record<string, unknown>;

/** The JSON object a `new` or `edit` request sent, or undefined. */
export function readBody(raw: Buffer | string): Body | undefined {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
  if (!text) return undefined;
  const parsed: unknown = JSON.parse(text);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? Object.fromEntries(Object.entries(parsed))
    : undefined;
}

/** Whether a body leaves a field empty (0 and false are values). */
export const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || value === "";

/**
 * A data API route whose body gets the values `fill` writes in before the
 * route runs. A guard only gets a parsed copy of the body, so defaults that
 * need the database (the next number, the settings) are written here and the
 * amended object is handed on (the data API takes a parsed body since
 * interface-data-api#43); the route's permission check, guard and
 * validation then see them as sent.
 */
export function withBodyDefaults(
  route: DataControllerCallback,
  fill: (body: Body) => Promise<void>,
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
      if (!body) return route.func.call(this, ctx, params, raw, ...rest);
      await fill(body);
      return route.func.call(this, ctx, params, body, ...rest);
    },
  };
}
