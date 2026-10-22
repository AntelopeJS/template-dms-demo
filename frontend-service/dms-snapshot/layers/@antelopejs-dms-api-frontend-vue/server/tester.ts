import type { DmsServerEvent, DmsSession } from '#dms/server'

// The API tester's server half: forwards one call the owner composes to the
// backend, with the session's credential when asked, and returns the answer
// without the session's tokens. Owner-only: the session must belong to the
// instance owner, which the backend confirms on every call.

const RESPONSE_LIMIT = 64 * 1024
const REQUEST_TIMEOUT_MS = 30_000
const METHODS = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
])
const BLOCKED_HEADERS = new Set([
  'host',
  'cookie',
  'cookie2',
  'set-cookie',
  'set-cookie2',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'expect',
  'forwarded',
  'origin',
  'referer',
  'via',
  'authorization',
])
const CONTROL_HEADER =
  /^(?:sec-|proxy-|x-forwarded-|x-dms-|x-inertia|x-http-method|x-method-override|x-original-|x-rewrite-)/i
// URL paths must reject literal control characters before forwarding.
const UNSAFE_PATH = /[\\#\u0000- \u007f]/
// Decoded path segments need the same boundary after every decoding pass.
const UNSAFE_DECODED_SEGMENT = /[\\/#\u0000- \u007f]/

interface TesterInput {
  path?: unknown
  method?: unknown
  headers?: unknown
  body?: unknown
  useSession?: unknown
}

interface ValidInput {
  method: string
  headers: Record<string, string>
  body?: string
  useSession: boolean
}

class InvalidInput extends Error {
  readonly status = 400
}

function invalidInput(): never {
  throw new InvalidInput('Invalid tester request')
}

function validatePathSegment(segment: string) {
  let decoded = segment
  for (;;) {
    if (['.', '..'].includes(decoded) || UNSAFE_DECODED_SEGMENT.test(decoded))
      invalidInput()
    let next: string
    try {
      next = decodeURIComponent(decoded)
    } catch {
      invalidInput()
    }
    if (next === decoded) break
    decoded = next
  }
}

function targetUrl(event: DmsServerEvent, path: unknown): URL {
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    UNSAFE_PATH.test(path)
  )
    invalidInput()
  path.split('?', 1)[0].split('/').forEach(validatePathSegment)
  const target = event.backendUrl(path)
  if (target.hash) invalidInput()
  return target
}

function filteredHeaders(input: HeadersInit, allowAuthorization = false) {
  const source = new Headers(input)
  const connection = new Set(
    (source.get('connection') ?? '')
      .toLowerCase()
      .split(',')
      .map((name) => name.trim()),
  )
  return new Headers(
    [...source].filter(
      ([name]) =>
        !connection.has(name) &&
        !CONTROL_HEADER.test(name) &&
        (!BLOCKED_HEADERS.has(name) ||
          (allowAuthorization && name === 'authorization')),
    ),
  )
}

function validateInput(event: DmsServerEvent, input: TesterInput) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    invalidInput()
  if (
    typeof input.method !== 'string' ||
    !METHODS.has(input.method) ||
    typeof input.useSession !== 'boolean'
  )
    invalidInput()
  const headers = input.headers
  if (!headers || typeof headers !== 'object' || Array.isArray(headers))
    invalidInput()
  if (Object.values(headers).some((value) => typeof value !== 'string'))
    invalidInput()
  if (
    input.body !== undefined &&
    (typeof input.body !== 'string' || ['GET', 'HEAD'].includes(input.method))
  )
    invalidInput()
  try {
    new Headers(headers as Record<string, string>)
  } catch {
    invalidInput()
  }
  return {
    target: targetUrl(event, input.path),
    input: input as ValidInput,
  }
}

async function limitedText(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > RESPONSE_LIMIT) {
      await reader.cancel()
      throw new Error('Backend response too large')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function isOwner(
  event: DmsServerEvent,
  session: DmsSession,
  signal: AbortSignal,
) {
  const response = await fetch(event.backendUrl('/api/auth/me'), {
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      'x-antelopejs-namespace': 'default',
    },
    redirect: 'manual',
    signal,
  })
  const text = await limitedText(response)
  if (!response.ok) return false
  return JSON.parse(text)?.owner === true
}

function redact(value: string, session: DmsSession): string {
  const secrets = [session.accessToken, session.refreshToken].filter(
    (secret): secret is string => typeof secret === 'string' && !!secret.length,
  )
  return secrets.reduce((result, secret) => {
    const variants = [
      secret,
      encodeURIComponent(secret),
      JSON.stringify(secret).slice(1, -1),
    ]
    return variants.reduce(
      (text, variant) => text.replaceAll(variant, '[REDACTED]'),
      result,
    )
  }, value)
}

async function forward(
  input: ValidInput,
  target: URL,
  session: DmsSession,
  signal: AbortSignal,
) {
  const headers = filteredHeaders(input.headers, true)
  if (input.useSession && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${session.accessToken}`)
    if (!headers.has('x-antelopejs-namespace'))
      headers.set('x-antelopejs-namespace', 'default')
  }
  const upstream = await fetch(target, {
    method: input.method,
    headers,
    redirect: 'manual',
    signal,
    body: input.body,
  })
  const responseHeaders = Object.fromEntries(
    [...filteredHeaders(upstream.headers)].map(([name, value]) => [
      redact(name, session),
      redact(value, session),
    ]),
  )
  return {
    status: upstream.status,
    headers: responseHeaders,
    body: redact(await limitedText(upstream), session),
  }
}

function failure(status: number, error: string): Response {
  return Response.json({ error }, { status })
}

function inputFailureStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | undefined)?.status
  return status === 400 || status === 413 ? status : undefined
}

/**
 * `POST /api/_dms-api/tester`: forwards an owner's tester call without
 * returning the session's credentials.
 */
export async function testerRoute(event: DmsServerEvent): Promise<Response> {
  try {
    const session = event.session.read()
    if (!session?.accessToken) return failure(401, 'Not authenticated')
    const { input, target } = validateInput(
      event,
      await event.readJson<TesterInput>(),
    )
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    if (!(await isOwner(event, session, signal)))
      return failure(403, 'Forbidden')
    return Response.json(await forward(input, target, session, signal))
  } catch (error) {
    const status = inputFailureStatus(error)
    return status
      ? failure(status, 'Invalid tester request')
      : failure(502, 'DMS tester request failed')
  }
}
