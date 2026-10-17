// The SLA a new ticket is given comes from the Settings page (Operations ›
// service levels), the built-in promises standing in until the settings are
// read. The ticket's priority setter computes its due date synchronously, so
// the hours are kept here and refreshed before every ticket write.

import { GetModel } from "@antelopejs/interface-database-decorators";
import { HelioSettingsModel } from "../settings/database";
import { HELIO_SETTINGS_ID } from "../settings/types";
import type { TicketPriority } from "./database";
import { SLA_HOURS } from "./options";

let current: Record<TicketPriority, number> = { ...SLA_HOURS };

/** Hours promised for a priority, as last read from the settings. */
export function slaHours(priority: TicketPriority): number {
  return current[priority] ?? current.normal;
}

const valid = (hours: number | undefined, fallback: number): number =>
  typeof hours === "number" && hours > 0 ? hours : fallback;

/** Reads the service levels saved on the Settings page. */
export async function refreshSlaHours(): Promise<void> {
  const settings = await GetModel(HelioSettingsModel).get(HELIO_SETTINGS_ID);
  if (!settings) return;
  current = {
    urgent: valid(settings.slaUrgentHours, SLA_HOURS.urgent),
    high: valid(settings.slaHighHours, SLA_HOURS.high),
    normal: valid(settings.slaNormalHours, SLA_HOURS.normal),
    low: valid(settings.slaLowHours, SLA_HOURS.low),
  };
}
