// Resolving tickets reaches the dashboard's activity feed, in the name of
// whoever holds each ticket (the office's dispatcher for one nobody held),
// named like the seeded entries: "T-1042 · subject".

import { GetModel } from "@antelopejs/interface-database-decorators";
import { logActivity } from "../dashboard/log";
import { teamIdsByRole } from "../shared/roster";
import { type Ticket, TicketModel } from "./database";

const DISPATCHER = teamIdsByRole("office")[0] ?? "";

/** Logs the tickets just resolved or closed. */
export async function logTicketsResolved(
  tickets: readonly Ticket[],
): Promise<void> {
  await logActivity(
    ...tickets.map((ticket) => ({
      type: "ticket_resolved" as const,
      actor: ticket.assignee || DISPATCHER,
      subject: `${ticket.number} · ${ticket.subject}`,
      record: { kind: "ticket" as const, id: ticket._id },
    })),
  );
}

/** Logs a ticket resolved from its form (read once written). */
export async function logTicketResolved(id: string): Promise<void> {
  const ticket = await GetModel(TicketModel).get(id);
  if (ticket?.resolvedAt) await logTicketsResolved([ticket]);
}
