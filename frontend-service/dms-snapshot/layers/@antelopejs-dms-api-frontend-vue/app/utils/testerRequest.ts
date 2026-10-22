import { prettyBody } from './format'
import { acceptsRequestBody } from './http'
import { REDACTED } from './snippets'

/** Editable request data; stored session credentials stay on the server. */
export interface TesterRequest {
  method: string
  headers: Record<string, string>
  body?: string
  useSession: boolean
}

/** Raw upstream response, including unsuccessful HTTP statuses. */
export interface TesterResponse {
  status: number
  headers: Record<string, string>
  body: string
}

/** One header, query parameter or form field of the tester, in order. */
export interface KeyValue {
  name: string
  value: string
}

/** How the body is written, and the content type it implies. */
export type BodyMode = 'json' | 'text' | 'form' | 'none'

/** Who the call is authenticated as, as the DMS proxy sends it. */
export type AuthMode = 'session' | 'manual' | 'none'

// --- The tester's server route (`/api/_dms-api/tester`) ---
// `server/tester.ts`, in this module's `dms.server.ts`: the limits it applies,
// and what it answers when it does not forward a call. Its error bodies hold one
// generic text per status, so the status, the elapsed time and the checks
// below are what tell the causes apart.

/** Where the tester's server route answers. */
export const TESTER_ROUTE = '/api/_dms-api/tester'
/** The proxy reads at most this much of the request (the JSON envelope). */
export const PROXY_BODY_LIMIT = 64 * 1024
/**
 * The proxy fails (502) when the API answers more than this, and returns
 * neither the status nor the start of the body: `limitedText()` throws
 * "Backend response too large" past `RESPONSE_LIMIT` (`server/tester.ts`),
 * and `testerRoute()` turns every error into the same 502 "DMS tester request
 * failed", as for an API down. Only the
 * capture of the call tells the two apart. For the DMS: return the status,
 * the headers and the first 64 KiB with a `truncated: true` flag instead of
 * throwing, and give the 502 a `reason` (`too_large`, `timeout`,
 * `unreachable`).
 */
export const PROXY_RESPONSE_LIMIT = 64 * 1024
/** The proxy gives up on the API after this long, with a 502 as well. */
export const PROXY_TIMEOUT_MS = 30_000
/** Our own limit, should the proxy never answer. */
const CLIENT_TIMEOUT_MS = PROXY_TIMEOUT_MS + 5_000
/** A 502 this late is the proxy's timeout. */
const TIMEOUT_MARGIN_MS = 1_000

/**
 * Marks of a call sent by the tester, which the module reads to keep it out
 * of the statistics and to find it in the logs: its own request id, and a
 * token the server signs (`GET /api/monitoring/tester/source`), so no client
 * can declare its calls the Tester's. Not `x-dms-*`: the proxy drops those.
 */
export const SOURCE_HEADER = 'x-antelopejs-api-source'
export const REQUEST_ID_HEADER = 'x-request-id'

/** Where the Tester asks for the token its next calls carry. */
export const TESTER_SOURCE_URL = '/api/monitoring/tester/source'

/** A token as the server signs it: `{ header, value, expiresAt }`. */
export interface TesterSourceToken {
  header: string
  value: string
  expiresAt: string
}

/**
 * A stand-in as long as a real token (`tester.<ms>.<base64url SHA-256>`), to
 * size a request before one is asked for.
 */
export const SIZE_PROBE_SOURCE = `tester.${'0'.repeat(13)}.${'0'.repeat(43)}`

/** A token is asked again this long before it expires. */
const SOURCE_RENEW_MARGIN_MS = 60_000

/**
 * The tokens of the Tester's calls: one asked for, then reused until a
 * minute before it expires.
 */
export function createSourceTokens(
  ask: () => Promise<TesterSourceToken>,
  now: () => number = Date.now,
): { get: () => Promise<TesterSourceToken> } {
  let current: TesterSourceToken | null = null
  return {
    async get() {
      if (
        current &&
        Date.parse(current.expiresAt) - SOURCE_RENEW_MARGIN_MS > now()
      )
        return current
      current = await ask()
      return current
    },
  }
}

const CONTENT_TYPES: Record<BodyMode, string | undefined> = {
  json: 'application/json',
  text: 'text/plain',
  form: 'application/x-www-form-urlencoded',
  none: undefined,
}

/** Why the tester could not get an answer from the API. */
export type TesterErrorCode =
  /** The proxy refused the path, a header or the body (400). */
  | 'invalid_input'
  /** The request is over the proxy's 64 KiB (413). */
  | 'body_too_large'
  /** The console session is gone (401 from the proxy). */
  | 'not_authenticated'
  /** The tester is for owners only (403). */
  | 'not_owner'
  /** The call did not come from the console's origin (403). */
  | 'cross_origin'
  /** The proxy got nothing it could return (502): API down, or an answer over 64 KiB. */
  | 'proxy_failed'
  /** Seen in the logs after a 502: the API answered more than 64 KiB. */
  | 'response_too_large'
  /** No answer within 30 s. */
  | 'timeout'
  /** Cancelled before the answer. */
  | 'aborted'
  /** The console's server could not be reached. */
  | 'network'
  /** Any other answer of the proxy. */
  | 'unexpected'

/** Codes after which the API was never called: nothing to find in the logs. */
const NOT_SENT: ReadonlySet<TesterErrorCode> = new Set([
  'invalid_input',
  'body_too_large',
  'not_authenticated',
  'not_owner',
  'cross_origin',
])

export function neverSent(code: TesterErrorCode | undefined): boolean {
  return code !== undefined && NOT_SENT.has(code)
}

export class TesterError extends Error {
  readonly code: TesterErrorCode
  readonly status?: number

  constructor(code: TesterErrorCode, message: string, status?: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** What the tester shows of one call, and keeps in its draft and history. */
export interface TesterResult {
  status: number
  /** Measured in the browser, through the proxy. */
  durationMs: number
  headers: Record<string, string>
  body: string
  /** Size of the whole answer, when `body` was cut to be stored. */
  bodySize?: number
  bodyTruncated?: boolean
  error?: TesterErrorCode
  message?: string
  auth: AuthMode
  /** Credential headers it was sent with, by name: their values are never kept. */
  secrets?: string[]
  /** The `x-request-id` it was sent with: its captured request. */
  requestId?: string
  /** What the module captured of it, once found: kept with the answer. */
  captured?: CapturedSummary
  /** Cancelled because the tester left its route: the API may have it. */
  abandoned?: boolean
  at: number
}

/** The capture of a call, as far as its answer line goes. */
export interface CapturedSummary {
  id: string
  status: number
  responseTimeMs: number | null
  /** Over the slow threshold of the module. */
  slow: boolean
}

export function capturedSummary(log: CapturedRequest): CapturedSummary {
  return {
    id: log._id,
    status: log.statusCode,
    responseTimeMs: log.responseTimeMs,
    slow:
      log.responseTimeMs !== null &&
      log.slowThresholdMs !== undefined &&
      log.responseTimeMs >= log.slowThresholdMs,
  }
}

// --- Building the request ---

/** The query of `rows`, every value kept: repeated names, empty values. */
export function queryString(rows: KeyValue[]): string {
  const params = new URLSearchParams()
  for (const { name, value } of rows) if (name) params.append(name, value)
  return params.toString()
}

export function withQueryRows(path: string, rows: KeyValue[]): string {
  const search = queryString(rows)
  return search ? `${path}?${search}` : path
}

export function contentTypeFor(mode: BodyMode): string | undefined {
  return CONTENT_TYPES[mode]
}

/** The mode a captured or typed content type is edited in. */
export function bodyModeFor(contentType: string | undefined): BodyMode {
  const type = (contentType ?? '').toLowerCase()
  if (type.includes('json')) return 'json'
  if (type.includes('x-www-form-urlencoded')) return 'form'
  return 'text'
}

/** The body as sent: nothing for `none` or an empty text. */
export function serializeBody(
  mode: BodyMode,
  text: string,
  form: KeyValue[],
): string | undefined {
  if (mode === 'none') return undefined
  if (mode === 'form') return queryString(form) || undefined
  return text.trim() ? text : undefined
}

/** Why `text` is not JSON, or null. The tester warns, it never blocks. */
export function jsonProblem(text: string): string | null {
  if (!text.trim()) return null
  try {
    JSON.parse(text)
    return null
  } catch (cause) {
    return (cause as Error).message
  }
}

/** `text` indented, or null when it is not JSON. */
export function formatJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return null
  }
}

function headerKey(record: Record<string, string>, name: string) {
  const lower = name.toLowerCase()
  return Object.keys(record).find((key) => key.toLowerCase() === lower)
}

export function headerValue(
  record: Record<string, string>,
  name: string,
): string | undefined {
  const key = headerKey(record, name)
  return key === undefined ? undefined : record[key]
}

/** Header layers merged in order, a later name replacing an earlier one whatever its case. */
export function mergeHeaders(
  ...layers: Array<Record<string, string> | KeyValue[]>
): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const layer of layers) {
    const entries = Array.isArray(layer)
      ? layer.map((entry) => [entry.name, entry.value] as const)
      : Object.entries(layer)
    for (const [name, value] of entries) {
      if (!name) continue
      const existing = headerKey(merged, name)
      if (existing !== undefined) delete merged[existing]
      merged[name] = value
    }
  }
  return merged
}

/**
 * The credentials the proxy sends: a typed Authorization header wins over
 * the session, which it then leaves out.
 */
export function authModeOf(
  headers: Record<string, string>,
  useSession: boolean,
): AuthMode {
  if (headerValue(headers, 'authorization') !== undefined) return 'manual'
  return useSession ? 'session' : 'none'
}

/** A version 4 UUID, outside secure contexts too. */
export function newRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4),
    hex.slice(4, 6),
    hex.slice(6, 8),
    hex.slice(8, 10),
    hex.slice(10),
  ]
    .map((part) => part.join(''))
    .join('-')
}

/**
 * `headers` with the marks that tell the module this call is the tester's:
 * its request id, and the signed token (`source`).
 */
export function markedHeaders(
  headers: Record<string, string>,
  requestId: string,
  source: string,
): Record<string, string> {
  return mergeHeaders(headers, {
    [REQUEST_ID_HEADER]: requestId,
    [SOURCE_HEADER]: source,
  })
}

// --- What the proxy would refuse, said before sending ---

/** Characters a decoded path segment may not hold, as the proxy checks it. */
const UNSAFE_SEGMENT = /[\\/#\u0000-\u0020\u007f]/

export type TesterInputProblem =
  | { code: 'path_value'; name: string }
  | { code: 'header'; name: string }
  | { code: 'body_too_large'; size: number }

function decodedFully(value: string): string | null {
  let decoded = value
  for (;;) {
    let next: string
    try {
      next = decodeURIComponent(decoded)
    } catch {
      return null
    }
    if (next === decoded) return decoded
    decoded = next
  }
}

/** Size of what the proxy reads: the request and its path, as JSON. */
export function envelopeSize(path: string, request: TesterRequest): number {
  return new TextEncoder().encode(JSON.stringify({ ...request, path })).length
}

/**
 * The first thing the proxy would refuse in this request: a path value it
 * reads as a separator (`/`, a space…), a header the platform rejects, or a
 * request over 64 KiB. Null when it would forward it.
 */
export function inputProblem(
  pathValues: Record<string, string>,
  path: string,
  request: TesterRequest,
): TesterInputProblem | null {
  for (const [name, value] of Object.entries(pathValues)) {
    if (!value) continue
    const decoded = decodedFully(value)
    if (decoded === null || ['.', '..'].includes(decoded))
      return { code: 'path_value', name }
    if (UNSAFE_SEGMENT.test(decoded)) return { code: 'path_value', name }
  }
  for (const [name, value] of Object.entries(request.headers)) {
    try {
      new Headers([[name, value]])
    } catch {
      return { code: 'header', name }
    }
  }
  const size = envelopeSize(path, request)
  if (size > PROXY_BODY_LIMIT) return { code: 'body_too_large', size }
  return null
}

// --- Sending ---

function resolvePath(target: string, origin: string): string {
  const url = new URL(target, origin)
  if (
    (!target.startsWith('/') && !/^https?:\/\//.test(target)) ||
    target.startsWith('//') ||
    target.includes('\\') ||
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new TesterError(
      'invalid_input',
      'API Tester requires a same-origin URL without credentials or fragments',
    )
  }
  return `${url.pathname}${url.search}`
}

/** The cause of an answer of the proxy that is not the API's. */
export function proxyFailure(
  status: number,
  payload: unknown,
  elapsedMs: number,
): TesterErrorCode {
  const reason =
    payload && typeof payload === 'object' && 'reason' in payload
      ? (payload as { reason?: unknown }).reason
      : undefined
  switch (status) {
    case 400:
      return 'invalid_input'
    case 401:
      return 'not_authenticated'
    case 403:
      return reason ? 'cross_origin' : 'not_owner'
    case 413:
      return 'body_too_large'
    case 502:
      return elapsedMs >= PROXY_TIMEOUT_MS - TIMEOUT_MARGIN_MS
        ? 'timeout'
        : 'proxy_failed'
    default:
      return 'unexpected'
  }
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Sends a same-origin request through the authenticated owner-only Tester
 * BFF. Fails with a {@link TesterError} naming the cause when the API's
 * answer does not come back: refused by the proxy, cancelled through
 * `signal`, timed out, or unreachable.
 */
export async function sendTesterRequest(
  target: string,
  origin: string,
  request: TesterRequest,
  signal?: AbortSignal,
): Promise<TesterResponse> {
  const path = resolvePath(target, origin)
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, CLIENT_TIMEOUT_MS)
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel)
  const started = Date.now()
  try {
    let response: Response
    try {
      response = await fetch(TESTER_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...request, path }),
        signal: controller.signal,
      })
    } catch (cause) {
      if (timedOut) throw new TesterError('timeout', 'Timed out')
      if (signal?.aborted) throw new TesterError('aborted', 'Cancelled')
      throw new TesterError(
        'network',
        cause instanceof Error ? cause.message : String(cause),
      )
    }
    if (!response.ok) {
      const payload = await readPayload(response)
      const code = proxyFailure(response.status, payload, Date.now() - started)
      throw new TesterError(
        code,
        `API Tester request failed (${response.status})`,
        response.status,
      )
    }
    return (await response.json()) as TesterResponse
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}

/**
 * `text` with its bidirectional controls shown as `⟨U+202E⟩`: invisible, they
 * would turn the text around on screen without saying so.
 */
export function revealBidi(text: string): string {
  return text.replace(
    /[‎‏‪-‮⁦-⁩]/g,
    (char) =>
      `⟨U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}⟩`,
  )
}

// --- Masked values ---

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A masked value as the capture writes it, raw or URL-encoded. */
const MASK = `${literal(REDACTED)}|${literal(encodeURIComponent(REDACTED))}`
const REDACTED_PATTERN = new RegExp(MASK, 'gi')
const JSON_FIELD = new RegExp(
  `"([^"\\\\]+)"\\s*:\\s*"${literal(REDACTED)}"`,
  'g',
)
const FORM_FIELD = new RegExp(`(?:^|&)([^&=\\s]+)=(?:${MASK})`, 'gi')

/** How many masked values `text` still holds, raw or URL-encoded. */
export function countRedacted(text: string | undefined): number {
  return text ? (text.match(REDACTED_PATTERN) ?? []).length : 0
}

export function hasRedacted(text: string | undefined): boolean {
  return countRedacted(text) > 0
}

/** Names of the masked fields of a JSON or form body, for the warning. */
export function redactedFields(text: string): string[] {
  const names = new Set<string>()
  for (const match of text.matchAll(JSON_FIELD)) names.add(match[1])
  for (const match of text.matchAll(FORM_FIELD)) {
    try {
      names.add(decodeURIComponent(match[1].replace(/\+/g, ' ')))
    } catch {
      names.add(match[1])
    }
  }
  return [...names]
}

// --- Replaying a captured request ---

/** A request as the logs' detail route returns it. */
export interface CapturedRequest {
  _id: string
  timestamp: string
  method: string
  uri: string
  route: string
  statusCode: number
  responseTimeMs: number | null
  pathParams?: Record<string, string>
  query?: Record<string, string | string[]>
  requestHeaders?: Record<string, string>
  requestBody?: string
  requestBodyTruncated?: boolean
  requestBodyOmitted?: string | null
  error?: { message: string; stack?: string } | null
  slowThresholdMs?: number
  source?: string
}

/** Captured headers a replay leaves to the browser and the proxy. */
const SKIPPED_REPLAY_HEADERS = new Set([
  'host',
  'content-length',
  'user-agent',
  'accept-encoding',
  'origin',
  'referer',
  REQUEST_ID_HEADER,
  SOURCE_HEADER,
])

/** What a replay puts in the tester, and what it could not. */
export interface ReplayedRequest {
  headers: KeyValue[]
  /** Captured headers left out, by name. */
  skippedHeaders: string[]
  query: KeyValue[]
  pathValues: Record<string, string>
  bodyMode: BodyMode
  body: string
  /** No body was stored; `bodyOmitted` says why when the capture told. */
  bodyMissing: boolean
  bodyOmitted: string | null
  bodyTruncated: boolean
}

/** `value` decoded once, or as it is when it does not decode. */
export function decodedValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * The tester's fields for a captured request: every query value (repeated
 * names, empty values), path values decoded (they are encoded again on
 * sending), and its own body or none. A form or a cut body is replayed as
 * text, as it was received.
 */
export function replayFrom(captured: CapturedRequest): ReplayedRequest {
  const headers: KeyValue[] = []
  const skippedHeaders: string[] = []
  for (const [name, value] of Object.entries(captured.requestHeaders ?? {})) {
    if (SKIPPED_REPLAY_HEADERS.has(name.toLowerCase()))
      skippedHeaders.push(name)
    else headers.push({ name, value })
  }
  const query = Object.entries(captured.query ?? {}).flatMap(([name, value]) =>
    (Array.isArray(value) ? value : [value]).map((item) => ({
      name,
      value: String(item ?? ''),
    })),
  )
  const pathValues = Object.fromEntries(
    Object.entries(captured.pathParams ?? {}).map(([name, value]) => [
      name,
      decodedValue(String(value)),
    ]),
  )
  const stored = captured.requestBody
  const bodyMissing = stored === undefined || stored === null || stored === ''
  const truncated = !bodyMissing && captured.requestBodyTruncated === true
  const contentType = headerValue(captured.requestHeaders ?? {}, 'content-type')
  let bodyMode: BodyMode = 'none'
  if (acceptsRequestBody(captured.method)) {
    const mode = bodyMissing && !contentType ? 'json' : bodyModeFor(contentType)
    bodyMode = truncated || mode === 'form' ? 'text' : mode
  }
  return {
    headers,
    skippedHeaders,
    query,
    pathValues,
    bodyMode,
    body:
      bodyMissing || bodyMode === 'none'
        ? ''
        : bodyMode === 'json'
          ? prettyBody(stored).text
          : (stored ?? ''),
    bodyMissing: bodyMissing && bodyMode !== 'none',
    bodyOmitted: bodyMissing ? (captured.requestBodyOmitted ?? null) : null,
    bodyTruncated: truncated,
  }
}
