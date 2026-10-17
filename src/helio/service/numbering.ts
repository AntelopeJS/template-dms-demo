// Ticket numbers follow each other: T-1001 is the oldest seeded ticket, and a
// new ticket — from the form or the simulator — takes the next free one, so
// nobody has to guess it.

import type { RequestContext } from "@antelopejs/interface-api";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { fireTicketOpened } from "../platform/automation/events";
import { mailTicketReceived } from "../platform/mailing/send";
import { TicketModel } from "./database";
import { notifyUrgentTicket } from "./notifications";

const PREFIX = "T-";

/** The next free number, after the highest one already used. */
export async function nextTicketNumber(): Promise<string> {
  const tickets = await GetModel(TicketModel).getAll();
  const last = tickets.reduce((highest, ticket) => {
    if (!ticket.number?.startsWith(PREFIX)) return highest;
    const sequence = Number(ticket.number.slice(PREFIX.length));
    return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);
  return `${PREFIX}${last + 1}`;
}

function readBody(raw: Buffer | string): Record<string, unknown> | undefined {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
  if (!text) return undefined;
  const parsed: unknown = JSON.parse(text);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? Object.fromEntries(Object.entries(parsed))
    : undefined;
}

// Once written, an urgent ticket warns the owners. Looked up by its number:
// the data API's insert does not hand the new id back in a stable shape.
async function afterCreate(body: Record<string, unknown>): Promise<void> {
  if (typeof body.number !== "string") return;
  const [ticket] = await GetModel(TicketModel).getBy("number", body.number);
  if (!ticket) return;
  if (ticket.priority === "urgent") await notifyUrgentTicket(ticket);
  // Helio platform: the customer's acknowledgement e-mail (in the background,
  // never failing the creation) and the "Ticket opened" automation trigger.
  void mailTicketReceived(ticket);
  fireTicketOpened(ticket);
}

/**
 * The `new` route with the number filled in when the body leaves it empty.
 * The data API reads the raw request body, which a `new` guard only gets a
 * parsed copy of, so the number is written into the body before the route
 * (permission check, guards, validation) runs. Two tickets created in the
 * same instant could draw the same number: fine for a demo, a real desk
 * would use an atomic counter.
 */
export function withTicketNumber(
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
      if (!body) return route.func.call(this, ctx, params, raw, ...rest);
      if (!body.number) body.number = await nextTicketNumber();
      const filled = Buffer.from(JSON.stringify(body), "utf8");
      const result: unknown = await route.func.call(
        this,
        ctx,
        params,
        filled,
        ...rest,
      );
      await afterCreate(body);
      return result;
    },
  };
}
