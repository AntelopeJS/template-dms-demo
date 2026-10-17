// A demo needs a desk that moves: every ninety seconds or so a customer of
// one of the monitored installations writes in, and the new ticket reaches
// the open desks through the realtime topic (the "N new tickets · Show" strip
// while paused). HELIO_SIMULATORS=off switches it off. The simulated tickets
// are capped, the oldest removed first, so a long-running instance never
// piles them up.

import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";
import { SiteModel, type Site } from "../monitoring/database";
import {
  type TicketCategory,
  type TicketChannel,
  TicketModel,
  type TicketPriority,
} from "./database";
import type { TicketSeed } from "./fixtures";
import { notifyUrgentTicket } from "./notifications";
import { nextTicketNumber } from "./numbering";
import { SERVICE_TOPIC, SLA_HOURS } from "./options";
import { SUBJECTS } from "./subjects";

const SIMULATED_PREFIX = "ticket-sim-";
const MAX_SIMULATED = 30;
const FIRST_TICKET_MS = 30_000;
const INTERVAL_MS = 90_000;
const JITTER_MS = 15_000;
const HOUR_MS = 60 * 60 * 1000;

type Weighted<T> = ReadonlyArray<readonly [T, number]>;

const CATEGORIES: Weighted<TicketCategory> = [
  ["no_production", 3],
  ["inverter_error", 5],
  ["monitoring", 4],
  ["damage", 1],
  ["billing", 3],
  ["other", 2],
];
// A billing or general question is never urgent; a technical one can be.
const TECHNICAL_PRIORITIES: Weighted<TicketPriority> = [
  ["low", 2],
  ["normal", 5],
  ["high", 3],
  ["urgent", 1],
];
const OFFICE_PRIORITIES: Weighted<TicketPriority> = [
  ["low", 3],
  ["normal", 5],
  ["high", 1],
];
const TECHNICAL_CHANNELS: Weighted<TicketChannel> = [
  ["monitoring_alert", 4],
  ["phone", 3],
  ["portal", 2],
  ["email", 1],
];
const OFFICE_CHANNELS: Weighted<TicketChannel> = [
  ["email", 3],
  ["portal", 2],
  ["phone", 2],
];

function pick<T>(items: Weighted<T>): T {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [item, weight] of items) {
    roll -= weight;
    if (roll < 0) return item;
  }
  return items[0][0];
}

const pickOne = <T>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)];

// A customer whose installation Helio monitors: a technical request names
// the site, a billing or general one only the customer.
function draftTicket(site: Site, number: string): TicketSeed {
  const category = pick(CATEGORIES);
  const technical = category !== "billing" && category !== "other";
  const priority = pick(technical ? TECHNICAL_PRIORITIES : OFFICE_PRIORITIES);
  const text = pickOne(SUBJECTS[category]);
  const createdAt = new Date();
  return {
    _id: `${SIMULATED_PREFIX}${createdAt.getTime().toString(36)}`,
    number,
    subject: text.subject,
    customer: site.customer,
    site: technical ? site._id : undefined,
    category,
    priority,
    status: "new",
    channel: pick(technical ? TECHNICAL_CHANNELS : OFFICE_CHANNELS),
    slaDueAt: new Date(createdAt.getTime() + SLA_HOURS[priority] * HOUR_MS),
    createdAt,
    resolvedAt: undefined,
    assignee: undefined,
    description: text.description,
    pinned: false,
  };
}

// The simulated tickets beyond the cap, oldest first.
async function pruneSimulated(model: TicketModel): Promise<string[]> {
  const simulated = (await model.getAll())
    .filter(({ _id }) => _id.startsWith(SIMULATED_PREFIX))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const extra = simulated.slice(
    0,
    Math.max(0, simulated.length - MAX_SIMULATED),
  );
  await Promise.all(extra.map(({ _id }) => model.delete(_id)));
  return extra.map(({ _id }) => _id);
}

/** Writes one realistic ticket and announces it on the desk's topic. */
export async function simulateTicket(): Promise<void> {
  const sites = await GetModel(SiteModel).getAll();
  if (sites.length === 0) return;
  const model = GetModel(TicketModel);
  const ticket = draftTicket(pickOne(sites), await nextTicketNumber());
  await model.insert(ticket);
  const removed = await pruneSimulated(model);
  await PublishMessage(SERVICE_TOPIC, "tickets.created", {
    payload: { ids: [ticket._id] },
  });
  if (removed.length > 0) {
    await PublishMessage(SERVICE_TOPIC, "tickets.deleted", {
      payload: { ids: removed },
    });
  }
  if (ticket.priority === "urgent") await notifyUrgentTicket(ticket);
}

// The timer lives on globalThis: a hot reload re-imports this module, and the
// previous copy's timer must stop rather than run beside the new one. A run
// still writing when the simulator stops does not schedule the next one: its
// token is no longer the current one.
interface SimulatorState {
  token: symbol;
  timer?: ReturnType<typeof setTimeout>;
}

declare global {
  // The one simulator of the process, whichever copy of this module runs.
  var helioServiceSimulator: SimulatorState | undefined;
}

function schedule(token: symbol, delay: number): void {
  const state = globalThis.helioServiceSimulator;
  if (state?.token !== token) return;
  state.timer = setTimeout(() => {
    simulateTicket()
      .catch((error: unknown) =>
        Logging.Error(`[helio] ticket simulator: ${String(error)}`),
      )
      .finally(() =>
        schedule(token, INTERVAL_MS + (Math.random() * 2 - 1) * JITTER_MS),
      );
  }, delay);
  state.timer.unref?.();
}

/** Whether the simulator may run: on unless HELIO_SIMULATORS=off. */
export function isServiceSimulatorEnabled(): boolean {
  return process.env.HELIO_SIMULATORS?.toLowerCase() !== "off";
}

/** Starts the simulator (idempotent); does nothing when switched off. */
export function startServiceSimulator(): void {
  stopServiceSimulator();
  if (!isServiceSimulatorEnabled()) return;
  const token = Symbol("run");
  globalThis.helioServiceSimulator = { token };
  schedule(token, FIRST_TICKET_MS);
}

/** Stops the simulator; safe to call when it is not running. */
export function stopServiceSimulator(): void {
  const state = globalThis.helioServiceSimulator;
  if (state?.timer) clearTimeout(state.timer);
  globalThis.helioServiceSimulator = undefined;
}
