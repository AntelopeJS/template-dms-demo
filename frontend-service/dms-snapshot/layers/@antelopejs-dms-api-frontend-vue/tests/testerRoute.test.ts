import { once } from 'node:events'
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DmsServerEvent } from '#dms/server'
import { testerRoute } from '../server/tester'

// The route's own checks, on the event the frontend server hands it. The
// server's (same-origin, the 64 KiB body limit, the session cookie) are its
// own and tested there.

const ACCESS_TOKEN = 'private/owner"access?token'
const REFRESH_TOKEN = 'private\\refresh"token'
const BODY_LIMIT = 64 * 1024

interface Call {
  path: string
  method: string
  headers: IncomingHttpHeaders
  body: string
}

const calls: Call[] = []
let backend = ''
let server: Server
let owner: unknown = true
let ownerStatus = 200

async function fixture(request: IncomingMessage, response: ServerResponse) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  calls.push({
    path: request.url ?? '',
    method: request.method ?? '',
    headers: request.headers,
    body: Buffer.concat(chunks).toString(),
  })
  if (request.url === '/api/auth/me') {
    response.writeHead(ownerStatus, { location: '/unexpected-owner-redirect' })
    return response.end(JSON.stringify({ owner }))
  }
  if (request.url === '/api/network-error') return request.socket.destroy()
  if (request.url === '/api/large')
    return response.end('a'.repeat(BODY_LIMIT + 1))
  if (request.url === '/api/redirect') {
    response.writeHead(302, {
      location: 'https://dms.example/unexpected-redirect',
      'set-cookie': 'upstream=secret',
    })
    return response.end('redirect response')
  }
  response.writeHead(422, {
    'x-result': 'fixture',
    'set-cookie': 'upstream=secret',
    'x-reflected': ACCESS_TOKEN,
    'x-reflected-uri': encodeURIComponent(ACCESS_TOKEN),
    'x-reflected-json': JSON.stringify(REFRESH_TOKEN).slice(1, -1),
    connection: 'x-hop',
    'x-hop': 'hidden',
  })
  response.end(
    [
      request.method,
      request.url,
      Buffer.concat(chunks),
      ACCESS_TOKEN,
      REFRESH_TOKEN,
      encodeURIComponent(ACCESS_TOKEN),
      JSON.stringify(REFRESH_TOKEN).slice(1, -1),
    ].join(':'),
  )
}

/** The URL the frontend server's `backendUrl` gives: always on its origin. */
function backendUrl(path: string): URL {
  const { pathname, search, hash } = new URL(path, 'http://frontend.local')
  const url = new URL(backend)
  url.pathname = pathname
  url.search = search
  url.hash = hash
  return url
}

const signedIn = { accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN }

async function invoke(
  input: Record<string, unknown> = {},
  session: unknown = signedIn,
  readJson?: () => Promise<unknown>,
) {
  const event = {
    session: { read: () => session },
    readJson:
      readJson ??
      (async () => ({
        path: '/api/echo',
        method: 'GET',
        headers: {},
        useSession: true,
        ...input,
      })),
    backendUrl,
  } as unknown as DmsServerEvent
  const response = await testerRoute(event)
  return { response, data: await response.json() }
}

beforeAll(async () => {
  server = createServer((request, response) => void fixture(request, response))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address !== 'object') throw new Error('no address')
  backend = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((settle) => server.close(settle))
})

beforeEach(() => {
  calls.length = 0
  owner = true
  ownerStatus = 200
})

describe('the tester route', () => {
  it('injects the session only when enabled and redacts reflected credentials', async () => {
    const { response, data } = await invoke()
    expect(response.status).toBe(200)
    expect(calls[0].headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(calls[1].headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(calls[1].headers['x-antelopejs-namespace']).toBe('default')
    expect(data.status).toBe(422)
    expect(data.body).toBe(
      'GET:/api/echo::[REDACTED]:[REDACTED]:[REDACTED]:[REDACTED]',
    )
    expect(data.headers['x-result']).toBe('fixture')
    expect(data.headers['x-reflected']).toBe('[REDACTED]')
    expect(data.headers['x-reflected-uri']).toBe('[REDACTED]')
    expect(data.headers['x-reflected-json']).toBe('[REDACTED]')
    expect(data.headers['set-cookie']).toBeUndefined()
    expect(data.headers['x-hop']).toBeUndefined()
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('still checks the owner with the session when forwarding anonymously', async () => {
    const { response } = await invoke({ useSession: false })
    expect(response.status).toBe(200)
    expect(calls[0].headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(calls[1].headers.authorization).toBeUndefined()
    expect(calls[1].headers['x-antelopejs-namespace']).toBeUndefined()
  })

  it('lets a manual authorization, even empty, override the session', async () => {
    for (const useSession of [true, false]) {
      for (const authorization of ['Bearer manual', '']) {
        calls.length = 0
        await invoke({
          useSession,
          headers: {
            AuThOrIzAtIoN: authorization,
            'X-Antelopejs-Namespace': 'custom',
          },
        })
        expect(calls[1].headers.authorization).toBe(authorization)
        expect(calls[1].headers['x-antelopejs-namespace']).toBe('custom')
      }
    }
  })

  it('refuses a missing session, a non-owner and a revoked one', async () => {
    expect((await invoke({}, null)).response.status).toBe(401)
    expect(calls).toHaveLength(0)
    for (const value of [false, 'true', 1, null]) {
      owner = value
      expect((await invoke({ useSession: false })).response.status).toBe(403)
    }
    owner = true
    ownerStatus = 401
    expect((await invoke()).response.status).toBe(403)
    ownerStatus = 302
    expect((await invoke()).response.status).toBe(403)
    expect(calls.every((call) => call.path === '/api/auth/me')).toBe(true)
  })

  it('refuses malicious paths before any backend call', async () => {
    for (const path of [
      'https://attacker.invalid/api',
      '//attacker.invalid',
      '/\\attacker',
      '/api#fragment',
      '/api/../escape',
      '/api/%2e%2e/escape',
      '/%252f%252fattacker',
      '/api/%255cescape',
      '/api/%00',
      '/api/\n',
      '/api/%zz',
      'api/echo',
      '/api/%23fragment',
    ])
      expect((await invoke({ path })).response.status, path).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('forwards any backend path with its query, method and body', async () => {
    for (const path of [
      '/settings',
      '/dms/page',
      '/custom/action?next=https%3A%2F%2Fexample.org%2F%23section%25done',
    ]) {
      const { response } = await invoke({
        path,
        method: 'PATCH',
        body: 'asymmetric body',
        headers: { 'Content-Type': 'text/plain' },
      })
      expect(response.status).toBe(200)
      expect(calls.at(-1)).toMatchObject({
        path,
        method: 'PATCH',
        body: 'asymmetric body',
      })
    }
  })

  it('strips transport, cookie, control and connection-nominated headers', async () => {
    const headers = {
      hOsT: 'attacker.invalid',
      CoOkIe: 'secret=value',
      CoNnEcTiOn: 'X-Nominated',
      'X-Nominated': 'hidden',
      'Proxy-Authorization': 'private',
      'X-Forwarded-Host': 'attacker.invalid',
      'X-Dms-Service-Token': 'privileged',
      'Sec-Fetch-Site': 'same-origin',
      'X-Http-Method-Override': 'DELETE',
      'X-Custom': 'retained',
    }
    expect((await invoke({ headers, useSession: false })).response.status).toBe(
      200,
    )
    const forwarded = calls.at(-1)!.headers
    expect(forwarded.host).toBe(new URL(backend).host)
    expect(forwarded['x-custom']).toBe('retained')
    for (const name of Object.keys(headers)
      .map((name) => name.toLowerCase())
      .filter((name) => !['host', 'connection', 'x-custom'].includes(name)))
      expect(forwarded[name], name).toBeUndefined()
  })

  it('returns a redirect as it is, without following it', async () => {
    const { data } = await invoke({ path: '/api/redirect' })
    expect(data).toMatchObject({
      status: 302,
      headers: { location: 'https://dms.example/unexpected-redirect' },
      body: 'redirect response',
    })
    expect(data.headers['set-cookie']).toBeUndefined()
    expect(calls).toHaveLength(2)
  })

  it('answers a body past the server limit with 413, and network trouble with a generic 502', async () => {
    const tooLarge = Object.assign(new Error('Request body too large'), {
      status: 413,
    })
    const { response } = await invoke({}, signedIn, () =>
      Promise.reject(tooLarge),
    )
    expect(response.status).toBe(413)
    expect(calls).toHaveLength(0)
    for (const path of ['/api/large', '/api/network-error']) {
      const { response, data } = await invoke({ path })
      expect(response.status).toBe(502)
      expect(data).toEqual({ error: 'DMS tester request failed' })
    }
  })

  it('validates the method, the header values and the body before any backend call', async () => {
    for (const input of [
      { method: 'CONNECT' },
      { useSession: 'false' },
      { headers: [] },
      { headers: { x: 1 } },
      { headers: { x: 'bad\r\nheader' } },
      { body: 'GET body' },
      { method: 'POST', body: {} },
    ])
      expect((await invoke(input)).response.status).toBe(400)
    expect(calls).toHaveLength(0)
  })
})
