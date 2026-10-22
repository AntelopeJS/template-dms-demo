// The request logs page keeps its filters in its URL.
//
// `?method=`, `?slow=`, `?route=`, `?path=`, `?error=` and an incident's
// `?since=` / `?until=` are the request table's arrival filters
// (`queryParamFilters`, `src/pages/logs.ts`): the table reads them from the
// URL whatever wrote them (a link of another page, the filters bar), counts
// its tabs with them, and follows them as they change. So the page has one
// filter state, which a reload, Back and a shared link all keep. `?from=`
// names the page a link came from, for the band that says so.
//
// The period is the toolbar's DMS `PeriodSelector`'s, which the table
// follows through its period scope and the blocks read with
// `usePeriodScope` (`useApiPeriod`): its "All time" is every request kept.
// An incident's range narrows that period without replacing it, so the
// page stays on the period the user chose. A change to the period is
// written in its URL key, which the selector follows.

import { parseRouteRef } from './http'

type Query = Record<string, unknown>

/** What the filters read of the page's period, `null` until it is known. */
export type LogsPeriod = Pick<PeriodState, 'preset' | 'range'> | null

/** The selector's URL key: `<selector id>.period` (`PERIOD_SCOPE`). */
const PERIOD_KEY = 'api.period'

/** The selector's own custom range: no preset the band can name. */
const CUSTOM_RANGE = 'custom'

/** The DMS "All time": every request kept, which the request logs offer. */
const ALL_TIME = 'all'

/** Methods the filters bar offers. */
export const LOG_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const

/** Filters only a link sets: the bar shows them as chips, each removable. */
export const LINK_FILTER_KEYS = ['route', 'path', 'error'] as const
export type LinkFilterKey = (typeof LINK_FILTER_KEYS)[number]

/** Pages a link to the request logs may name as its origin (`?from=`). */
export const LINK_ORIGINS = ['overview', 'routes'] as const
export type LinkOrigin = (typeof LINK_ORIGINS)[number]

/** An incident's range, `[from, to)`, which a link narrows the rows to. */
interface IncidentRange {
  from: Date
  to: Date
}

/** The filters of the request logs, as the URL holds them. */
export interface LogsFilters {
  method?: string
  slow: boolean
  route?: string
  /** A path exactly as requested: one resource of a route. */
  path?: string
  error?: string
  incident?: IncidentRange
  from?: LinkOrigin
}

/** A change to the filters: `null` or `false` removes one. */
export interface LogsFiltersPatch {
  /** Every request kept: the period's "All time". */
  allTime?: true
  method?: string | null
  slow?: boolean
  route?: null
  path?: null
  error?: null
  /** Removes the incident's range. */
  incident?: null
}

function single(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' && first !== '' ? first : undefined
}

function oneOf<T extends string>(
  values: readonly T[],
  value: string | undefined,
): T | undefined {
  return values.find((candidate) => candidate === value)
}

function date(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/** `?since=` / `?until=`, when both read as dates. */
function readIncident(query: Query): IncidentRange | undefined {
  const from = date(single(query.since))
  const to = date(single(query.until))
  return from && to ? { from, to } : undefined
}

/** The filters a URL query holds; a value the table would not apply is left out. */
export function readLogsFilters(query: Query): LogsFilters {
  return {
    method: oneOf(LOG_METHODS, single(query.method)),
    // The table sends the value as it is, and the server reads "true" only.
    slow: single(query.slow) === 'true',
    route: single(query.route),
    path: single(query.path),
    error: single(query.error),
    incident: readIncident(query),
    from: oneOf(LINK_ORIGINS, single(query.from)),
  }
}

/** Whether the period is every request kept. */
export function isAllTime(period: LogsPeriod): boolean {
  return period?.preset === ALL_TIME
}

/** The preset the period follows, neither "All time" nor a custom range. */
export function windowPreset(period: LogsPeriod): string | undefined {
  return period && !isAllTime(period) && period.preset !== CUSTOM_RANGE
    ? period.preset
    : undefined
}

/**
 * The period a link to the request logs carries, for their selector to open
 * on: the preset the period follows, if any.
 */
export function linkedPeriod(period: LogsPeriod): Record<string, string> {
  const preset = windowPreset(period)
  return preset ? { [PERIOD_KEY]: preset } : {}
}

/**
 * Whether a link's filters narrow the table: a route, a path, an error, an
 * incident's range.
 */
function hasLinkFilters(filters: LogsFilters): boolean {
  return LINK_FILTER_KEYS.some((key) => !!filters[key]) || !!filters.incident
}

/** Whether a `?route=` can name a route at all (`garbage` cannot). */
export function isRouteRef(route: string): boolean {
  return parseRouteRef(route) !== null
}

/** The method a route reference fixes: `POST /webhooks` → `POST`. */
export function routeMethod(route: string | undefined): string | undefined {
  const method = route?.trim().split(/\s+/)[0]?.toUpperCase()
  return oneOf(LOG_METHODS, method)
}

/**
 * `query` with `patch` applied, every other key kept (the table's tab, the
 * open request, the period). "All time", or removing the last linked
 * filter, forgets the page the link came from: the band would name an
 * origin the filters no longer come from.
 */
export function withLogsFilters(
  query: Query,
  patch: LogsFiltersPatch,
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    const text = single(value)
    if (text !== undefined) next[key] = text
  }
  const set = (key: string, value: string | null | undefined) => {
    if (value) next[key] = value
    else delete next[key]
  }
  if (patch.allTime) set(PERIOD_KEY, ALL_TIME)
  if ('method' in patch) set('method', patch.method)
  if ('slow' in patch) set('slow', patch.slow ? 'true' : null)
  if ('route' in patch) set('route', null)
  if ('path' in patch) set('path', null)
  if ('error' in patch) set('error', null)
  if ('incident' in patch) {
    set('since', null)
    set('until', null)
  }
  const linked = LINK_FILTER_KEYS.some((key) => !!next[key]) || !!next.since
  if (patch.allTime || !linked) delete next.from
  return next
}

/**
 * The filters' part of the URL, cleared: method, slowness and links, an
 * incident's range among them. The period stays the selector's.
 */
export function clearedLogsFilters(query: Query): Record<string, string> {
  return withLogsFilters(query, {
    method: null,
    slow: false,
    route: null,
    path: null,
    error: null,
    incident: null,
  })
}

/**
 * Whether the URL narrows the request table besides its period: a method,
 * the slow requests, a link's filters.
 */
export function hasLogsFilters(filters: LogsFilters): boolean {
  return !!filters.method || filters.slow || hasLinkFilters(filters)
}

/** Why the request table is empty, to word its empty state. */
export type LogsEmptyCause =
  | 'error'
  | 'search'
  | 'link'
  | 'filters'
  | 'first-run'

/**
 * What the empty table owes its emptiness to, the most specific first: a
 * failed list, the search, a link's filters, the other filters, else nothing
 * captured yet. The DMS only knows its own search and filters: the URL's
 * filters are read here.
 */
export function logsEmptyCause(
  state: string | undefined,
  search: string | undefined,
  filters: LogsFilters,
  period: LogsPeriod,
): LogsEmptyCause {
  if (state === 'error') return 'error'
  if (search?.trim()) return 'search'
  if (hasLinkFilters(filters)) return 'link'
  // A period frames the rows unless it is "All time".
  if (hasLogsFilters(filters) || !isAllTime(period)) return 'filters'
  return 'first-run'
}

const BYTES_PER_KB = 1024

/**
 * The body size limit in the unit that reads best: `none` when bodies are
 * not captured, bytes under 1 KB (a 300 B limit is not "0 KB").
 */
export function bodyLimit(bytes: number): {
  unit: 'none' | 'b' | 'kb'
  amount: number
} {
  if (bytes <= 0) return { unit: 'none', amount: 0 }
  if (bytes < BYTES_PER_KB) return { unit: 'b', amount: Math.round(bytes) }
  return { unit: 'kb', amount: Math.round((bytes / BYTES_PER_KB) * 10) / 10 }
}
