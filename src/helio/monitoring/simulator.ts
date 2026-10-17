// The telemetry simulator: every 10 seconds the inverters of the fleet
// "report", which the page hears on TELEMETRY_TOPIC and reads again (through
// its live valve). Readings themselves are computed by the solar model, so a
// round only has to name the sites that reported; once a minute it also
// writes their latest figures back to helio_sites, so the other Helio pages
// reading a site (service desk, customers) see the same numbers.
//
// On by default; HELIO_SIMULATORS=off disables it. It starts when this module
// has started (the schema and the DMS are up) and stops with it, hot reloads
// included.

import { Events, GetResponsibleModule } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";
import { DAY_MS } from "../shared/seed";
import { SiteModel } from "./database";
import { type FleetSite, lastSeenAt, loadFleet, round1 } from "./fleet";
import { TELEMETRY_TOPIC } from "./links";
import { startOfLocalDay } from "./period";
import { energyKwh, REPORT_INTERVAL_MS } from "./solar";

const ROUNDS_PER_WRITE = 6;
const HISTORY_DAYS = 7;
// One timer per process, even across hot reloads of this file.
const TIMER_KEY = Symbol.for("helio.monitoring.simulator");

interface SimulatorState {
  timer?: ReturnType<typeof setInterval>;
}

const globalState = globalThis as typeof globalThis & {
  [TIMER_KEY]?: SimulatorState;
};
const state: SimulatorState = (globalState[TIMER_KEY] ??= {});

let round = 0;
let reporting: string[] = [];

/** True unless the environment switched the Helio simulators off. */
export function simulatorsEnabled(): boolean {
  return process.env.HELIO_SIMULATORS?.toLowerCase() !== "off";
}

// Daily energy of the last seven complete days, oldest first.
function lastDays(site: FleetSite, now: number): number[] {
  const today = startOfLocalDay(now);
  return Array.from({ length: HISTORY_DAYS }, (_, at) => {
    const from = today - (HISTORY_DAYS - at) * DAY_MS;
    return round1(energyKwh([site], from, from + DAY_MS, now));
  });
}

// Writes the latest figures of the sites still reporting.
async function persistReadings(now: number): Promise<void> {
  const sites = await loadFleet();
  reporting = sites
    .filter((site) => site.status !== "offline")
    .map((site) => site.id);
  const model = GetModel(SiteModel);
  const today = startOfLocalDay(now);
  await Promise.all(
    sites
      .filter((site) => site.status !== "offline")
      .map((site) =>
        model.update(site.id, {
          todayKwh: round1(energyKwh([site], today, now, now)),
          last7Days: lastDays(site, now),
          lastSeenAt: new Date(lastSeenAt(site, now)),
        }),
      ),
  );
}

async function runRound(): Promise<void> {
  const now = Date.now();
  if (round % ROUNDS_PER_WRITE === 0) await persistReadings(now);
  round += 1;
  // Each reporting site counts once in a paused table's "N new" strip.
  await PublishMessage(TELEMETRY_TOPIC, "readings", {
    payload: { ids: reporting },
  });
}

/**
 * Starts the rounds of reports. A timer left by a previous load of this file
 * is replaced, so a reload never doubles the rounds.
 */
export function startMonitoringSimulator(): void {
  stopMonitoringSimulator();
  if (!simulatorsEnabled()) return;
  round = 0;
  state.timer = setInterval(() => {
    runRound().catch((error) =>
      Logging.Error(`[helio] telemetry simulator: ${String(error)}`),
    );
  }, REPORT_INTERVAL_MS);
  state.timer.unref?.();
}

/** Stops the rounds; safe to call when they are not running. */
export function stopMonitoringSimulator(): void {
  if (!state.timer) return;
  clearInterval(state.timer);
  state.timer = undefined;
}

// Follow this module's own lifecycle, so no shared file has to wire it.
const ownModule = GetResponsibleModule();
Events.ModuleStarted.register((module) => {
  if (module === ownModule) startMonitoringSimulator();
});
Events.ModuleStopped.register((module) => {
  if (module === ownModule) stopMonitoringSimulator();
});
