// The figures above the desk: how many tickets are open, how many are urgent
// or past their SLA, and how fast the last month's tickets were resolved.
// Computed from the tickets on each read (a few hundred rows).

import type { StatGroupItem } from "@antelopejs/interface-dms/base/stat-group";
import type { Ticket } from "./database";

const HOUR_MS = 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * HOUR_MS;

/** Links of the cells to the desk's views, given by the page. */
export interface ServiceStatLinks {
  open: string;
  urgent: string;
  breaching: string;
  resolved: string;
}

const count = (value: number) => ({ type: "count", value }) as const;

function averageResolutionHours(tickets: Ticket[], now: number): number {
  const durations = tickets
    .filter(
      (ticket) =>
        ticket.resolvedAt && now - ticket.resolvedAt.getTime() <= MONTH_MS,
    )
    .map(
      (ticket) =>
        (ticket.resolvedAt?.getTime() ?? 0) - ticket.createdAt.getTime(),
    );
  if (durations.length === 0) return 0;
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  return total / durations.length / HOUR_MS;
}

/** The four cells of the desk's stat group. */
export function serviceStats(
  tickets: Ticket[],
  links: ServiceStatLinks,
  now = Date.now(),
): StatGroupItem[] {
  const open = tickets.filter((ticket) => !ticket.resolvedAt);
  const unassigned = open.filter((ticket) => !ticket.assignee).length;
  const urgent = open.filter((ticket) => ticket.priority === "urgent");
  // The SLA promises someone takes the ticket in hand: past it, a ticket
  // nobody was assigned to breaches it.
  const breaching = open.filter(
    (ticket) => !ticket.assignee && ticket.slaDueAt.getTime() < now,
  );
  const fresh = open.filter((ticket) => ticket.status === "new").length;
  const hours = averageResolutionHours(tickets, now);
  return [
    {
      id: "open",
      icon: "i-ph-tray",
      tone: "primary",
      eyebrow: "$helio.service.stats.open",
      value: open.length,
      detail: {
        key: "$helio.service.stats.openDetail",
        params: { fresh: count(fresh), unassigned },
      },
      to: links.open,
    },
    {
      id: "urgent",
      icon: "i-ph-fire",
      tone: urgent.length > 0 ? "error" : "success",
      eyebrow: "$helio.service.stats.urgent",
      value: urgent.length,
      detail: "$helio.service.stats.urgentDetail",
      detailTone: urgent.length > 0 ? "error" : "neutral",
      to: links.urgent,
    },
    {
      id: "breaching",
      icon: "i-ph-alarm",
      tone: breaching.length > 0 ? "warning" : "success",
      eyebrow: "$helio.service.stats.breaching",
      value: breaching.length,
      detail: "$helio.service.stats.breachingDetail",
      detailTone: breaching.length > 0 ? "warning" : "neutral",
      to: links.breaching,
    },
    {
      id: "resolution",
      icon: "i-ph-timer",
      tone: "info",
      eyebrow: "$helio.service.stats.resolution",
      value: {
        key: "$helio.service.stats.resolutionValue",
        params: {
          hours: { type: "number", value: Math.round(hours * 10) / 10 },
        },
      },
      detail: "$helio.service.stats.resolutionDetail",
      to: links.resolved,
    },
  ];
}
