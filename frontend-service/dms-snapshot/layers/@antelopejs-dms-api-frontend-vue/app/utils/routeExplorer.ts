/**
 * The Routes page's pure logic: how the list groups, orders and walks its
 * routes, and how the page names a period in its links. Kept out of the
 * components so it can be tested without a DMS around it.
 */

/** A route's health, in the words of the API verdict (`route-health.ts`). */
export type RouteState =
  | 'failing'
  | 'slow'
  | 'client-errors'
  | 'recovered'
  | 'healthy'
  | 'idle'

/** What the list needs of a route row of `/routes/list`. */
export interface ExplorerRoute {
  ref: string
  method: string
  path: string
  folder: string
  requests: number
  state: RouteState
}

export interface RouteFolder<T extends ExplorerRoute = ExplorerRoute> {
  path: string
  routes: T[]
  worst: RouteState
}

/**
 * Worst first, for the list and its folders: a route still slow outranks one
 * that has recovered. The Overview orders its Needs attention its own way
 * (recovered right after failing), over the same routes.
 */
export const STATE_RANK: Record<RouteState, number> = {
  failing: 0,
  slow: 1,
  'client-errors': 2,
  recovered: 3,
  healthy: 4,
  idle: 5,
}

/**
 * Failing, slow, answering many 4xx or recovered from an incident a moment
 * ago: the routes the Overview's "Needs attention" lists.
 */
export function needsAttention(route: ExplorerRoute): boolean {
  return STATE_RANK[route.state] < STATE_RANK.healthy
}

/** `/auth/2fa` → `/auth`; a top-level folder is its own parent. */
function parentFolder(folder: string): string {
  const first = folder.split('/').filter(Boolean)[0]
  return first ? `/${first}` : '/'
}

/**
 * The folder each route is listed under. A folder holding a single route
 * folds into its first segment (`/auth/2fa` joins `/auth`), so a large API
 * does not read as dozens of one-line folders. Decided on every route, not
 * on the filtered ones, so filtering never moves a route to another folder.
 */
export function listedFolders(routes: ExplorerRoute[]): Map<string, string> {
  const sizes = new Map<string, number>()
  for (const route of routes) {
    sizes.set(route.folder, (sizes.get(route.folder) ?? 0) + 1)
  }
  return new Map(
    routes.map((route) => [
      route.ref,
      sizes.get(route.folder) === 1 ? parentFolder(route.folder) : route.folder,
    ]),
  )
}

function worstOf(routes: ExplorerRoute[]): RouteState {
  return routes.reduce<RouteState>(
    (worst, route) =>
      STATE_RANK[route.state] < STATE_RANK[worst] ? route.state : worst,
    'idle',
  )
}

/** `routes` grouped under their listed folder, folders and routes by path. */
export function groupRoutes<T extends ExplorerRoute>(
  routes: T[],
  folders: Map<string, string>,
): RouteFolder<T>[] {
  const groups = new Map<string, T[]>()
  for (const route of routes) {
    const folder = folders.get(route.ref) ?? route.folder
    const group = groups.get(folder) ?? []
    group.push(route)
    groups.set(folder, group)
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, members]) => ({
      path,
      routes: [...members].sort(
        (a, b) =>
          a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
      ),
      worst: worstOf(members),
    }))
}

/** Worst state first, then the route serving the most traffic. */
export function bySeverity<T extends ExplorerRoute>(routes: T[]): T[] {
  return [...routes].sort(
    (a, b) =>
      STATE_RANK[a.state] - STATE_RANK[b.state] || b.requests - a.requests,
  )
}

/**
 * The route a step of the keyboard lands on, counted from the last route
 * asked for rather than from the one on screen: pressing ↓ three times walks
 * three routes even while the first one is still loading.
 */
export function stepFrom<T extends ExplorerRoute>(
  items: T[],
  current: string | null,
  step: number,
): T | undefined {
  if (items.length === 0) return undefined
  const index = items.findIndex((route) => route.ref === current)
  if (index === -1) return step < 0 ? items.at(-1) : items[0]
  return items[Math.min(items.length - 1, Math.max(0, index + step))]
}

/**
 * The route a page opened without one shows: the last one looked at, if it
 * is still listed, else the one needing a look first.
 */
export function initialRoute<T extends ExplorerRoute>(
  routes: T[],
  last: string | null,
): T | undefined {
  return (
    (last ? routes.find((route) => route.ref === last) : undefined) ??
    bySeverity(routes)[0]
  )
}

/**
 * The messages listed under a status of the documentation, each with its own
 * count, and how many distinct ones are left out: the status's volume is the
 * status's, never its first message's.
 */
export function listedMessages(
  observed: {
    messages: Array<{ message: string; count: number }>
    /** Distinct messages in all, the listed ones included. */
    messageCount: number
  },
  limit: number,
): { messages: Array<{ message: string; count: number }>; more: number } {
  const messages = observed.messages.slice(0, limit)
  return {
    messages,
    more: Math.max(0, observed.messageCount - messages.length),
  }
}

/** An id safe for `aria-activedescendant`: a route ref holds spaces and `/`. */
export function optionId(index: number): string {
  return `api-route-option-${index}`
}

const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 1440

/** A health window in minutes, as its unit and amount: 15 → min 15, 1440 → h 24. */
export function windowParts(minutes: number): {
  unit: 'min' | 'h' | 'd'
  amount: number
} {
  if (minutes >= MINUTES_PER_DAY * 2 && minutes % MINUTES_PER_DAY === 0)
    return { unit: 'd', amount: minutes / MINUTES_PER_DAY }
  if (minutes >= MINUTES_PER_HOUR && minutes % MINUTES_PER_HOUR === 0)
    return { unit: 'h', amount: minutes / MINUTES_PER_HOUR }
  return { unit: 'min', amount: minutes }
}

const LAST_ROUTE_KEY = 'dms-api:routes:last'

/** The route last opened in this tab, if the browser lets us keep it. */
export function lastRoute(): string | null {
  try {
    return window.sessionStorage.getItem(LAST_ROUTE_KEY)
  } catch {
    return null
  }
}

export function rememberRoute(ref: string): void {
  try {
    window.sessionStorage.setItem(LAST_ROUTE_KEY, ref)
  } catch {
    // Storage blocked: the page falls back to the route needing a look.
  }
}
