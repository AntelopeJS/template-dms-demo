/**
 * Locale formatting shared by the module's blocks. Pure functions of their
 * inputs, so the blocks stay thin and the rules stay testable.
 */

import { fractionDigits } from '../constants'

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600
const MS_PER_SECOND = 1000
const INITIALS_LENGTH = 2

export function formatNumber(
  value: number,
  locale: string,
  digits = 0,
): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

/** "2m 48s", the way analytics tools write a visit length. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / SECONDS_PER_HOUR)
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const rest = total % SECONDS_PER_MINUTE
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`
}

/**
 * A change in percent under half a point rounds to "0 %": it reads as no
 * change, whatever its sign.
 */
const FLAT_PERCENT_CHANGE = 0.5

/** Which way a change in percent (+12.5 for +12.5 %) moved, flat when it rounds to 0 %. */
export function percentChangeTrend(delta: number): 'up' | 'down' | 'flat' {
  if (Math.abs(delta) < FLAT_PERCENT_CHANGE) {
    return 'flat'
  }
  return delta > 0 ? 'up' : 'down'
}

/** Signed difference with its unit: "+8s", "−2.3 pt", "+0.1". */
export function formatSignedDelta(
  value: number,
  unit: 'points' | 'seconds' | 'number' | 'percent',
  locale: string,
): string {
  const rounded = Number(value.toFixed(unit === 'seconds' ? 0 : 1))
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
  const magnitude = Math.abs(rounded)
  const formatters: Record<typeof unit, () => string> = {
    points: () => `${formatNumber(magnitude, locale, 1)} pt`,
    seconds: () => formatDuration(magnitude),
    number: () => formatNumber(magnitude, locale, 1),
    percent: () =>
      String(formatPercentage(magnitude / 100, locale, fractionDigits(1))),
  }
  return `${sign}${formatters[unit]()}`
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', SECONDS_PER_MINUTE],
  ['minute', SECONDS_PER_MINUTE],
  ['hour', 24],
  ['day', 30],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
]

/** "12 seconds ago", "4 minutes ago" — the age of the last event. */
export function formatRelativeTime(
  at: number,
  now: number,
  locale: string,
): string {
  let value = Math.round((at - now) / MS_PER_SECOND)
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(value) < size) {
      return format.format(value, unit)
    }
    value = Math.round(value / size)
  }
  return format.format(value, 'year')
}

/** "Aug 31 – Sep 29, 2026", the resolved range of the period. */
export function formatDateRange(from: Date, to: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).formatRange(from, to)
}

/**
 * When the statistics' day (a UTC day) starts on the reader's clock today,
 * "02:00"; empty where it starts at their midnight. `timeZone` is the
 * reader's (`undefined`: the zone the code runs in).
 */
export function utcDayStart(
  now: number,
  locale: string,
  timeZone?: string,
): string {
  const today = new Date(now)
  const utcMidnight = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )
  const clock = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
    timeZone,
  }).format(utcMidnight)
  if (clock === '0:00' || clock === '00:00') {
    return ''
  }
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(utcMidnight)
}

/** "Sep 29", in `timeZone` (`undefined`: the zone the code runs in). */
export function formatShortDate(
  at: number | Date,
  locale: string,
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone,
  }).format(at)
}

/**
 * "AS" for "Acme shop": the avatar of a website. Built from letters and
 * digits only, so a dash or a dot in the name never becomes an initial.
 */
export function initials(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const letters =
    words.length > 1
      ? words.slice(0, INITIALS_LENGTH).map((word) => [...word][0])
      : [...(words[0] ?? '?')].slice(0, INITIALS_LENGTH)
  return letters.join('').toUpperCase()
}

/** Region and language names, falling back to the raw code on a bad one. */
export function displayName(
  code: string,
  type: 'region' | 'language',
  locale: string,
): string {
  try {
    return new Intl.DisplayNames([locale], { type }).of(code) ?? code
  } catch {
    return code
  }
}
