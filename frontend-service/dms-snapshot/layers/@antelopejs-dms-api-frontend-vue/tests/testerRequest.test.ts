import { afterEach, describe, expect, it, vi } from 'vitest'
import { fillPath } from '../app/utils/snippets'
import {
  authModeOf,
  bodyModeFor,
  capturedSummary,
  contentTypeFor,
  countRedacted,
  formatJson,
  inputProblem,
  jsonProblem,
  createSourceTokens,
  markedHeaders,
  mergeHeaders,
  newRequestId,
  proxyFailure,
  queryString,
  redactedFields,
  replayFrom,
  revealBidi,
  sendTesterRequest,
  serializeBody,
  TesterError,
  type TesterRequest,
  withQueryRows,
} from '../app/utils/testerRequest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const GET: TesterRequest = { method: 'GET', headers: {}, useSession: true }

describe('sending through the proxy', () => {
  it('forwards raw requests through the owner BFF without copying session credentials', async () => {
    const reply = {
      status: 422,
      headers: { 'content-type': 'application/json' },
      body: '{"invalid":true}',
    }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(reply)))
    vi.stubGlobal('fetch', fetch)
    const result = await sendTesterRequest(
      '/playground/notes/abc%2Fdef?view=raw',
      'https://dms.example',
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer explicit', 'X-Fixture': 'custom' },
        body: 'raw body',
        useSession: false,
      },
    )
    expect(result).toEqual(reply)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/_dms-api/tester')
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init.body)).toEqual({
      method: 'PATCH',
      headers: { Authorization: 'Bearer explicit', 'X-Fixture': 'custom' },
      body: 'raw body',
      useSession: false,
      path: '/playground/notes/abc%2Fdef?view=raw',
    })
  })

  it('normalizes a same-origin absolute URL and retains session mode', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 200, headers: {}, body: 'ok' })),
      )
    vi.stubGlobal('fetch', fetch)
    await sendTesterRequest(
      'https://dms.example/settings/test?x=1',
      'https://dms.example',
      GET,
    )
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      method: 'GET',
      headers: {},
      useSession: true,
      path: '/settings/test?x=1',
    })
  })

  it.each([
    'https://foreign.example/api/private',
    '//foreign.example/api/private',
    '/\\foreign.example/api/private',
    'https://name:password@dms.example/api/private',
    '/api/private#fragment',
    'api/private',
  ])('rejects unsafe target %s before any request', async (target) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(
      sendTesterRequest(target, 'https://dms.example', GET),
    ).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports BFF authorization failures rather than pretending they are upstream responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"error":"Forbidden"}', { status: 403 }),
        ),
    )
    const failure = sendTesterRequest(
      '/api/private',
      'https://dms.example',
      GET,
    )
    await expect(failure).rejects.toThrow('403')
    await expect(failure).rejects.toMatchObject({
      code: 'not_owner',
      status: 403,
    })
  })

  it('tells a cancelled call from an unreachable server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        })
      }),
    )
    const controller = new AbortController()
    const pending = sendTesterRequest(
      '/api/slow',
      'https://dms.example',
      GET,
      controller.signal,
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'aborted' })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )
    await expect(
      sendTesterRequest('/api/x', 'https://dms.example', GET),
    ).rejects.toMatchObject({ code: 'network', message: 'Failed to fetch' })
  })

  it('times out on its own when the proxy never answers', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        })
      }),
    )
    const pending = sendTesterRequest('/api/x', 'https://dms.example', GET)
    const settled = expect(pending).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(40_000)
    await settled
  })

  it('names the cause of each answer of the proxy', () => {
    expect(proxyFailure(400, { error: 'Invalid tester request' }, 5)).toBe(
      'invalid_input',
    )
    expect(proxyFailure(401, {}, 5)).toBe('not_authenticated')
    expect(proxyFailure(403, { error: 'Forbidden' }, 5)).toBe('not_owner')
    expect(
      proxyFailure(
        403,
        { error: 'Forbidden', reason: 'missing or untrusted Origin header' },
        5,
      ),
    ).toBe('cross_origin')
    expect(proxyFailure(413, {}, 5)).toBe('body_too_large')
    expect(proxyFailure(502, {}, 1_200)).toBe('proxy_failed')
    expect(proxyFailure(502, {}, 30_050)).toBe('timeout')
    expect(proxyFailure(500, null, 5)).toBe('unexpected')
    expect(new TesterError('timeout', 'x')).toBeInstanceOf(Error)
  })
})

describe('building the request', () => {
  it('keeps every query value: repeated names and empty values', () => {
    const rows = [
      { name: 'tags', value: 'a' },
      { name: 'tags', value: 'b' },
      { name: 'empty', value: '' },
      { name: '', value: 'ignored' },
      { name: 'search', value: 'Café crème' },
    ]
    expect(queryString(rows)).toBe(
      'tags=a&tags=b&empty=&search=Caf%C3%A9+cr%C3%A8me',
    )
    expect(withQueryRows('/api/orders', [])).toBe('/api/orders')
    expect(withQueryRows('/api/orders', rows.slice(0, 1))).toBe(
      '/api/orders?tags=a',
    )
  })

  it('calls the canonical path of the route, never with a slash added', () => {
    expect(withQueryRows(fillPath('/api/orders', {}), [])).toBe('/api/orders')
    expect(
      withQueryRows(fillPath('/api/orders/:id', { id: 'A 1' }), [
        { name: 'x', value: '1' },
      ]),
    ).toBe('/api/orders/A%201?x=1')
  })

  it('types the body without ever refusing it', () => {
    expect(serializeBody('none', '{"a":1}', [])).toBeUndefined()
    expect(serializeBody('json', '  ', [])).toBeUndefined()
    expect(serializeBody('json', '{"message": "hello",', [])).toBe(
      '{"message": "hello",',
    )
    expect(serializeBody('text', 'hello', [])).toBe('hello')
    expect(
      serializeBody('form', '', [
        { name: 'message', value: 'a b' },
        { name: 'x', value: '' },
      ]),
    ).toBe('message=a+b&x=')
    expect(contentTypeFor('json')).toBe('application/json')
    expect(contentTypeFor('form')).toBe('application/x-www-form-urlencoded')
    expect(contentTypeFor('none')).toBeUndefined()
    expect(bodyModeFor('application/json; charset=utf-8')).toBe('json')
    expect(bodyModeFor('application/x-www-form-urlencoded')).toBe('form')
    expect(bodyModeFor('text/csv')).toBe('text')
  })

  it('warns about invalid JSON and formats valid JSON', () => {
    expect(jsonProblem('')).toBeNull()
    expect(jsonProblem('{"a":1}')).toBeNull()
    expect(jsonProblem('{"a":')).toEqual(expect.any(String))
    expect(formatJson('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(formatJson('{"a":')).toBeNull()
  })

  it('merges header layers whatever their case, and says who is authenticated', () => {
    const merged = mergeHeaders(
      { 'content-type': 'application/json' },
      [{ name: 'X-Env', value: 'common' }],
      [
        { name: 'Content-Type', value: 'text/plain' },
        { name: 'x-env', value: 'route' },
        { name: '', value: 'skipped' },
      ],
    )
    expect(merged).toEqual({ 'Content-Type': 'text/plain', 'x-env': 'route' })
    expect(authModeOf({ Authorization: 'Bearer x' }, true)).toBe('manual')
    expect(authModeOf({}, true)).toBe('session')
    expect(authModeOf({}, false)).toBe('none')
  })

  it('marks the call as the tester’s, with its own request id', () => {
    expect(
      markedHeaders(
        { 'X-Request-Id': 'mine', accept: '*/*' },
        'id-1',
        'tester.1.sig',
      ),
    ).toEqual({
      accept: '*/*',
      'x-request-id': 'id-1',
      'x-antelopejs-api-source': 'tester.1.sig',
    })
  })

  it('reuses a signed source token until a minute before it expires', async () => {
    let clock = 0
    let issued = 0
    const tokens = createSourceTokens(
      async () => {
        issued += 1
        return {
          header: 'x-antelopejs-api-source',
          value: `tester.${issued}`,
          expiresAt: new Date(clock + 15 * 60_000).toISOString(),
        }
      },
      () => clock,
    )
    expect((await tokens.get()).value).toBe('tester.1')
    clock = 13 * 60_000
    expect((await tokens.get()).value).toBe('tester.1')
    clock = 14 * 60_000 + 1
    expect((await tokens.get()).value).toBe('tester.2')
  })

  it('makes version 4 request ids, outside secure contexts too', () => {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    expect(newRequestId()).toMatch(uuid)
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(255),
    })
    expect(newRequestId()).toMatch(uuid)
  })
})

describe('what the proxy would refuse', () => {
  const request = (headers: Record<string, string> = {}, body?: string) => ({
    method: 'POST',
    headers,
    useSession: true,
    ...(body === undefined ? {} : { body }),
  })

  it('names the path value it would read as a separator', () => {
    for (const value of ['A/B', 'a b', '..', 'a%2Fb', 'x#y'])
      expect(inputProblem({ id: value }, '/api/orders/x', request())).toEqual({
        code: 'path_value',
        name: 'id',
      })
    expect(
      inputProblem({ id: 'commande-é😀' }, '/api/orders/x', request()),
    ).toBeNull()
  })

  it('names an invalid header', () => {
    expect(
      inputProblem({}, '/api/orders', request({ 'bad name': 'x' })),
    ).toEqual({ code: 'header', name: 'bad name' })
  })

  it('weighs the request as the proxy reads it', () => {
    const problem = inputProblem(
      {},
      '/api/orders',
      request({}, 'x'.repeat(70_000)),
    )
    expect(problem).toMatchObject({ code: 'body_too_large' })
    expect(
      inputProblem({}, '/api/orders', request({}, 'x'.repeat(60_000))),
    ).toBeNull()
  })
})

describe('masked values', () => {
  it('counts and names them, raw or URL-encoded', () => {
    const json = '{"password": "[REDACTED]", "token":"[REDACTED]", "a": 1}'
    expect(countRedacted(json)).toBe(2)
    expect(redactedFields(json)).toEqual(['password', 'token'])
    const form = 'message=hello&password=%5BREDACTED%5D&access_token=[REDACTED]'
    expect(countRedacted(form)).toBe(2)
    expect(redactedFields(form)).toEqual(['password', 'access_token'])
    expect(countRedacted(undefined)).toBe(0)
  })

  it('shows the bidirectional controls of a text', () => {
    expect(revealBidi('a‮rtl')).toBe('a⟨U+202E⟩rtl')
    expect(revealBidi('plain')).toBe('plain')
  })
})

describe('replaying a captured request', () => {
  const base = {
    _id: '86a7f226-99dd-402c-b727-52f15aea930a',
    timestamp: '2026-10-09T20:18:00.000Z',
    statusCode: 500,
    responseTimeMs: 12,
  }

  it('keeps every query value, decodes path values and lists the headers left out', () => {
    const replayed = replayFrom({
      ...base,
      method: 'GET',
      uri: '/api/orders/:id',
      pathParams: { id: 'commande-%C3%A9%F0%9F%98%80' },
      query: { tags: ['a', 'b', 'c'], empty: '' },
      requestHeaders: {
        accept: '*/*',
        'user-agent': 'qa',
        referer: 'x',
        'x-request-id': 'old',
      },
    })
    expect(replayed.query).toEqual([
      { name: 'tags', value: 'a' },
      { name: 'tags', value: 'b' },
      { name: 'tags', value: 'c' },
      { name: 'empty', value: '' },
    ])
    expect(replayed.pathValues).toEqual({ id: 'commande-é😀' })
    expect(replayed.headers).toEqual([{ name: 'accept', value: '*/*' }])
    expect(replayed.skippedHeaders).toEqual([
      'user-agent',
      'referer',
      'x-request-id',
    ])
    expect(replayed.bodyMode).toBe('none')
    expect(replayed.bodyMissing).toBe(false)
  })

  it('empties the body it does not have, and says why', () => {
    const replayed = replayFrom({
      ...base,
      method: 'POST',
      uri: '/api/orders',
      requestHeaders: { 'content-type': 'application/json' },
      requestBodyOmitted: 'malformed',
    })
    expect(replayed).toMatchObject({
      bodyMode: 'json',
      body: '',
      bodyMissing: true,
      bodyOmitted: 'malformed',
    })
  })

  it('replays a form or a cut body as text, as it was received', () => {
    const form = replayFrom({
      ...base,
      method: 'POST',
      uri: '/playground/notes',
      requestHeaders: { 'content-type': 'application/x-www-form-urlencoded' },
      requestBody: 'message=hello&password=%5BREDACTED%5D',
    })
    expect(form).toMatchObject({
      bodyMode: 'text',
      body: 'message=hello&password=%5BREDACTED%5D',
      headers: [
        { name: 'content-type', value: 'application/x-www-form-urlencoded' },
      ],
    })
    const cut = replayFrom({
      ...base,
      method: 'POST',
      uri: '/api/orders',
      requestHeaders: { 'content-type': 'application/json' },
      requestBody: '{"items":["SKU-1',
      requestBodyTruncated: true,
    })
    expect(cut).toMatchObject({
      bodyMode: 'text',
      body: '{"items":["SKU-1',
      bodyTruncated: true,
    })
    const json = replayFrom({
      ...base,
      method: 'PUT',
      uri: '/api/customers/:id',
      requestHeaders: { 'content-type': 'application/json' },
      requestBody: '{"a":1}',
    })
    expect(json).toMatchObject({ bodyMode: 'json', body: '{\n  "a": 1\n}' })
  })

  it('keeps what the answer line needs of a capture', () => {
    expect(capturedSummary({ ...base, method: 'GET', uri: '/x' })).toEqual({
      id: base._id,
      status: 500,
      responseTimeMs: 12,
      slow: false,
    })
    expect(
      capturedSummary({
        ...base,
        method: 'GET',
        uri: '/x',
        responseTimeMs: 1814,
        slowThresholdMs: 1000,
      }).slow,
    ).toBe(true)
    expect(
      capturedSummary({
        ...base,
        method: 'GET',
        uri: '/x',
        responseTimeMs: null,
        slowThresholdMs: 0,
      }).slow,
    ).toBe(false)
  })
})
