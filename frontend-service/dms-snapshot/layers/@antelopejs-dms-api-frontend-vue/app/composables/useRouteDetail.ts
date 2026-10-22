import { computed } from 'vue'
import { errorStatus } from '../utils/http'
import type { RouteState } from '../utils/routeExplorer'

/** One step of the request pipeline of a route, in the order it runs. */
export interface PipelineStep {
  kind: 'prefix' | 'handler' | 'postfix' | 'monitor'
  name: string
  location: string
  priority?: number
  isAuth: boolean
}

export interface InferredField {
  name: string
  types: string[]
  required: boolean
  /** Its value in the most recent body that had it, when a scalar. */
  example?: string | number | boolean | null
}

export interface ParameterInfo {
  index: number
  name: string | null
  source: string
  multi: boolean
  inferredType: string
  modifierCount: number
  rawProviderSource?: string
  /** The decorator that provides it, as written in the code. */
  decorator?: string
  hint?: string
}

export interface PropertyInfo {
  key: string
  decorator: string
  modifierCount: number
  hint?: string
}

/** What is known of a route's authentication, from its code and traffic. */
export interface RouteAuth {
  status: 'required' | 'probable' | 'unknown'
  /** The guards found in the code. */
  guards: string[]
  /** 401 answers over the contract window. */
  unauthorized: number
}

/** A parameter of a route, declared in the code or seen in its traffic. */
export interface DocumentedParameter {
  name: string
  in: 'path' | 'query' | 'header'
  type: string
  example: string | null
  declared: boolean
  required: boolean
}

/** A status the route answered over the contract window. */
export interface ObservedStatus {
  status: number
  count: number
  /** The most frequent error message, null when none was recorded. */
  message: string | null
  /** The most frequent distinct error messages, most frequent first. */
  messages: Array<{ message: string; count: number }>
  /** Distinct error messages in all, `messages` included. */
  messageCount: number
  lastSeen: string
}

export interface RouteDetail {
  ref: string
  method: string
  path: string
  folder: string
  controller: string | null
  handler: string
  module: string | null
  own: boolean | null
  requiresAuth: boolean
  auth: RouteAuth
  registeredAt: string | null
  /**
   * The first day the route was called, from the statistics kept: never
   * further back than their retention. Null before any call.
   */
  firstCallAt?: string | null
  state: RouteState
  /** Minutes of traffic `state` is judged on, the same as the list's. */
  healthWindowMinutes?: number
  /** False when the route lies outside the active route scope. */
  inScope?: boolean
  /** False for a route the module leaves out of its logs (the console's own). */
  captured?: boolean
  /** The last call captured for the route, whatever the period. */
  lastCallAt?: string | null
  pathParams: string[]
  parameters: DocumentedParameter[]
  pipeline: PipelineStep[]
  inspection: {
    parameters: ParameterInfo[]
    properties: PropertyInfo[]
    errorCodes: Array<{ status: number; reason: string | null; source: string }>
    authGuards: string[]
  }
  contract: {
    /** The days the contract is read over, up to now. */
    windowDays: number
    /** Requests answered over the window, the tester's left out. */
    total: number
    exampleBody: unknown
    bodyFields: InferredField[]
    /** Successful requests the bodies and examples were read from. */
    sampled: number
    queryParams: string[]
    statuses: ObservedStatus[]
    /** Path and query of the most recent successful call. */
    examplePath: Record<string, string>
    exampleQuery: Record<string, string | string[]>
    exampleResponse: {
      status: number
      body: string
      json: boolean
      truncated: boolean
    } | null
    responseKind: 'object' | 'array' | null
    responseFields: InferredField[]
    /** Response time of the successful calls, null without any. */
    latency: { p50: number; p95: number } | null
  }
  /** Where clients reach the API, for the snippets; null when unknown. */
  apiOrigin: string | null
}

/**
 * The route the page's `?route=` names, shared by the blocks that show it:
 * the header, the documentation, the tester and the parts of the page that
 * wait for a valid route read one `useApiData` payload (one request per
 * route, which a server render reads and hands over). Another route shows
 * nothing until its payload is in; a failed refresh keeps the last data and
 * says so through `error`.
 */
export function useRouteDetail(fetchUrl: string, queryKey = 'route') {
  const selection = useRouteSelection(queryKey)
  // The header reads it again, on the Statistics tab only: the
  // documentation and the tester must not move with the page's refreshes.
  const detail = useApiData<RouteDetail>(
    () =>
      selection.ref.value
        ? `${fetchUrl}?${new URLSearchParams({ route: selection.ref.value })}`
        : null,
    { refreshOnPageRefresh: false },
  )
  const data = computed(() =>
    detail.placeholder.value ? null : detail.data.value,
  )
  return {
    selection,
    data,
    error: detail.error,
    /** Nothing to show yet for the route named: its first read is running. */
    pending: computed(() => detail.pending.value && data.value === null),
    refresh: () => detail.refresh(),
    missing: computed(() => errorStatus(detail.error.value) === 404),
  }
}
