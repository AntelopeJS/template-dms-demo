import { describe, expect, it } from 'vitest'
import {
  bodyOmission,
  durationScale,
  isRequestId,
  originalBodySize,
  requestClock,
  requestPivots,
  requestUrl,
  thresholdRatio,
  withParam,
} from '../app/utils/requestDrawer'
import { cachedDateFormat } from '../app/utils/format'

const formatIn = (locale: string) =>
  cachedDateFormat((options) => new Intl.DateTimeFormat(locale, options))

describe('reading a request', () => {
  it('names the URL a request went to', () => {
    expect(
      requestUrl('https://api.test', '/orders', { status: ['a', 'b'], q: 'é' }),
    ).toBe('https://api.test/orders?status=a&status=b&q=%C3%A9')
    expect(requestUrl('', '/orders', undefined)).toBe('/orders')
  })

  it('writes the day only once it is not today', () => {
    const now = new Date(2026, 9, 10, 18, 0, 0)
    expect(
      requestClock(
        new Date(2026, 9, 10, 17, 2, 28),
        formatIn('en-GB'),
        false,
        now,
      ),
    ).toBe('17:02:28')
    expect(
      requestClock(
        new Date(2026, 9, 9, 23, 42, 10),
        formatIn('en-GB'),
        false,
        now,
      ),
    ).toBe('Yesterday, 23:42:10')
    expect(
      requestClock(
        new Date(2026, 9, 9, 23, 42, 10),
        formatIn('fr-FR'),
        false,
        now,
      ),
    ).toBe('Hier, 23:42:10')
    expect(
      requestClock(
        new Date(2026, 9, 8, 12, 0, 0),
        formatIn('en-GB'),
        false,
        now,
      ),
    ).toBe('8 Oct, 12:00:00')
  })

  it('scales a duration against the slow threshold', () => {
    expect(durationScale(500, 1000)).toEqual({
      share: 25,
      threshold: 50,
      ratio: 0.5,
      slow: false,
      max: 2000,
    })
    const slow = durationScale(6886, 1000)
    expect(slow.slow).toBe(true)
    expect(slow.share).toBe(100)
    expect(slow.threshold).toBeCloseTo(14.5, 1)
    expect(slow.ratio).toBeCloseTo(6.886)
    expect(durationScale(1010, 1000).share).toBeCloseTo(50.5)
  })

  it('knows why a body is missing and how big it was', () => {
    expect(bodyOmission('too-large')).toBe('too-large')
    expect(bodyOmission('something')).toBeNull()
    expect(bodyOmission(null)).toBeNull()
    expect(originalBodySize(65_536, true, 184_051, {})).toBe(184_051)
    expect(
      originalBodySize(65_536, true, undefined, { 'Content-Length': '184051' }),
    ).toBe(184_051)
    expect(
      originalBodySize(11, true, undefined, { 'content-length': '11' }),
    ).toBeUndefined()
  })

  it('compares a whole body to nothing: masking changed its length only', () => {
    // 5 values masked: 249 bytes stored of the 260 sent, nothing cut.
    expect(
      originalBodySize(249, false, null, { 'content-length': '260' }),
    ).toBeUndefined()
    expect(originalBodySize(249, undefined, 260, {})).toBeUndefined()
  })

  it('writes a ratio to the threshold that never reads as zero', () => {
    expect(thresholdRatio(2.189, 'en-GB')).toBe('2.2')
    expect(thresholdRatio(0.4, 'fr-FR')).toBe('0,4')
    expect(thresholdRatio(0.036, 'en-GB')).toBe('< 0.1')
    expect(thresholdRatio(0.036, 'fr-FR')).toBe('< 0,1')
    expect(thresholdRatio(0, 'en-GB')).toBe('< 0.1')
  })

  it('names a body never read by a handler', () => {
    expect(bodyOmission('not-read')).toBe('not-read')
  })

  it('tells a request id from what a link may hold', () => {
    expect(isRequestId('0359c490-1b2c-4d5e-8f90-123456789abc')).toBe(true)
    expect(isRequestId('<script>/../settings')).toBe(false)
  })

  describe('the lists a request leads to', () => {
    const log = {
      rawPath: '/api/orders',
      routeRegistered: true,
      responseTimeMs: 36,
      slowThresholdMs: 1000,
      links: { sameRoute: '/modules/api/logs?route=POST+%2Fapi%2Forders' },
    }

    it('leads a request no route matched to its path, not to an empty route list', () => {
      expect(
        requestPivots({
          ...log,
          rawPath: '/nope/qa-rd-notread',
          routeRegistered: false,
          responseTimeMs: null,
          links: {
            sameRoute: '/modules/api/logs?route=POST+%2Fnope%2Fqa-rd-notread',
            samePath: '/modules/api/logs?path=%2Fnope%2Fqa-rd-notread',
          },
        }),
      ).toEqual([
        {
          kind: 'same_path',
          to: '/modules/api/logs?path=%2Fnope%2Fqa-rd-notread',
        },
      ])
    })

    it('offers slow requests once the route has some', () => {
      const kinds = (value: Parameters<typeof requestPivots>[0]) =>
        requestPivots(value).map((pivot) => pivot.kind)
      const latency = { windowDays: 7, p50: 40, p95: 900 }
      // Without the route's figures: the request itself tells.
      expect(kinds(log)).toEqual(['same_route'])
      expect(kinds({ ...log, responseTimeMs: 2189 })).toEqual([
        'same_route',
        'slow_route',
      ])
      expect(kinds({ ...log, routeLatency: { ...latency, slow: 0 } })).toEqual([
        'same_route',
      ])
      expect(
        requestPivots({ ...log, routeLatency: { ...latency, slow: 3 } })[1],
      ).toEqual({
        kind: 'slow_route',
        to: '/modules/api/logs?route=POST+%2Fapi%2Forders&slow=true',
      })
      expect(
        kinds({
          ...log,
          rawPath: '/api/orders/42',
          links: { ...log.links, samePath: '/modules/api/logs?path=x' },
        }),
      ).toEqual(['same_route', 'same_path'])
    })
  })

  it('adds a parameter to a link', () => {
    expect(
      withParam('/modules/api/logs?route=GET+%2Forders', 'slow', 'true'),
    ).toBe('/modules/api/logs?route=GET+%2Forders&slow=true')
  })
})
