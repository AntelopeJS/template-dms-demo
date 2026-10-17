// The fleet's figures of the moment: the stat strip, the two meters and the
// facts of one site in its side panel. They read the instant, not the period.

import type { KeyValueListItem } from "@antelopejs/interface-dms/base/key-value-list";
import type { StatGroupItem } from "@antelopejs/interface-dms/base/stat-group";
import type { ComposedText, Tone } from "@antelopejs/interface-dms/base/types";
import { INVERTER_STATUSES } from "./controller";
import {
  capacityOf,
  currentPowerKw,
  type FleetSite,
  lastSeenAt,
  round1,
} from "./fleet";
import { MONITORING_PAGE_PATH } from "./links";
import { startOfLocalDay } from "./period";
import { DEGRADED_OUTPUT, energyKwh } from "./solar";

// A Belgian household uses about 3,500 kWh a year.
const HOUSEHOLD_DAILY_KWH = 9.6;
const STATUS_TONES: Record<FleetSite["status"], Tone> = {
  online: "success",
  degraded: "warning",
  offline: "error",
};

const decimal = (value: number) => ({ type: "number", value }) as const;
const count = (value: number) => ({ type: "count", value }) as const;
const percent = (value: number) =>
  ({ type: "number", value, format: "percent" }) as const;

const kw = (value: number): ComposedText => ({
  key: "$helio.monitoring.units.kwValue",
  params: { value: decimal(round1(value)) },
});
const kwp = (value: number): ComposedText => ({
  key: "$helio.monitoring.units.kwpValue",
  params: { value: decimal(round1(value)) },
});
const kwh = (value: number): ComposedText => ({
  key: "$helio.monitoring.units.kwhValue",
  params: { value: decimal(Math.round(value)) },
});

function fleetPowerKw(sites: readonly FleetSite[], now: number): number {
  return round1(
    sites.reduce((sum, site) => sum + currentPowerKw(site, now), 0),
  );
}

function byStatus(sites: readonly FleetSite[], status: FleetSite["status"]) {
  return sites.filter((site) => site.status === status);
}

function sitesItem(sites: readonly FleetSite[]): StatGroupItem {
  const offline = byStatus(sites, "offline").length;
  const degraded = byStatus(sites, "degraded").length;
  const online = sites.length - offline - degraded;
  return {
    id: "sites",
    icon: offline > 0 ? "i-ph-wifi-slash" : "i-ph-wifi-high",
    tone: offline > 0 ? "warning" : "success",
    eyebrow: "$helio.monitoring.stats.sites",
    value: {
      key: "$helio.monitoring.stats.sitesValue",
      params: { online, total: sites.length },
    },
    detail: {
      key: "$helio.monitoring.stats.sitesDetail",
      params: { degraded, offline },
    },
    detailTone: offline > 0 ? "warning" : "neutral",
    to: `${MONITORING_PAGE_PATH}?table.tab=offline`,
  };
}

/** The stat strip: capacity, output now, energy today and the sites' state. */
export function fleetStats(
  sites: readonly FleetSite[],
  now: number,
): { items: StatGroupItem[] } {
  const capacity = capacityOf(sites);
  const power = fleetPowerKw(sites, now);
  const today = energyKwh(sites, startOfLocalDay(now), now, now);
  return {
    items: [
      {
        id: "capacity",
        icon: "i-ph-solar-panel",
        eyebrow: "$helio.monitoring.stats.capacity",
        value: kwp(capacity),
        detail: {
          key: "$helio.monitoring.stats.capacityDetail",
          params: { count: count(sites.length) },
        },
      },
      {
        id: "power",
        icon: "i-ph-lightning",
        tone: "warning",
        eyebrow: "$helio.monitoring.stats.power",
        value: kw(power),
        detail: {
          key: "$helio.monitoring.stats.powerDetail",
          params: {
            share: percent(
              capacity > 0 ? Math.round((power / capacity) * 100) / 100 : 0,
            ),
          },
        },
      },
      {
        id: "today",
        icon: "i-ph-sun",
        tone: "warning",
        eyebrow: "$helio.monitoring.stats.today",
        value: kwh(today),
        detail: {
          key: "$helio.monitoring.stats.todayDetail",
          params: { count: count(Math.round(today / HOUSEHOLD_DAILY_KWH)) },
        },
      },
      sitesItem(sites),
    ],
  };
}

export interface MeterPayload {
  value: number;
  max: number;
  hint: ComposedText;
}

/** Output now against the installed peak power. */
export function capacityMeter(
  sites: readonly FleetSite[],
  now: number,
): MeterPayload {
  const power = fleetPowerKw(sites, now);
  const capacity = capacityOf(sites);
  return {
    value: power,
    max: capacity,
    hint: {
      key: "$helio.monitoring.meters.outputHint",
      params: { power: decimal(power), capacity: decimal(capacity) },
    },
  };
}

/**
 * The peak power faults take from the fleet: what degraded inverters fail to
 * deliver plus every offline site. Past 5 % of the fleet it reads warning,
 * past 15 % error.
 */
export function lostCapacityMeter(sites: readonly FleetSite[]): MeterPayload {
  const degraded = byStatus(sites, "degraded");
  const offline = byStatus(sites, "offline");
  const lost =
    capacityOf(degraded) * (1 - DEGRADED_OUTPUT) + capacityOf(offline);
  return {
    value: round1(lost),
    max: capacityOf(sites),
    hint: {
      key: "$helio.monitoring.meters.attentionHint",
      params: {
        degraded: decimal(capacityOf(degraded)),
        offline: decimal(capacityOf(offline)),
      },
    },
  };
}

/** The facts of one site, for its side panel. */
export function siteFacts(
  site: FleetSite,
  now: number,
): { items: KeyValueListItem[] } {
  const today = energyKwh([site], startOfLocalDay(now), now, now);
  const items: KeyValueListItem[] = [
    {
      id: "customer",
      label: "$helio.monitoring.facts.customer",
      value: site.customerName,
    },
    { id: "city", label: "$helio.monitoring.facts.city", value: site.city },
    {
      id: "status",
      label: "$helio.monitoring.facts.status",
      type: "status",
      value:
        INVERTER_STATUSES.find(({ value }) => value === site.status)?.label ??
        "",
      tone: STATUS_TONES[site.status],
    },
    {
      id: "capacity",
      label: "$helio.monitoring.facts.capacity",
      value: kwp(site.capacityKwp),
    },
    {
      id: "power",
      label: "$helio.monitoring.facts.power",
      value: kw(currentPowerKw(site, now)),
    },
    {
      id: "today",
      label: "$helio.monitoring.facts.today",
      value: kwh(today),
      detail: {
        key: "$helio.monitoring.facts.yield",
        params: { value: decimal(round1(today / site.capacityKwp)) },
      },
    },
    {
      id: "lastSeen",
      label: "$helio.monitoring.facts.lastSeen",
      value: {
        key: "$helio.monitoring.facts.lastSeenValue",
        params: { when: { type: "relative", value: lastSeenAt(site, now) } },
      },
      tone: site.status === "offline" ? "error" : undefined,
    },
    {
      id: "commissioned",
      label: "$helio.monitoring.facts.commissioned",
      type: "date",
      value: new Date(site.activeFrom).toISOString(),
    },
  ];
  if (site.project) {
    items.push({
      id: "project",
      label: "$helio.monitoring.facts.project",
      type: "link",
      value: "$helio.monitoring.facts.projectLink",
      to: `/helio/operations/project/${encodeURIComponent(site.project)}`,
    });
  }
  return { items };
}
