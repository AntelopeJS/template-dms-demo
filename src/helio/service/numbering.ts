// Ticket numbers follow each other: T-1001 is the oldest seeded ticket, and a
// new ticket — from the form or the simulator — takes the next free one, so
// nobody has to guess it.

import type { RequestContext } from "@antelopejs/interface-api";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { readBody } from "../shared/body-defaults";
import { fireTicketOpened } from "../platform/automation/events";
import { mailTicketReceived } from "../platform/mailing/send";
import { defaultHolderFor } from "./assignees";
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

// Once written, an urgent ticket warns the owners. `new` answers the created
// row with its `_id` (interface-data-api#43).
async function afterCreate(created: unknown): Promise<void> {
  const id = (created as { _id?: unknown } | null)?._id;
  if (typeof id !== "string") return;
  const ticket = await GetModel(TicketModel).get(id);
  if (!ticket) return;
  if (ticket.priority === "urgent") await notifyUrgentTicket(ticket);
  // Helio platform: the customer's acknowledgement e-mail (in the background,
  // never failing the creation) and the "Ticket opened" automation trigger.
  void mailTicketReceived(ticket);
  fireTicketOpened(ticket);
}

/**
 * The `new` route with the number filled in when the body leaves it empty,
 * and the holder when it names nobody (see defaultHolderFor).
 * A `new` guard only gets a parsed copy of the body, so the number is
 * written into the body, handed on parsed, before the route (permission
 * check, guards, validation) runs. Two tickets created in the
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
      if (!body.assignee) {
        const holder = await defaultHolderFor(body.priority);
        if (holder) body.assignee = holder;
      }
      const result: unknown = await route.func.call(
        this,
        ctx,
        params,
        body,
        ...rest,
      );
      await afterCreate(result);
      return result;
    },
  };
}
