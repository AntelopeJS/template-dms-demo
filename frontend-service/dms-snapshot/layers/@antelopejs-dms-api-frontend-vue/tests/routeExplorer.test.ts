import { beforeEach, describe, expect, it } from 'vitest'
import {
  bySeverity,
  type ExplorerRoute,
  groupRoutes,
  initialRoute,
  lastRoute,
  listedFolders,
  listedMessages,
  needsAttention,
  optionId,
  rememberRoute,
  type RouteState,
  stepFrom,
  windowParts,
} from '../app/utils/routeExplorer'

function route(
  method: string,
  path: string,
  folder: string,
  state: RouteState = 'healthy',
  requests = 10,
): ExplorerRoute {
  return { ref: `${method} ${path}`, method, path, folder, state, requests }
}

const ROUTES = [
  route('GET', '/api/orders', '/api/orders'),
  route('POST', '/api/orders', '/api/orders', 'failing', 40),
  route('GET', '/api/orders/:id', '/api/orders', 'client-errors', 90),
  route('POST', '/auth/2fa/verify', '/auth/2fa', 'slow', 5),
  route('POST', '/auth/login', '/auth/login', 'idle', 0),
  route('GET', '/auth/me', '/auth/me', 'recovered', 3),
  route('GET', '/health', '/health'),
]

describe('route list', () => {
  it('folds a folder of a single route into its first segment', () => {
    const folders = listedFolders(ROUTES)
    expect(folders.get('POST /auth/2fa/verify')).toBe('/auth')
    expect(folders.get('POST /auth/login')).toBe('/auth')
    expect(folders.get('GET /api/orders/:id')).toBe('/api/orders')
    // A top-level folder has nowhere to fold into.
    expect(folders.get('GET /health')).toBe('/health')
  })

  it('groups by listed folder, folders and routes by path', () => {
    const groups = groupRoutes(ROUTES, listedFolders(ROUTES))
    expect(groups.map((group) => group.path)).toEqual([
      '/api/orders',
      '/auth',
      '/health',
    ])
    expect(groups[1]!.routes.map((entry) => entry.ref)).toEqual([
      'POST /auth/2fa/verify',
      'POST /auth/login',
      'GET /auth/me',
    ])
    expect(groups[0]!.worst).toBe('failing')
    expect(groups[1]!.worst).toBe('slow')
    expect(groups[2]!.worst).toBe('healthy')
  })

  it('keeps a route in its folder whatever the filter', () => {
    const folders = listedFolders(ROUTES)
    const groups = groupRoutes(
      ROUTES.filter((entry) => entry.ref === 'POST /auth/login'),
      folders,
    )
    expect(groups.map((group) => group.path)).toEqual(['/auth'])
  })

  it('lists the routes the Overview says need attention', () => {
    expect(ROUTES.filter(needsAttention).map((entry) => entry.state)).toEqual([
      'failing',
      'client-errors',
      'slow',
      'recovered',
    ])
  })

  it('sorts worst first, then by traffic', () => {
    const sorted = bySeverity([
      route('GET', '/a', '/a', 'slow', 1),
      route('GET', '/b', '/b', 'failing', 2),
      route('GET', '/c', '/c', 'failing', 50),
      route('GET', '/d', '/d', 'client-errors', 9),
      route('GET', '/e', '/e', 'recovered', 9),
      route('GET', '/f', '/f', 'idle', 0),
    ])
    expect(sorted.map((entry) => entry.path)).toEqual([
      '/c',
      '/b',
      '/a',
      '/d',
      '/e',
      '/f',
    ])
  })
})

describe('keyboard', () => {
  const items = ROUTES.slice(0, 3)

  it('steps from the route last asked for', () => {
    expect(stepFrom(items, 'GET /api/orders', 1)?.ref).toBe('POST /api/orders')
    expect(stepFrom(items, 'POST /api/orders', 1)?.ref).toBe(
      'GET /api/orders/:id',
    )
  })

  it('stops at both ends', () => {
    expect(stepFrom(items, 'GET /api/orders/:id', 1)?.ref).toBe(
      'GET /api/orders/:id',
    )
    expect(stepFrom(items, 'GET /api/orders', -1)?.ref).toBe('GET /api/orders')
    expect(stepFrom(items, 'POST /api/orders', -items.length)?.ref).toBe(
      'GET /api/orders',
    )
  })

  it('enters the list from either end when nothing listed is active', () => {
    expect(stepFrom(items, null, 1)?.ref).toBe('GET /api/orders')
    expect(stepFrom(items, 'GET /elsewhere', -1)?.ref).toBe(
      'GET /api/orders/:id',
    )
    expect(stepFrom([], null, 1)).toBeUndefined()
  })

  it('names options with ids an aria reference can hold', () => {
    expect(optionId(12)).toBe('api-route-option-12')
  })
})

describe('opening the page', () => {
  it('reopens the last route looked at while it is listed', () => {
    expect(initialRoute(ROUTES, 'GET /health')?.ref).toBe('GET /health')
  })

  it('falls back to the route needing a look first', () => {
    expect(initialRoute(ROUTES, 'GET /gone')?.ref).toBe('POST /api/orders')
    expect(initialRoute(ROUTES, null)?.ref).toBe('POST /api/orders')
  })

  describe('memory of the last route', () => {
    const store = new Map<string, string>()
    beforeEach(() => {
      store.clear()
      Object.assign(globalThis, {
        window: {
          sessionStorage: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => store.set(key, value),
          },
        },
      })
    })

    it('keeps the last route for the tab', () => {
      expect(lastRoute()).toBeNull()
      rememberRoute('GET /health')
      expect(lastRoute()).toBe('GET /health')
    })

    it('does without when storage is blocked', () => {
      Object.assign(globalThis, {
        window: {
          get sessionStorage(): Storage {
            throw new Error('blocked')
          },
        },
      })
      expect(() => rememberRoute('GET /health')).not.toThrow()
      expect(lastRoute()).toBeNull()
    })
  })
})

describe('periods', () => {
  it('writes a health window in its largest whole unit', () => {
    expect(windowParts(15)).toEqual({ unit: 'min', amount: 15 })
    expect(windowParts(90)).toEqual({ unit: 'min', amount: 90 })
    expect(windowParts(60)).toEqual({ unit: 'h', amount: 1 })
    expect(windowParts(1440)).toEqual({ unit: 'h', amount: 24 })
    expect(windowParts(10080)).toEqual({ unit: 'd', amount: 7 })
  })
})

describe('listedMessages', () => {
  it('lists each message with its own count and counts the ones left out', () => {
    const messages = [
      { message: 'Order 10311 not found', count: 97 },
      { message: 'Order 10312 not found', count: 80 },
      { message: 'Order 10313 not found', count: 41 },
    ]
    expect(listedMessages({ messages, messageCount: 12 }, 2)).toEqual({
      messages: messages.slice(0, 2),
      more: 10,
    })
    expect(listedMessages({ messages, messageCount: 3 }, 5)).toEqual({
      messages,
      more: 0,
    })
  })
})
