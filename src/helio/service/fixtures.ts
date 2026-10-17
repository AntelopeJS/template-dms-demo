// Seed of helio_tickets: six months of after-sales requests. Technical
// tickets sit on a monitored site of their customer, billing questions on the
// customer alone; the newest are still new or open, a handful of urgent ones
// close to their SLA, and the offline and degraded sites have their alerts.

import { buildSites, type SiteSeed } from "../monitoring/fixtures";
import { activeCustomers } from "../projects/crm-facts";
import { COUNTS, teamIdsByRole, ticketId } from "../shared/roster";
import { createRng, DAY_MS, type Rng } from "../shared/seed";
import type {
  Ticket,
  TicketCategory,
  TicketChannel,
  TicketPriority,
  TicketStatus,
} from "./database";
import { SLA_HOURS } from "./options";
import { SUBJECTS } from "./subjects";

export type TicketSeed = Pick<
  Ticket,
  | "_id"
  | "number"
  | "subject"
  | "customer"
  | "site"
  | "category"
  | "priority"
  | "status"
  | "channel"
  | "assignee"
  | "slaDueAt"
  | "createdAt"
  | "resolvedAt"
  | "description"
  | "pinned"
>;

const HOUR_MS = 60 * 60 * 1000;
const HISTORY_DAYS = 182;
const FIRST_NUMBER = 1000;

const TECHNICIANS = teamIdsByRole("technician");
const OFFICE = teamIdsByRole("office");

interface TicketDraft {
  createdAt: Date;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  channel: TicketChannel;
  site?: SiteSeed;
  customer: string;
}

// Business hours mostly, monitoring alerts at any time: the weekday/hour
// heatmap of the dashboard reads these.
function createdAt(rng: Rng, daysAgo: number, alert: boolean): Date {
  const date = new Date(Date.now() - daysAgo * DAY_MS);
  const hour = alert
    ? rng.int(0, 23)
    : rng.weighted([
        [8, 3],
        [9, 6],
        [10, 7],
        [11, 6],
        [12, 3],
        [13, 5],
        [14, 6],
        [15, 5],
        [16, 4],
        [17, 2],
        [19, 1],
      ] as const);
  date.setHours(hour, rng.int(0, 59), 0, 0);
  return date.getTime() > Date.now()
    ? new Date(Date.now() - rng.int(5, 50) * 60 * 1000)
    : date;
}

function statusFor(rng: Rng, ageDays: number): TicketStatus {
  if (ageDays < 1) return rng.chance(0.7) ? "new" : "open";
  if (ageDays < 7)
    return rng.weighted<TicketStatus>([
      ["new", 1],
      ["open", 4],
      ["waiting", 2],
      ["resolved", 3],
    ]);
  if (ageDays < 21)
    return rng.weighted<TicketStatus>([
      ["open", 2],
      ["waiting", 2],
      ["resolved", 5],
      ["closed", 2],
    ]);
  return rng.weighted<TicketStatus>([
    ["waiting", 1],
    ["resolved", 5],
    ["closed", 30],
  ]);
}

const TECHNICAL: TicketCategory[] = [
  "no_production",
  "inverter_error",
  "monitoring",
  "damage",
];

function channelFor(rng: Rng, category: TicketCategory): TicketChannel {
  if (category === "inverter_error" || category === "no_production") {
    return rng.weighted<TicketChannel>([
      ["monitoring_alert", 5],
      ["phone", 3],
      ["email", 1],
      ["portal", 1],
    ]);
  }
  if (category === "monitoring")
    return rng.weighted<TicketChannel>([
      ["monitoring_alert", 3],
      ["portal", 2],
      ["email", 2],
    ]);
  return rng.weighted<TicketChannel>([
    ["email", 4],
    ["phone", 3],
    ["portal", 3],
  ]);
}

function regularDraft(rng: Rng, sites: SiteSeed[]): TicketDraft {
  const category = rng.weighted<TicketCategory>([
    ["no_production", 14],
    ["inverter_error", 22],
    ["monitoring", 20],
    ["damage", 8],
    ["billing", 22],
    ["other", 14],
  ]);
  const ageDays =
    rng.next() < 0.3 ? rng.next() * 21 : rng.next() * HISTORY_DAYS;
  const channel = channelFor(rng, category);
  const site =
    TECHNICAL.includes(category) || rng.chance(0.4)
      ? rng.pick(sites)
      : undefined;
  return {
    createdAt: createdAt(rng, ageDays, channel === "monitoring_alert"),
    category,
    priority: rng.weighted<TicketPriority>([
      ["low", 25],
      ["normal", 47],
      ["high", 22],
      ["urgent", 6],
    ]),
    status: statusFor(rng, ageDays),
    channel,
    site,
    customer: site?.customer ?? rng.pick(activeCustomers())._id,
  };
}

// The alerts of the offline and degraded inverters, and a handful of urgent
// tickets opened in the last hours, close to (or just past) their SLA.
function hotDrafts(rng: Rng, sites: SiteSeed[]): TicketDraft[] {
  const alerts = sites
    .filter((site) => site.inverterStatus !== "online")
    .map((site): TicketDraft => {
      const offline = site.inverterStatus === "offline";
      return {
        createdAt: new Date(
          Math.max(
            site.lastSeenAt.getTime() + 30 * 60 * 1000,
            Date.now() - 2 * DAY_MS,
          ),
        ),
        category: offline ? "no_production" : "inverter_error",
        priority: offline ? "urgent" : "high",
        status: offline
          ? "open"
          : rng.pick(["new", "open", "waiting"] as const),
        channel: "monitoring_alert",
        site,
        customer: site.customer,
      };
    });
  const urgent = [1.2, 2.1, 2.9, 3.5, 4.6].map((hoursAgo): TicketDraft => {
    const site = rng.pick(
      sites.filter((row) => row.inverterStatus === "online"),
    );
    return {
      createdAt: new Date(Date.now() - hoursAgo * HOUR_MS),
      category: rng.pick([
        "no_production",
        "damage",
        "inverter_error",
      ] as const),
      priority: "urgent",
      status: hoursAgo < 2 ? "new" : "open",
      channel: rng.pick(["phone", "portal"] as const),
      site,
      customer: site.customer,
    };
  });
  return [...alerts, ...urgent];
}

function assigneeFor(rng: Rng, draft: TicketDraft): string | undefined {
  if (draft.status === "new" && rng.chance(0.7)) return undefined;
  if (draft.status === "open" && rng.chance(0.15)) return undefined;
  return draft.category === "billing"
    ? rng.pick(OFFICE)
    : rng.pick(TECHNICIANS);
}

function resolvedAt(rng: Rng, draft: TicketDraft): Date | undefined {
  if (draft.status !== "resolved" && draft.status !== "closed")
    return undefined;
  const hours = rng.int(2, SLA_HOURS[draft.priority] * 2);
  return new Date(
    Math.min(draft.createdAt.getTime() + hours * HOUR_MS, Date.now() - HOUR_MS),
  );
}

function toSeed(rng: Rng, draft: TicketDraft, index: number): TicketSeed {
  const text = rng.pick(SUBJECTS[draft.category]);
  return {
    _id: ticketId(index),
    number: "",
    subject: text.subject,
    customer: draft.customer,
    site: draft.site?._id,
    category: draft.category,
    priority: draft.priority,
    status: draft.status,
    channel: draft.channel,
    assignee: assigneeFor(rng, draft),
    slaDueAt: new Date(
      draft.createdAt.getTime() + SLA_HOURS[draft.priority] * HOUR_MS,
    ),
    createdAt: draft.createdAt,
    resolvedAt: resolvedAt(rng, draft),
    description: text.description,
    pinned: false,
  };
}

// Numbers follow the creation date (T-1001 is the oldest); the two offline
// sites' alerts are pinned at the top of the desk.
function finish(seeds: TicketSeed[], sites: SiteSeed[]): void {
  const sorted = [...seeds].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  sorted.forEach((seed, at) => {
    seed.number = `T-${FIRST_NUMBER + at + 1}`;
  });
  const offline = new Set(
    sites
      .filter((site) => site.inverterStatus === "offline")
      .map(({ _id }) => _id),
  );
  for (const seed of seeds) {
    const live = seed.status !== "resolved" && seed.status !== "closed";
    seed.pinned =
      live &&
      seed.channel === "monitoring_alert" &&
      seed.site !== undefined &&
      offline.has(seed.site);
  }
}

let tickets: TicketSeed[] | undefined;

/** The 300 tickets, `ticket-001` … `ticket-300`. */
export function buildTickets(): TicketSeed[] {
  if (!tickets) {
    const rng = createRng(0x9e110006);
    const sites = buildSites();
    const drafts = hotDrafts(rng, sites);
    while (drafts.length < COUNTS.tickets)
      drafts.push(regularDraft(rng, sites));
    tickets = drafts.map((draft, at) => toSeed(rng, draft, at + 1));
    finish(tickets, sites);
  }
  return tickets;
}
