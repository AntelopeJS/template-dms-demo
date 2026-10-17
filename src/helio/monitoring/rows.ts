// The rows of the fleet table: one per site, its live reading and what it
// produced over the period, filtered the way the table asks (tabs and quick
// filters send `filter_<column>=is:<value>`).

import type { CellSubline } from "@antelopejs/interface-dms/base/table-view";
import type { ComposedText } from "@antelopejs/interface-dms/base/types";
import { sparkline } from "./charts";
import { currentPowerKw, type FleetSite, lastSeenAt, round1 } from "./fleet";
import { type Period, startOfLocalDay } from "./period";
import { energyKwh } from "./solar";

const FILTERABLE = ["inverterStatus", "city"] as const;

export interface SiteRow {
  _id: string;
  name: string;
  city: string;
  customerName: string;
  project: string;
  inverterStatus: FleetSite["status"];
  statusDetail: CellSubline | null;
  capacityKwp: number;
  powerKw: number;
  /** "15.7 kW" over "12 % of peak": the power column's two lines. */
  powerLabel: ComposedText;
  powerShare: ComposedText;
  periodKwh: number;
  trend: number[];
  todayKwh: number;
  lastSeenAt: string;
}

// What the pill says under an inverter that needs someone.
function statusDetail(site: FleetSite): CellSubline | null {
  if (site.status === "degraded") {
    return { text: "$helio.monitoring.table.degradedDetail", tone: "warning" };
  }
  if (site.status === "offline") {
    return {
      text: {
        key: "$helio.monitoring.table.offlineDetail",
        params: { since: { type: "relative", value: site.storedLastSeen } },
      },
      tone: "error",
    };
  }
  return null;
}

export function siteRow(site: FleetSite, period: Period, now: number): SiteRow {
  const power = currentPowerKw(site, now);
  return {
    _id: site.id,
    name: site.name,
    city: site.city,
    customerName: site.customerName,
    project: site.project ?? "",
    inverterStatus: site.status,
    statusDetail: statusDetail(site),
    capacityKwp: site.capacityKwp,
    powerKw: power,
    powerLabel: {
      key: "$helio.monitoring.units.kwValue",
      params: { value: { type: "number", value: power } },
    },
    powerShare: {
      key: "$helio.monitoring.table.powerShare",
      params: {
        share: {
          type: "number",
          value: Math.round((power / site.capacityKwp) * 100) / 100,
          format: "percent",
        },
      },
    },
    periodKwh: round1(energyKwh([site], period.from, period.to, now)),
    trend: sparkline(site, period, now),
    todayKwh: round1(energyKwh([site], startOfLocalDay(now), now, now)),
    lastSeenAt: new Date(lastSeenAt(site, now)).toISOString(),
  };
}

// `filter_inverterStatus=is:offline` → keep the offline sites. Only `is` is
// offered (tabs and quick filters), the column filters are off.
function matches(site: FleetSite, query: URLSearchParams): boolean {
  return FILTERABLE.every((field) => {
    const filter = query.get(`filter_${field}`);
    if (!filter) return true;
    const value = filter.replace(/^is:/, "");
    const actual = field === "city" ? site.city : site.status;
    return value.split(",").includes(actual);
  });
}

/** The rows the table lists for this query, every one (no paging). */
export function siteRows(
  sites: readonly FleetSite[],
  query: URLSearchParams,
  period: Period,
  now: number,
): { results: SiteRow[]; total: number } {
  const results = sites
    .filter((site) => matches(site, query))
    .map((site) => siteRow(site, period, now));
  return { results, total: results.length };
}
