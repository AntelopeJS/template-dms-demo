// The SLA a new ticket is given comes from the Settings page (Operations ›
// service levels), the built-in promises standing in until the settings are
// read. A ticket created during the winter closure is counted from the
// reopening morning: the day after the closure, at the start of the workday. The ticket's priority setter computes its due date synchronously, so
// the hours are kept here and refreshed before every ticket write.

import { GetModel } from "@antelopejs/interface-database-decorators";
import { HelioSettingsModel } from "../settings/database";
import { pickerDay } from "../settings/defaults";
import { type DateRange, HELIO_SETTINGS_ID } from "../settings/types";
import type { TicketPriority } from "./database";
import { SLA_HOURS } from "./options";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

let current: Record<TicketPriority, number> = { ...SLA_HOURS };
let closure: { range?: DateRange; workdayStart: number } = {
  workdayStart: 0,
};

/** Hours promised for a priority, as last read from the settings. */
export function slaHours(priority: TicketPriority): number {
  return current[priority] ?? current.normal;
}

const valid = (hours: number | undefined, fallback: number): number =>
  typeof hours === "number" && hours > 0 ? hours : fallback;

// The closure days are stored at UTC midnight, the date picker's way.
function reopening(createdAt: Date): Date | undefined {
  const { range, workdayStart } = closure;
  if (!range?.start || !range.end) return undefined;
  const day = pickerDay(createdAt).getTime();
  const end = new Date(range.end).getTime();
  if (day < new Date(range.start).getTime() || day > end) return undefined;
  const after = new Date(end + DAY_MS);
  const morning = new Date(
    after.getUTCFullYear(),
    after.getUTCMonth(),
    after.getUTCDate(),
  );
  return new Date(morning.getTime() + workdayStart);
}

/** When a ticket of `priority` created at `createdAt` must be answered. */
export function slaDueAt(priority: TicketPriority, createdAt: Date): Date {
  const from = reopening(createdAt) ?? createdAt;
  return new Date(from.getTime() + slaHours(priority) * HOUR_MS);
}

/** Reads the service levels and the winter closure saved on the Settings page. */
export async function refreshSlaHours(): Promise<void> {
  const settings = await GetModel(HelioSettingsModel).get(HELIO_SETTINGS_ID);
  if (!settings) return;
  current = {
    urgent: valid(settings.slaUrgentHours, SLA_HOURS.urgent),
    high: valid(settings.slaHighHours, SLA_HOURS.high),
    normal: valid(settings.slaNormalHours, SLA_HOURS.normal),
    low: valid(settings.slaLowHours, SLA_HOURS.low),
  };
  closure = {
    range: settings.winterClosure,
    workdayStart: settings.workdayStart ?? 0,
  };
}
