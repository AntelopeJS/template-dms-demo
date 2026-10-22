/**
 * The heat ramp shared by the click heatmap and the scroll-depth overlay, so
 * the two overlays read as one scale.
 *
 * Literal colors on purpose: this is a data scale, not interface chrome. The
 * theme carries semantic tokens (primary, error, muted…) but no sequential
 * ramp, and "red means hot" derives from none of them.
 */

export type HeatRgb = readonly [number, number, number]

/** Position on the 0-1 ramp → color, linearly interpolated in between. */
export const HEAT_STOPS: ReadonlyArray<readonly [number, HeatRgb]> = [
  [0.0, [0, 80, 255]],
  [0.4, [0, 200, 255]],
  [0.6, [80, 220, 60]],
  [0.8, [255, 220, 0]],
  [1.0, [255, 40, 0]],
]

export function heatRgba(rgb: HeatRgb, alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

export function heatColorAt(fraction: number, alpha: number): string {
  const bounded = Math.min(Math.max(fraction, 0), 1)
  let low = HEAT_STOPS[0]!
  let high = HEAT_STOPS[HEAT_STOPS.length - 1]!
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    if (bounded >= HEAT_STOPS[i]![0] && bounded <= HEAT_STOPS[i + 1]![0]) {
      low = HEAT_STOPS[i]!
      high = HEAT_STOPS[i + 1]!
      break
    }
  }
  const span = high[0] - low[0]
  const mix = span > 0 ? (bounded - low[0]) / span : 0
  const channel = (index: number) =>
    Math.round(low[1][index]! + (high[1][index]! - low[1][index]!) * mix)
  return heatRgba([channel(0), channel(1), channel(2)], alpha)
}

/** The ramp as a CSS gradient, for a legend that matches what is drawn:
 * `reversed` runs it from hot to cold. */
export function heatLegendGradient(reversed = false): string {
  const stops = HEAT_STOPS.map(([stop, rgb]) => {
    const at = reversed ? 1 - stop : stop
    return `${heatRgba(rgb, 1)} ${Math.round(at * 100)}%`
  })
  return `linear-gradient(to right, ${(reversed ? stops.reverse() : stops).join(', ')})`
}
