/** Tones of the DMS design system a badge can take. */
export type ApiTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'

/**
 * One colour per method, the same in every screen and theme: reads cyan,
 * creates green, changes amber, deletes red.
 */
const METHOD_TONES: Record<string, ApiTone> = {
  GET: 'info',
  POST: 'success',
  PUT: 'warning',
  PATCH: 'warning',
  DELETE: 'error',
}

export function methodTone(method: string | undefined): ApiTone {
  return METHOD_TONES[(method ?? '').toUpperCase()] ?? 'neutral'
}

/** Methods that change data: the tester warns before sending them. */
const WRITING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isWritingMethod(method: string | undefined): boolean {
  return WRITING_METHODS.has((method ?? '').toUpperCase())
}

/** Methods that carry a request body. */
export function hasRequestBody(method: string | undefined): boolean {
  return isWritingMethod(method)
}

/** Methods a body may go with: the tester's proxy refuses one on GET and HEAD. */
export function acceptsRequestBody(method: string | undefined): boolean {
  return !['GET', 'HEAD'].includes((method ?? '').toUpperCase())
}

/** Methods the tester starts with a body: DELETE gets one only on demand. */
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH'])

export function startsWithRequestBody(method: string | undefined): boolean {
  return BODY_METHODS.has((method ?? '').toUpperCase())
}

export type StatusClass = '2xx' | '3xx' | '4xx' | '5xx'

export function statusClassOf(status: number): StatusClass {
  if (status >= 500) return '5xx'
  if (status >= 400) return '4xx'
  if (status >= 300) return '3xx'
  return '2xx'
}

const STATUS_CLASS_TONES: Record<StatusClass, ApiTone> = {
  '2xx': 'success',
  '3xx': 'info',
  '4xx': 'warning',
  '5xx': 'error',
}

export function statusTone(status: number | string | undefined): ApiTone {
  const code = Number(status)
  if (!Number.isFinite(code) || code <= 0) return 'neutral'
  return STATUS_CLASS_TONES[statusClassOf(code)]
}

const STATUS_TEXTS: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
}

/** The reason phrase of a status code, when it is a common one. */
export function statusText(status: number): string {
  return STATUS_TEXTS[status] ?? ''
}

/** Segments of a route path, each flagged when it is a `:param`. */
export interface PathSegment {
  text: string
  param: boolean
}

export function pathSegments(path: string): PathSegment[] {
  return path
    .split(/(:[A-Za-z_][\w]*)/)
    .filter(Boolean)
    .map((text) => ({ text, param: /^:[A-Za-z_]/.test(text) }))
}

/** `:id` names of a route path. */
export function pathParams(path: string): string[] {
  return pathSegments(path)
    .filter((segment) => segment.param)
    .map((segment) => segment.text.slice(1))
}

export function parseRouteRef(
  ref: string | null | undefined,
): { method: string; path: string } | null {
  const match = ref?.trim().match(/^([A-Za-z]+)\s+(\/\S*)$/)
  return match ? { method: match[1].toUpperCase(), path: match[2] } : null
}

/** The HTTP status of a failed request, when it has one. */
export function errorStatus(error: unknown): number | undefined {
  const value = error as {
    statusCode?: number
    status?: number
    response?: { status?: number }
  }
  return value?.statusCode ?? value?.status ?? value?.response?.status
}
