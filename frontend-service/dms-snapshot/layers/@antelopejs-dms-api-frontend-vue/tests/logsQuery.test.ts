import { describe, expect, it } from 'vitest'
import {
  bodyLimit,
  clearedLogsFilters,
  hasLogsFilters,
  isAllTime,
  isRouteRef,
  linkedPeriod,
  logsEmptyCause,
  readLogsFilters,
  routeMethod,
  windowPreset,
  withLogsFilters,
  type LogsPeriod,
} from '../app/utils/logsQuery'

const lastDay: LogsPeriod = { preset: 'last-24h', range: null }
const allTime: LogsPeriod = { preset: 'all', range: null }
const incident = {
  from: new Date('2026-10-10T18:31:00.000Z'),
  to: new Date('2026-10-10T18:46:00.000Z'),
}
const customPeriod: LogsPeriod = { preset: 'custom', range: incident }

describe('readLogsFilters', () => {
  it('reads the filters a link or the page wrote', () => {
    expect(
      readLogsFilters({
        'api.period': 'last-24h',
        method: 'POST',
        slow: 'true',
        route: 'POST /webhooks/stripe',
        error: 'boom',
        from: 'overview',
      }),
    ).toEqual({
      method: 'POST',
      slow: true,
      route: 'POST /webhooks/stripe',
      path: undefined,
      error: 'boom',
      from: 'overview',
    })
  })

  it('leaves out what the table would not apply', () => {
    expect(
      readLogsFilters({
        method: 'post',
        slow: '1',
        from: 'x',
      }),
    ).toEqual({
      method: undefined,
      slow: false,
      route: undefined,
      path: undefined,
      error: undefined,
      from: undefined,
    })
  })

  it('takes the first of repeated values', () => {
    expect(readLogsFilters({ method: ['GET', 'POST'] }).method).toBe('GET')
  })
})

describe('the period', () => {
  it('tells "All time", a custom range and a preset apart', () => {
    expect(isAllTime(allTime)).toBe(true)
    expect(isAllTime(null)).toBe(false)
    expect(windowPreset(lastDay)).toBe('last-24h')
    expect(windowPreset(allTime)).toBeUndefined()
    expect(windowPreset(customPeriod)).toBeUndefined()
    expect(windowPreset(null)).toBeUndefined()
  })

  it('carries a preset on a link to the request logs, nothing else', () => {
    expect(linkedPeriod(lastDay)).toEqual({ 'api.period': 'last-24h' })
    expect(linkedPeriod(customPeriod)).toEqual({})
    expect(linkedPeriod(null)).toEqual({})
  })
})

describe('withLogsFilters', () => {
  it('sets and removes filters, keeping the rest of the query', () => {
    expect(
      withLogsFilters(
        {
          'requests.tab': '5xx',
          record: 'r1',
          'api.period': 'last-hour',
          method: 'GET',
        },
        { allTime: true, method: null, slow: true },
      ),
    ).toEqual({
      'requests.tab': '5xx',
      record: 'r1',
      'api.period': 'all',
      slow: 'true',
    })
  })

  it('forgets the origin once all time is asked for', () => {
    expect(
      withLogsFilters(
        { route: 'GET /a', 'api.period': 'last-24h', from: 'overview' },
        { allTime: true },
      ),
    ).toEqual({ route: 'GET /a', 'api.period': 'all' })
  })

  it('forgets the origin with the last linked filter', () => {
    expect(
      withLogsFilters(
        { route: 'GET /a', error: 'boom', from: 'routes' },
        { route: null },
      ),
    ).toEqual({ error: 'boom', from: 'routes' })
    expect(
      withLogsFilters({ error: 'boom', from: 'routes' }, { error: null }),
    ).toEqual({})
  })

  it('clears every filter, not the tab nor the period', () => {
    expect(
      clearedLogsFilters({
        'api.period': 'last-24h',
        method: 'GET',
        slow: 'true',
        route: 'GET /a',
        error: 'boom',
        from: 'overview',
        'requests.tab': '4xx',
      }),
    ).toEqual({ 'requests.tab': '4xx', 'api.period': 'last-24h' })
  })
})

describe('routeMethod', () => {
  it('reads the method a route reference fixes', () => {
    expect(routeMethod('post /webhooks/stripe')).toBe('POST')
    expect(routeMethod('garbage')).toBeUndefined()
    expect(routeMethod(undefined)).toBeUndefined()
  })
})

describe('logsEmptyCause', () => {
  const none = readLogsFilters({})

  it('names the most specific cause', () => {
    expect(logsEmptyCause('error', 'x', none, lastDay)).toBe('error')
    expect(
      logsEmptyCause(
        'filtered',
        'zzzz',
        readLogsFilters({ route: 'GET /a' }),
        lastDay,
      ),
    ).toBe('search')
    // The DMS says first run: the URL's filters are not its own.
    expect(
      logsEmptyCause(
        'firstRun',
        '',
        readLogsFilters({ route: 'GET /a' }),
        allTime,
      ),
    ).toBe('link')
    // A period frames the rows, the one the selector applies included.
    expect(logsEmptyCause('firstRun', ' ', none, lastDay)).toBe('filters')
    expect(logsEmptyCause('firstRun', undefined, none, allTime)).toBe(
      'first-run',
    )
  })
})

describe('bodyLimit', () => {
  it('does not round a small limit down to 0 KB', () => {
    expect(bodyLimit(0)).toEqual({ unit: 'none', amount: 0 })
    expect(bodyLimit(300)).toEqual({ unit: 'b', amount: 300 })
    expect(bodyLimit(65_536)).toEqual({ unit: 'kb', amount: 64 })
    expect(bodyLimit(1_536)).toEqual({ unit: 'kb', amount: 1.5 })
  })
})

describe('incident range', () => {
  const query = {
    route: 'GET /a',
    since: incident.from.toISOString(),
    until: incident.to.toISOString(),
    'api.period': 'last-7-days',
    from: 'overview',
    'requests.tab': '5xx',
  }

  it('reads a range from both bounds, as a linked filter', () => {
    expect(readLogsFilters(query).incident).toEqual(incident)
    expect(readLogsFilters({ since: query.since }).incident).toBeUndefined()
    expect(
      readLogsFilters({ since: 'soon', until: query.until }).incident,
    ).toBeUndefined()
  })

  it('removes the range alone, the period kept', () => {
    expect(withLogsFilters(query, { incident: null })).toEqual({
      route: 'GET /a',
      'api.period': 'last-7-days',
      from: 'overview',
      'requests.tab': '5xx',
    })
    expect(withLogsFilters(query, { allTime: true })).toEqual({
      route: 'GET /a',
      since: query.since,
      until: query.until,
      'api.period': 'all',
      'requests.tab': '5xx',
    })
  })

  it('clears with the other filters', () => {
    expect(clearedLogsFilters(query)).toEqual({
      'api.period': 'last-7-days',
      'requests.tab': '5xx',
    })
  })

  it('keeps the origin while the range alone is left', () => {
    expect(withLogsFilters(query, { route: null })).toMatchObject({
      since: query.since,
      from: 'overview',
    })
  })

  it('counts as a link filter for the empty state', () => {
    const filters = readLogsFilters(query)
    expect(logsEmptyCause('firstRun', '', filters, lastDay)).toBe('link')
    expect(hasLogsFilters(readLogsFilters({ ...query, route: '' }))).toBe(true)
  })
})

describe('the filters to clear', () => {
  it('leave the period out', () => {
    expect(hasLogsFilters(readLogsFilters({ 'api.period': 'all' }))).toBe(false)
    expect(hasLogsFilters(readLogsFilters({ slow: 'true' }))).toBe(true)
  })
})

describe('route chips', () => {
  it('tells a route reference from anything else', () => {
    expect(isRouteRef('GET /api/orders')).toBe(true)
    expect(isRouteRef('garbage')).toBe(false)
  })
})
