import type { RequestContext } from "@antelopejs/interface-api";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { readBody, textOf } from "../shared/body-defaults";
import { isObject, isText } from "../shared/json";
import { fireTicketOpened } from "../platform/automation/events";
import { mailTicketReceived } from "../platform/mailing/send";
import { defaultHolderFor } from "./assignees";
import { TicketModel } from "./database";
import { notifyUrgentTicket } from "./notifications";

const PREFIX = "T-";

/**
 * The next free number, after the highest one already used. Numbers follow
 * each other from T-1001, the oldest seeded ticket, so a new ticket from the
 * form or the simulator never needs its number guessed.
 */
export async function nextTicketNumber(): Promise<string> {
  const tickets = await GetModel(TicketModel).getAll();
  const last = tickets.reduce((highest, ticket) => {
    if (!ticket.number?.startsWith(PREFIX)) return highest;
    const sequence = Number(ticket.number.slice(PREFIX.length));
    return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);
  return `${PREFIX}${last + 1}`;
}

/**
 * Once a ticket is written, warns the owners of an urgent one, mails the
 * customer an acknowledgement (in the background, never failing the creation)
 * and fires the "Ticket opened" automation trigger. `id` is the created
 * ticket's, read from the answer of the `new` route.
 */
async function afterCreate(id: string): Promise<void> {
  const ticket = await GetModel(TicketModel).get(id);
  if (!ticket) return;
  if (ticket.priority === "urgent") await notifyUrgentTicket(ticket);
  void mailTicketReceived(ticket);
  fireTicketOpened(ticket);
}

/**
 * Whether the `new` route's answer carries the created row's `_id`
 * (interface-data-api#43).
 */
function hasCreatedId(answer: unknown): answer is { _id: string } {
  return isObject(answer) && "_id" in answer && isText(answer._id);
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
        const holder = await defaultHolderFor(textOf(body.priority));
        if (holder) body.assignee = holder;
      }
      const result: unknown = await route.func.call(
        this,
        ctx,
        params,
        body,
        ...rest,
      );
      if (hasCreatedId(result)) await afterCreate(result._id);
      return result;
    },
  };
}
