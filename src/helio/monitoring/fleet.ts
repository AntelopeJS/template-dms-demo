// The monitored fleet as the telemetry routes see it: the helio_sites rows
// turned into model profiles, with the customer's name for display and the
// live fields (power, last report) computed for a given instant.

import { GetModel } from "@antelopejs/interface-database-decorators";
import { CustomerModel } from "../crm/database";
import { type InverterStatus, SiteModel } from "./database";
import {
  orientationFactor,
  REPORT_INTERVAL_MS,
  type SiteProfile,
  sitePowerKw,
  statusFactor,
} from "./solar";

const MINUTE_MS = 60 * 1000;

export interface FleetSite extends SiteProfile {
  name: string;
  city: string;
  customer: string;
  customerName: string;
  project?: string;
  status: InverterStatus;
  /** The stored last report: what an offline inverter last said. */
  storedLastSeen: number;
}

// "site-07" → 7: the roster index seeds the site's own randomness.
function rosterIndex(id: string): number {
  const digits = Number(id.replace(/\D/g, ""));
  return Number.isFinite(digits) ? digits : 0;
}

function time(value: Date | string | undefined, fallback: number): number {
  if (!value) return fallback;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : fallback;
}

/** Every monitored site, by name. */
export async function loadFleet(): Promise<FleetSite[]> {
  const [sites, customers] = await Promise.all([
    GetModel(SiteModel).getAll(),
    GetModel(CustomerModel).getAll(),
  ]);
  const names = new Map(customers.map((row) => [row._id, row.name]));
  return sites
    .map((site): FleetSite => {
      const index = rosterIndex(site._id);
      const lastSeen = time(site.lastSeenAt, Date.now());
      return {
        id: site._id,
        index,
        name: site.name,
        city: site.city,
        customer: site.customer,
        customerName: names.get(site.customer) ?? "",
        project: site.project,
        status: site.inverterStatus,
        capacityKwp: site.capacityKwp,
        factor: orientationFactor(index) * statusFactor(site.inverterStatus),
        activeFrom: time(site.commissionedAt, 0),
        activeUntil: site.inverterStatus === "offline" ? lastSeen : Infinity,
        storedLastSeen: lastSeen,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/**
 * When the site last reported at `now`: on the last 10-second tick for a
 * healthy inverter, every few minutes for a degraded one, never again for an
 * offline one.
 */
export function lastSeenAt(site: FleetSite, now: number): number {
  if (site.status === "offline") return site.storedLastSeen;
  const tick = Math.floor(now / REPORT_INTERVAL_MS) * REPORT_INTERVAL_MS;
  if (site.status === "online") return tick - (site.index % 5) * 1000;
  const period = 4 * MINUTE_MS;
  return Math.floor(now / period) * period - (site.index % 7) * 9000;
}

/** The site's current output in kW, to one decimal. */
export function currentPowerKw(site: FleetSite, now: number): number {
  return round1(sitePowerKw(site, now));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Installed capacity of the given sites, in kWp. */
export function capacityOf(sites: readonly FleetSite[]): number {
  return round1(sites.reduce((sum, site) => sum + site.capacityKwp, 0));
}
