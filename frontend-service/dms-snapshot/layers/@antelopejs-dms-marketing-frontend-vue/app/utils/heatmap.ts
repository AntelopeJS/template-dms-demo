import { formatNumber } from './format'

/** The `t` of useI18n, as far as these helpers call it. */
type Translate = (
  key: string,
  named?: Record<string, unknown>,
  plural?: number,
) => string

/** Base for reading a typed path the way the backend reads a tracked URL. */
const RELATIVE_URL_BASE = 'http://relative.invalid'

/**
 * A typed or pasted path reduced the way the tracker stores it: pathname
 * only, with its leading slash — `demo/pricing`, `/demo/pricing?x=1#top` and
 * `https://site.example/demo/pricing` all read `/demo/pricing`.
 */
export function normalizePagePath(typed: string): string | undefined {
  const trimmed = typed.trim()
  if (!trimmed) {
    return undefined
  }
  try {
    return new URL(trimmed, RELATIVE_URL_BASE).pathname
  } catch {
    return undefined
  }
}

/** What a heatmap reset deletes or deleted. */
export interface HeatmapDataCounts {
  events: number
  snapshots: number
}

/** "18 events and 1 snapshot", "18 events", or "nothing". */
export function heatmapDataLabel(
  counts: HeatmapDataCounts,
  t: Translate,
  locale: string,
): string {
  const events = t(
    'page.marketing.pages.reset.events',
    { count: formatNumber(counts.events, locale) },
    counts.events,
  )
  if (counts.snapshots === 0) {
    return events
  }
  return t('page.marketing.pages.reset.and', {
    first: events,
    second: t(
      'page.marketing.pages.reset.snapshots',
      { count: formatNumber(counts.snapshots, locale) },
      counts.snapshots,
    ),
  })
}

/** The impact list of a reset dialog, counted when the counts are known. */
export function heatmapResetImpact(
  counts: HeatmapDataCounts | null,
  t: Translate,
  locale: string,
) {
  return [
    {
      icon: 'i-ph-cursor-click',
      label: t('page.marketing.pages.reset.impact_events'),
      count: counts ? formatNumber(counts.events, locale) : undefined,
    },
    {
      icon: 'i-ph-camera',
      label: t('page.marketing.pages.reset.impact_snapshots'),
      count: counts ? formatNumber(counts.snapshots, locale) : undefined,
    },
    {
      icon: 'i-ph-check',
      label: t('page.marketing.pages.reset.impact_kept'),
    },
  ]
}
