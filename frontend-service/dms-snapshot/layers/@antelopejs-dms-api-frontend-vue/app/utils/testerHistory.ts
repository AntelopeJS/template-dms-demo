import { byteLength } from './format'
import { startsWithRequestBody } from './http'
import {
  type BodyMode,
  decodedValue,
  type KeyValue,
  type TesterResult,
} from './testerRequest'

// What the tester keeps between two visits: a draft per route for the
// session (sessionStorage), the calls made per route and the headers sent to
// every route in this browser (localStorage), and the routes a write was
// confirmed on. A credential typed in a header (Authorization, Cookie,
// X-Api-Key) is never written to storage: it stays in memory until reload.

/** The editable part of the tester: what is sent. */
export interface DraftRequest {
  bodyMode: BodyMode
  body: string
  form: KeyValue[]
  headers: KeyValue[]
  query: KeyValue[]
  pathValues: Record<string, string>
  useSession: boolean
}

/** Where the body in the editor comes from, for the line under it. */
export type BodyOrigin = 'example' | 'replay' | 'history' | 'edited'

/** The captured request a draft was replayed from, and what it could not restore. */
export interface ReplayInfo {
  id: string
  at: string
  skippedHeaders: string[]
  bodyMissing: boolean
  bodyOmitted: string | null
  bodyTruncated: boolean
}

/** A route's work in progress, kept across tabs, routes and pages. */
export interface TesterDraft {
  request: DraftRequest
  origin: BodyOrigin
  replay: ReplayInfo | null
  result: TesterResult | null
}

/** What the tester remembers of one call, to restore it from the history. */
export interface HistoryEntry {
  at: number
  method: string
  /** The path as sent, query included. */
  path: string
  request: DraftRequest
  /** Credential headers left out of the entry, by name. */
  secretsRemoved?: string[]
  result: TesterResult
}

/** Calls kept per route. */
export const HISTORY_MAX = 25

/** A stored response is cut here: the history is a reminder, not an archive. */
const STORED_BODY_MAX = 4096

const HISTORY_PREFIX = 'dmsApi.tester.history.'
const DRAFT_PREFIX = 'dmsApi.tester.draft.'
const COMMON_HEADERS_KEY = 'dmsApi.tester.commonHeaders'
const CONFIRMED_WRITES_KEY = 'dmsApi.tester.confirmedWrites'

/** Headers a credential travels in: typed in the tester, never stored. */
const SECRET_HEADERS = new Set(['authorization', 'cookie', 'x-api-key'])

/** The credentials of the drafts and the common headers, until reload. */
const secrets = new Map<string, KeyValue[]>()

type StorageName = 'localStorage' | 'sessionStorage'

function read<T>(storage: StorageName, key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window[storage].getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(storage: StorageName, key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    if (value === null) window[storage].removeItem(key)
    else window[storage].setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or disabled: the tester's memory is a convenience, never a blocker.
  }
}

export function isSecretHeader(name: string): boolean {
  return SECRET_HEADERS.has(name.toLowerCase())
}

/** `headers` split into what may be stored and the credentials. */
export function splitSecrets(headers: KeyValue[]): {
  kept: KeyValue[]
  removed: KeyValue[]
} {
  return {
    kept: headers.filter((entry) => !isSecretHeader(entry.name)),
    removed: headers.filter((entry) => isSecretHeader(entry.name)),
  }
}

/** Names of the credential headers a request sends. */
export function secretNames(headers: Record<string, string>): string[] {
  return Object.keys(headers).filter(isSecretHeader)
}

/**
 * Of the credentials a call was sent with, those `headers` no longer hold:
 * dropped from storage, or from memory by a reload. One per name.
 */
export function lostSecrets(sent: string[], headers: KeyValue[]): string[] {
  const held = new Set(
    headers
      .filter((entry) => entry.value)
      .map((entry) => entry.name.toLowerCase()),
  )
  const lost = new Map<string, string>()
  for (const name of sent) {
    const key = name.toLowerCase()
    if (!held.has(key) && !lost.has(key)) lost.set(key, name)
  }
  return [...lost.values()]
}

// --- History ---

function isEntry(value: unknown): value is HistoryEntry {
  const entry = value as HistoryEntry | null
  return (
    !!entry && typeof entry.at === 'number' && !!entry.result && !!entry.request
  )
}

/** The calls made to `route` from this browser, newest first. */
export function loadHistory(route: string): HistoryEntry[] {
  const parsed = read<unknown>('localStorage', `${HISTORY_PREFIX}${route}`)
  return Array.isArray(parsed) ? parsed.filter(isEntry) : []
}

/** `entries` with the result of the call sent as `requestId` patched. */
export function patchResult(
  entries: HistoryEntry[],
  requestId: string,
  patch: Partial<TesterResult>,
): HistoryEntry[] {
  return entries.map((entry) =>
    entry.result.requestId === requestId
      ? { ...entry, result: { ...entry.result, ...patch } }
      : entry,
  )
}

/**
 * Store the calls made to `route`. A response body is cut short, with its
 * real size kept, and credentials are never part of an entry: `useSession`
 * only says the session was on.
 */
export function saveHistory(route: string, entries: HistoryEntry[]): void {
  const trimmed = entries.slice(0, HISTORY_MAX).map((entry) => {
    const { body } = entry.result
    const cut = body.length > STORED_BODY_MAX
    return {
      ...entry,
      request: {
        ...entry.request,
        headers: splitSecrets(entry.request.headers).kept,
      },
      result: {
        ...entry.result,
        body: cut ? body.slice(0, STORED_BODY_MAX) : body,
        bodySize: entry.result.bodySize ?? byteLength(body),
        bodyTruncated: entry.result.bodyTruncated || cut,
      },
    }
  })
  write(
    'localStorage',
    `${HISTORY_PREFIX}${route}`,
    trimmed.length ? trimmed : null,
  )
}

/** A history entry for a call, without the credentials it was sent with. */
export function historyEntry(
  method: string,
  path: string,
  request: DraftRequest,
  result: TesterResult,
): HistoryEntry {
  const { kept, removed } = splitSecrets(request.headers)
  return {
    at: result.at,
    method,
    path,
    request: { ...request, headers: kept },
    ...(removed.length
      ? { secretsRemoved: removed.map((entry) => entry.name) }
      : {}),
    result,
  }
}

/** The path values of the last call that succeeded with all of them set. */
export function lastSuccessfulPathValues(
  entries: HistoryEntry[],
  names: string[],
): Record<string, string> {
  if (names.length === 0) return {}
  const entry = entries.find(
    (item) =>
      item.result.status >= 200 &&
      item.result.status < 300 &&
      names.every((name) => item.request.pathValues[name]),
  )
  return entry
    ? Object.fromEntries(
        names.map((name) => [name, entry.request.pathValues[name]]),
      )
    : {}
}

// --- Drafts ---

/** A route's draft, its credentials put back. */
export function loadDraft(route: string): TesterDraft | null {
  const draft = read<TesterDraft>('sessionStorage', `${DRAFT_PREFIX}${route}`)
  if (!draft?.request) return null
  const kept = secrets.get(`${DRAFT_PREFIX}${route}`) ?? []
  return {
    ...draft,
    request: { ...draft.request, headers: [...draft.request.headers, ...kept] },
  }
}

export function saveDraft(route: string, draft: TesterDraft | null): void {
  const key = `${DRAFT_PREFIX}${route}`
  if (!draft) {
    secrets.delete(key)
    write('sessionStorage', key, null)
    return
  }
  const { kept, removed } = splitSecrets(draft.request.headers)
  secrets.set(key, removed)
  write('sessionStorage', key, {
    ...draft,
    request: { ...draft.request, headers: kept },
  })
}

/** Whether two requests send the same thing, empty rows aside. */
export function sameRequest(a: DraftRequest, b: DraftRequest): boolean {
  const rows = (list: KeyValue[]) =>
    list
      .filter((entry) => entry.name || entry.value)
      .map((entry) => [entry.name, entry.value])
  const shape = (request: DraftRequest) =>
    JSON.stringify([
      request.bodyMode,
      request.bodyMode === 'none' ? '' : request.body,
      rows(request.form),
      rows(request.headers),
      rows(request.query),
      Object.entries(request.pathValues).sort(),
      request.useSession,
    ])
  return shape(a) === shape(b)
}

/**
 * A route's starting point: the last body it accepted (none for GET, HEAD
 * and DELETE), the path values of the last call that succeeded from here,
 * else of the last one the route answered with success, and the session
 * only when the route requires it, surely or probably: a public handler (a
 * webhook) does not get the owner's token.
 */
export function exampleRequest(
  route: {
    method: string
    pathParams: string[]
    exampleBody: unknown
    examplePath?: Record<string, string>
    authStatus: 'required' | 'probable' | 'unknown'
  },
  history: HistoryEntry[],
): DraftRequest {
  const withBody = startsWithRequestBody(route.method)
  const own = lastSuccessfulPathValues(history, route.pathParams)
  const last = Object.keys(own).length
    ? own
    : Object.fromEntries(
        Object.entries(route.examplePath ?? {}).map(([name, value]) => [
          name,
          decodedValue(String(value)),
        ]),
      )
  return {
    bodyMode: withBody ? 'json' : 'none',
    body:
      withBody && route.exampleBody !== undefined && route.exampleBody !== null
        ? JSON.stringify(route.exampleBody, null, 2)
        : '',
    form: [],
    headers: [],
    query: [],
    pathValues: Object.fromEntries(
      route.pathParams.map((name) => [name, last[name] ?? '']),
    ),
    useSession: route.authStatus !== 'unknown',
  }
}

// --- Headers sent to every route ---

export function loadCommonHeaders(): KeyValue[] {
  const stored = read<KeyValue[]>('localStorage', COMMON_HEADERS_KEY)
  return [
    ...(Array.isArray(stored) ? stored : []),
    ...(secrets.get(COMMON_HEADERS_KEY) ?? []),
  ]
}

export function saveCommonHeaders(headers: KeyValue[]): void {
  const { kept, removed } = splitSecrets(
    headers.filter((entry) => entry.name || entry.value),
  )
  secrets.set(COMMON_HEADERS_KEY, removed)
  write('localStorage', COMMON_HEADERS_KEY, kept.length ? kept : null)
}

// --- Writes confirmed this session ---

export function hasConfirmedWrite(route: string): boolean {
  const confirmed = read<string[]>('sessionStorage', CONFIRMED_WRITES_KEY)
  return Array.isArray(confirmed) && confirmed.includes(route)
}

export function rememberConfirmedWrite(route: string): void {
  const confirmed = read<string[]>('sessionStorage', CONFIRMED_WRITES_KEY)
  const list = Array.isArray(confirmed) ? confirmed : []
  if (!list.includes(route))
    write('sessionStorage', CONFIRMED_WRITES_KEY, [...list, route])
}
