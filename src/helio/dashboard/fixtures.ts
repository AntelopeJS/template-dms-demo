// Seed of helio_activity: the last 30 days of business events, derived from
// the other Helio seeds (quotes sent and signed, deals won, projects started
// and finished, tickets opened and resolved, invoices paid or overdue), so
// every entry of the feed points at a record that exists.

import type { Tone } from "@antelopejs/interface-dms/base/types";
import { buildInvoices } from "../finance/fixtures";
import { customerFacts, dealFacts } from "../projects/crm-facts";
import { buildProjects } from "../projects/fixtures";
import { buildQuotes } from "../sales/fixtures";
import { buildTickets } from "../service/fixtures";
import { teamIdsByRole } from "../shared/roster";
import { createRng, DAY_MS, padId, type Rng } from "../shared/seed";
import type { Activity, ActivityType } from "./database";

export type ActivitySeed = Pick<
  Activity,
  "_id" | "at" | "actor" | "type" | "subject" | "link" | "tone"
>;

const WINDOW_DAYS = 30;
const MAX_EVENTS = 150;
const HOUR_MS = 60 * 60 * 1000;

const SALES = teamIdsByRole("sales");
const OFFICE = teamIdsByRole("office");
const TECHNICIANS = teamIdsByRole("technician");

/**
 * Dashboard paths the feed links to, by record kind. Kept in one place so the
 * pages (wave B) and these links agree; `{id}` is the record's `_id`.
 */
export const HELIO_LINKS = {
  deal: "/helio/sales/pipeline?record={id}",
  quote: "/helio/sales/quotes?record={id}",
  project: "/helio/operations/projects/{id}",
  ticket: "/helio/operations/service-desk?record={id}",
  invoice: "/helio/invoices?record={id}",
} as const;

const TONES: Record<ActivityType, Tone> = {
  deal_won: "success",
  quote_sent: "info",
  quote_accepted: "success",
  project_started: "primary",
  project_done: "success",
  ticket_opened: "warning",
  ticket_resolved: "success",
  invoice_paid: "success",
  invoice_overdue: "error",
};

type EventDraft = Omit<ActivitySeed, "_id" | "tone">;

function link(kind: keyof typeof HELIO_LINKS, id: string): string {
  return HELIO_LINKS[kind].replace("{id}", id);
}

function recent(date: Date | undefined): date is Date {
  if (!date) return false;
  const age = Date.now() - date.getTime();
  return age >= 0 && age <= WINDOW_DAYS * DAY_MS;
}

function quoteEvents(rng: Rng): EventDraft[] {
  const events: EventDraft[] = [];
  for (const quote of buildQuotes()) {
    const name = customerFacts(quote.customer).name;
    const owner = quote.deal ? dealFacts(quote.deal).owner : rng.pick(SALES);
    const subject = `${quote.number} · ${name}`;
    if (recent(quote.sentAt)) {
      events.push({
        at: quote.sentAt,
        actor: owner,
        type: "quote_sent",
        subject,
        link: link("quote", quote._id),
      });
    }
    if (quote.status === "accepted" && recent(quote.signedAt)) {
      events.push({
        at: quote.signedAt,
        actor: owner,
        type: "quote_accepted",
        subject,
        link: link("quote", quote._id),
      });
      if (quote.deal) {
        const deal = dealFacts(quote.deal);
        events.push({
          at: new Date(quote.signedAt.getTime() + HOUR_MS / 2),
          actor: deal.owner,
          type: "deal_won",
          subject: deal.title,
          link: link("deal", deal._id),
        });
      }
    }
  }
  return events;
}

function projectEvents(): EventDraft[] {
  const events: EventDraft[] = [];
  for (const project of buildProjects()) {
    const actor = project.leadTechnician ?? TECHNICIANS[0] ?? "";
    const subject = `${project.code} · ${project.name}`;
    if (
      recent(project.plannedStart) &&
      project.status !== "planned" &&
      project.status !== "scheduled"
    ) {
      events.push({
        at: project.plannedStart,
        actor,
        type: "project_started",
        subject,
        link: link("project", project._id),
      });
    }
    // Installed: finished, or waiting for the electrical inspection.
    if (
      (project.status === "done" || project.status === "inspection") &&
      recent(project.plannedEnd)
    ) {
      events.push({
        at: project.plannedEnd,
        actor,
        type: "project_done",
        subject,
        link: link("project", project._id),
      });
    }
  }
  return events;
}

function ticketEvents(rng: Rng): EventDraft[] {
  const events: EventDraft[] = [];
  for (const ticket of buildTickets()) {
    const subject = `${ticket.number} · ${ticket.subject}`;
    const actor = ticket.assignee ?? rng.pick(OFFICE);
    // Low-priority requests stay out of the feed: it would read as a ticket log.
    if (recent(ticket.createdAt) && ticket.priority !== "low") {
      events.push({
        at: ticket.createdAt,
        actor,
        type: "ticket_opened",
        subject,
        link: link("ticket", ticket._id),
      });
    }
    if (recent(ticket.resolvedAt)) {
      events.push({
        at: ticket.resolvedAt,
        actor,
        type: "ticket_resolved",
        subject,
        link: link("ticket", ticket._id),
      });
    }
  }
  return events;
}

function invoiceEvents(rng: Rng): EventDraft[] {
  const events: EventDraft[] = [];
  for (const invoice of buildInvoices()) {
    const subject = `${invoice.number} · ${customerFacts(invoice.customer).name}`;
    if (invoice.status === "paid" && recent(invoice.paidAt)) {
      events.push({
        at: invoice.paidAt,
        actor: rng.pick(OFFICE),
        type: "invoice_paid",
        subject,
        link: link("invoice", invoice._id),
      });
    }
    const overdueAt = new Date(invoice.dueAt.getTime() + DAY_MS);
    if (invoice.status === "overdue" && recent(overdueAt)) {
      events.push({
        at: overdueAt,
        actor: rng.pick(OFFICE),
        type: "invoice_overdue",
        subject,
        link: link("invoice", invoice._id),
      });
    }
  }
  return events;
}

let activity: ActivitySeed[] | undefined;

/** The newest 150 events of the last 30 days, `act-001` being the latest. */
export function buildActivity(): ActivitySeed[] {
  if (!activity) {
    const rng = createRng(0x9e110008);
    const events = [
      ...quoteEvents(rng),
      ...projectEvents(),
      ...ticketEvents(rng),
      ...invoiceEvents(rng),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, MAX_EVENTS);
    activity = events.map((event, at) => ({
      ...event,
      _id: padId("act", at + 1, 3),
      tone: TONES[event.type],
    }));
  }
  return activity;
}
