import { describe, expect, it } from 'vitest'
import {
  displayName,
  formatDuration,
  formatShortDate,
  formatSignedDelta,
  initials,
  percentChangeTrend,
  utcDayStart,
} from '../app/utils/format'
import { sampleSizePerArm } from '../app/utils/sample-size'
import { normalizeFunnelStepPath } from '../app/utils/step-path'
import { trackerSnippet } from '../app/utils/snippet'

describe('formatting', () => {
  it('writes durations the way analytics tools do', () => {
    expect(formatDuration(8)).toBe('8s')
    expect(formatDuration(168)).toBe('2m 48s')
    expect(formatDuration(3720)).toBe('1h 2m')
  })

  it('signs deltas after rounding, so a tiny change reads as flat', () => {
    expect(formatSignedDelta(-2.34, 'points', 'en')).toBe('−2.3 pt')
    expect(formatSignedDelta(8, 'seconds', 'en')).toBe('+8s')
    expect(formatSignedDelta(0.04, 'number', 'en')).toBe('±0.0')
  })

  it('reads a change in percent that rounds to 0 % as flat', () => {
    expect(percentChangeTrend(0.3)).toBe('flat')
    expect(percentChangeTrend(-0.49)).toBe('flat')
    expect(percentChangeTrend(0)).toBe('flat')
    expect(percentChangeTrend(0.5)).toBe('up')
    expect(percentChangeTrend(-12)).toBe('down')
  })

  it('shows a pasted page step as the path the server matches', () => {
    expect(
      normalizeFunnelStepPath('https://shop.acme.test/Sale/Chairs/?utm=x'),
    ).toBe('/Sale/Chairs')
    expect(normalizeFunnelStepPath('/blog/*')).toBe('/blog/*')
    expect(normalizeFunnelStepPath('/')).toBe('/')
  })

  it('names websites by their initials', () => {
    expect(initials('Acme shop')).toBe('AS')
    expect(initials('docs')).toBe('DO')
  })

  it('builds initials from letters and digits only', () => {
    expect(initials('Acme — public site')).toBe('AP')
    expect(initials('shop.acme.test')).toBe('SA')
    expect(initials('— Acme')).toBe('AC')
    expect(initials('42 · store')).toBe('4S')
    expect(initials('Été à Liège')).toBe('ÉÀ')
    expect(initials('—')).toBe('?')
  })

  it('falls back to the raw code on a malformed region', () => {
    expect(displayName('FR', 'region', 'en')).toBe('France')
    expect(displayName('not a code!', 'region', 'en')).toBe('not a code!')
  })
})

describe('helpers', () => {
  it('asks for more sessions on a rarer conversion', () => {
    expect(sampleSizePerArm(0.03, 0.2)).toBeGreaterThan(
      sampleSizePerArm(0.3, 0.2),
    )
  })

  it('builds the tracker tag for every flavour', () => {
    const html = trackerSnippet('html', 'https://dms.example.com/', 'site-1')
    expect(html).toContain(
      'src="https://dms.example.com/api/marketing/tracker.js"',
    )
    expect(html).toContain('data-website-id="site-1"')
    expect(
      trackerSnippet('gtm', 'https://dms.example.com', 'site-1'),
    ).toContain('setAttribute("data-website-id", "site-1")')
    expect(
      trackerSnippet('nuxt', 'https://dms.example.com', 'site-1'),
    ).toContain('"data-website-id": "site-1"')
  })
})

describe('dates in the reader zone', () => {
  // 16 Oct 2026: Paris on summer time (UTC+2), New York on UTC-4.
  const now = Date.UTC(2026, 9, 16, 12)

  it('says when the statistics day starts on the reader clock, nothing at UTC', () => {
    expect(utcDayStart(now, 'en-GB', 'Europe/Paris')).toBe('02:00')
    expect(utcDayStart(now, 'en-GB', 'America/New_York')).toBe('20:00')
    expect(utcDayStart(now, 'en-GB', 'UTC')).toBe('')
  })

  it('writes a short date on the reader day, wherever the code runs', () => {
    const lateEvening = Date.UTC(2026, 9, 16, 2)
    expect(formatShortDate(lateEvening, 'en', 'Europe/Paris')).toBe('Oct 16')
    expect(formatShortDate(lateEvening, 'en', 'America/New_York')).toBe(
      'Oct 15',
    )
  })
})
