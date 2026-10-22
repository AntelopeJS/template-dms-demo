// The live histogram above the request logs: one bar per minute of the last
// hour, stacked by status class, on a scale a single spike cannot flatten.

const MS_PER_MINUTE = 60_000

/** One minute of the histogram, as `/api/monitoring/logs/live` sends it. */
export interface MinuteBucket {
  start: number
  /** Every answer below 400: 2xx and 3xx. */
  success: number
  clientErrors: number
  serverErrors: number
}

/** A minute as the histogram draws it. */
export interface MinuteBar extends MinuteBucket {
  total: number
  /** The minute still running: its count is partial. */
  current: boolean
  /** Taller than the scale: drawn cut, with a mark. */
  clipped: boolean
  /** Heights of the stacked segments, in % of the plot, bottom to top. */
  heights: { success: number; clientErrors: number; serverErrors: number }
}

/** A peak this many times the usual busy minute no longer sets the scale. */
const PEAK_FACTOR = 3
/** The scale then stops at this many times the usual busy minute. */
const CEILING_FACTOR = 2
/** The usual busy minute: this quantile of the minutes that saw traffic. */
const TYPICAL_QUANTILE = 0.9

/**
 * The count the top of the plot stands for: the busiest minute, unless it
 * is a spike far above the usual traffic, which would crush every other bar
 * to a pixel. The scale then stops at twice the usual busy minute and the
 * spike is drawn cut. Empty minutes do not count: a quiet hour with a few
 * calls keeps them readable.
 */
export function scaleCeiling(totals: number[]): number {
  const busy = totals.filter((total) => total > 0).sort((a, b) => a - b)
  if (busy.length === 0) return 0
  const peak = busy[busy.length - 1]
  const typical = busy[Math.floor((busy.length - 1) * TYPICAL_QUANTILE)]
  return peak > typical * PEAK_FACTOR
    ? Math.ceil(typical * CEILING_FACTOR)
    : peak
}

/** The minute `at` falls in, as the start of its bucket. */
export function minuteOf(at: number): number {
  return Math.floor(at / MS_PER_MINUTE) * MS_PER_MINUTE
}

/**
 * The bars of `buckets` on their scale. The minute holding `refreshedAt` is
 * the one still running. An empty minute has no segment: nothing is drawn.
 */
export function minuteBars(
  buckets: MinuteBucket[],
  refreshedAt?: string | number,
): { bars: MinuteBar[]; ceiling: number; clipped: boolean } {
  const totals = buckets.map(
    (bucket) => bucket.success + bucket.clientErrors + bucket.serverErrors,
  )
  const ceiling = scaleCeiling(totals)
  const at = refreshedAt === undefined ? NaN : new Date(refreshedAt).getTime()
  const currentMinute = Number.isNaN(at) ? undefined : minuteOf(at)
  const bars = buckets.map((bucket, index) => {
    const total = totals[index]
    const shown = Math.min(total, ceiling)
    // Each segment keeps its share of the bar when the bar is cut.
    const percent = (value: number) =>
      total === 0 ? 0 : ((value / total) * shown * 100) / ceiling
    return {
      ...bucket,
      total,
      current: bucket.start === currentMinute,
      clipped: total > ceiling,
      heights: {
        success: percent(bucket.success),
        clientErrors: percent(bucket.clientErrors),
        serverErrors: percent(bucket.serverErrors),
      },
    }
  })
  return { bars, ceiling, clipped: bars.some((bar) => bar.clipped) }
}

/** The busiest minute, for the chart's text alternative. */
export function peakBar(bars: MinuteBar[]): MinuteBar | undefined {
  return bars.reduce<MinuteBar | undefined>(
    (peak, bar) =>
      bar.total > 0 && (!peak || bar.total > peak.total) ? bar : peak,
    undefined,
  )
}

/** The minutes of the time axis: the first, the middle and the last. */
export function axisTicks(bars: MinuteBar[]): number[] {
  if (bars.length === 0) return []
  const last = bars.length - 1
  return [...new Set([0, Math.floor(last / 2), last])]
}

/**
 * What the histogram's live indicator says: following the page's live mode,
 * paused with it, or reconnecting since the last read failed (from the first
 * failure).
 */
export type LiveStatus = 'live' | 'paused' | 'reconnecting'

export function liveStatus(live: boolean, failures: number): LiveStatus {
  if (!live) return 'paused'
  return failures > 0 ? 'reconnecting' : 'live'
}
