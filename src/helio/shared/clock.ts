const NOW = process.env.HELIO_NOW;
const FIXED = NOW === undefined || NOW === "" ? undefined : Date.parse(NOW);

if (FIXED !== undefined && Number.isNaN(FIXED))
  throw new Error(`HELIO_NOW must be an ISO 8601 instant, got "${NOW}"`);

/**
 * The instant Helio's fixtures, seeds and pages treat as now, in epoch milliseconds: `HELIO_NOW` (an ISO 8601
 * instant) when it is set, else the real time. Timers, throttles and the simulators keep the real clock.
 */
export function helioNow(): number {
  return FIXED ?? Date.now();
}
