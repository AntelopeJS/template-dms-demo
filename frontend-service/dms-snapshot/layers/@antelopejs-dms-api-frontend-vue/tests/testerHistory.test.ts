import { beforeEach, describe, expect, it } from 'vitest'
import {
  type DraftRequest,
  exampleRequest,
  hasConfirmedWrite,
  type HistoryEntry,
  historyEntry,
  lastSuccessfulPathValues,
  loadCommonHeaders,
  loadDraft,
  loadHistory,
  lostSecrets,
  patchResult,
  rememberConfirmedWrite,
  sameRequest,
  saveCommonHeaders,
  saveDraft,
  saveHistory,
  secretNames,
} from '../app/utils/testerHistory'
import type { TesterResult } from '../app/utils/testerRequest'

function memoryStorage(store: Map<string, string>) {
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  }
}

const local = new Map<string, string>()
const session = new Map<string, string>()
Object.assign(globalThis, {
  window: {
    localStorage: memoryStorage(local),
    sessionStorage: memoryStorage(session),
  },
})

function request(overrides: Partial<DraftRequest> = {}): DraftRequest {
  return {
    bodyMode: 'json',
    body: '{}',
    form: [],
    headers: [
      { name: 'Authorization', value: 'Bearer secret' },
      { name: 'content-type', value: 'application/json' },
    ],
    query: [],
    pathValues: {},
    useSession: true,
    ...overrides,
  }
}

function result(overrides: Partial<TesterResult> = {}): TesterResult {
  return {
    status: 201,
    durationMs: 12,
    headers: {},
    body: 'x'.repeat(10_000),
    auth: 'manual',
    at: 1,
    ...overrides,
  }
}

function entry(at: number): HistoryEntry {
  return {
    at,
    method: 'POST',
    path: '/api/orders',
    request: request(),
    result: result({ at }),
  }
}

describe('tester history', () => {
  beforeEach(() => {
    local.clear()
    session.clear()
  })

  it('keeps 25 calls per route, without credentials, cutting bodies but not their size', () => {
    saveHistory(
      'POST /api/orders',
      Array.from({ length: 30 }, (_, index) => entry(index)),
    )
    const saved = loadHistory('POST /api/orders')
    expect(saved).toHaveLength(25)
    expect(saved[0].request.headers).toEqual([
      { name: 'content-type', value: 'application/json' },
    ])
    expect(saved[0].result.body.length).toBe(4096)
    expect(saved[0].result.bodySize).toBe(10_000)
    expect(saved[0].result.bodyTruncated).toBe(true)
  })

  it('ignores what it cannot read', () => {
    local.set('dmsApi.tester.history.GET /x', '{not json')
    expect(loadHistory('GET /x')).toEqual([])
    local.set(
      'dmsApi.tester.history.GET /y',
      JSON.stringify([{ at: 1, path: '/y', query: {}, result: {} }]),
    )
    expect(loadHistory('GET /y')).toEqual([])
  })

  it('says which credentials an entry left out', () => {
    const made = historyEntry('POST', '/api/orders', request(), result())
    expect(made.request.headers).toEqual([
      { name: 'content-type', value: 'application/json' },
    ])
    expect(made.secretsRemoved).toEqual(['Authorization'])
  })

  it('finds the path values of the last successful call', () => {
    const calls: HistoryEntry[] = [
      {
        ...entry(3),
        request: request({ pathValues: { id: 'TS-404' } }),
        result: result({ status: 404 }),
      },
      {
        ...entry(2),
        request: request({ pathValues: { id: '10477' } }),
        result: result({ status: 200 }),
      },
    ]
    expect(lastSuccessfulPathValues(calls, ['id'])).toEqual({ id: '10477' })
    expect(lastSuccessfulPathValues(calls, ['other'])).toEqual({})
    expect(lastSuccessfulPathValues(calls, [])).toEqual({})
  })

  it('keeps what the module captured with the call it belongs to', () => {
    const calls = [
      { ...entry(2), result: result({ at: 2, requestId: 'a' }) },
      { ...entry(1), result: result({ at: 1, requestId: 'b' }) },
    ]
    const captured = {
      id: 'log-a',
      status: 500,
      responseTimeMs: 9,
      slow: false,
    }
    const patched = patchResult(calls, 'a', { captured })
    expect(patched[0].result.captured).toEqual(captured)
    expect(patched[1]).toBe(calls[1])
  })

  it('says which credentials a restored call no longer holds', () => {
    expect(
      secretNames({ Authorization: 'x', accept: '*/*', Cookie: 'c' }),
    ).toEqual(['Authorization', 'Cookie'])
    const sent = ['Authorization', 'authorization', 'X-Api-Key']
    expect(lostSecrets(sent, [])).toEqual(['Authorization', 'X-Api-Key'])
    expect(
      lostSecrets(sent, [
        { name: 'AUTHORIZATION', value: 'Bearer x' },
        { name: 'x-api-key', value: '' },
      ]),
    ).toEqual(['X-Api-Key'])
  })
})

describe('tester drafts', () => {
  beforeEach(() => {
    local.clear()
    session.clear()
  })

  it('keeps a draft per route for the session, credentials in memory only', () => {
    saveDraft('POST /api/orders', {
      request: request({ body: '{"edited":true}' }),
      origin: 'edited',
      replay: null,
      result: result(),
    })
    const stored = session.get('dmsApi.tester.draft.POST /api/orders') ?? ''
    expect(stored).not.toContain('Bearer secret')
    const draft = loadDraft('POST /api/orders')
    expect(draft?.request.body).toBe('{"edited":true}')
    expect(draft?.request.headers).toContainEqual({
      name: 'Authorization',
      value: 'Bearer secret',
    })
    expect(draft?.result?.status).toBe(201)
    expect(loadDraft('GET /api/orders')).toBeNull()
    saveDraft('POST /api/orders', null)
    expect(loadDraft('POST /api/orders')).toBeNull()
  })

  it('tells an edited request from its starting point', () => {
    const start = request({ headers: [] })
    expect(
      sameRequest(start, { ...start, headers: [{ name: '', value: '' }] }),
    ).toBe(true)
    expect(sameRequest(start, { ...start, body: '{"a":1}' })).toBe(false)
    expect(
      sameRequest(
        { ...start, bodyMode: 'none', body: 'x' },
        { ...start, bodyMode: 'none', body: 'y' },
      ),
    ).toBe(true)
  })

  it('starts without a body for GET and DELETE, with the session only where auth is expected', () => {
    const history: HistoryEntry[] = [
      {
        ...entry(1),
        request: request({ pathValues: { id: '10477' } }),
        result: result({ status: 200 }),
      },
    ]
    const route = (
      method: string,
      authStatus: 'required' | 'probable' | 'unknown',
      exampleBody: unknown = null,
    ) => ({ method, pathParams: ['id'], exampleBody, authStatus })
    expect(exampleRequest(route('DELETE', 'required'), history)).toMatchObject({
      bodyMode: 'none',
      body: '',
      pathValues: { id: '10477' },
      useSession: true,
    })
    expect(exampleRequest(route('GET', 'probable'), [])).toMatchObject({
      bodyMode: 'none',
      body: '',
      useSession: true,
    })
    expect(
      exampleRequest(route('POST', 'unknown', { a: 1 }), []),
    ).toMatchObject({
      bodyMode: 'json',
      body: '{\n  "a": 1\n}',
      headers: [],
      useSession: false,
    })
    expect(exampleRequest(route('PATCH', 'unknown'), [])).toMatchObject({
      bodyMode: 'json',
      body: '',
      pathValues: { id: '' },
    })
  })

  it('falls back on the path of the route’s last successful call, decoded', () => {
    const route = {
      method: 'GET',
      pathParams: ['id'],
      exampleBody: null,
      examplePath: { id: 'commande-%C3%A9' },
      authStatus: 'unknown' as const,
    }
    expect(exampleRequest(route, []).pathValues).toEqual({ id: 'commande-é' })
    expect(
      exampleRequest(route, [
        {
          ...entry(1),
          request: request({ pathValues: { id: '10477' } }),
          result: result({ status: 204 }),
        },
      ]).pathValues,
    ).toEqual({ id: '10477' })
  })

  it('keeps the headers of every route in this browser, credentials until reload', () => {
    saveCommonHeaders([
      { name: 'x-env', value: 'qa' },
      { name: 'Cookie', value: 'sid=1' },
      { name: '', value: '' },
    ])
    expect(local.get('dmsApi.tester.commonHeaders')).toBe(
      JSON.stringify([{ name: 'x-env', value: 'qa' }]),
    )
    expect(loadCommonHeaders()).toEqual([
      { name: 'x-env', value: 'qa' },
      { name: 'Cookie', value: 'sid=1' },
    ])
  })

  it('remembers the routes a write was confirmed on, for the session', () => {
    expect(hasConfirmedWrite('POST /api/orders')).toBe(false)
    rememberConfirmedWrite('POST /api/orders')
    rememberConfirmedWrite('POST /api/orders')
    expect(hasConfirmedWrite('POST /api/orders')).toBe(true)
    expect(hasConfirmedWrite('PUT /api/orders/:id')).toBe(false)
    expect(session.get('dmsApi.tester.confirmedWrites')).toBe(
      JSON.stringify(['POST /api/orders']),
    )
  })
})
