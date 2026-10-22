const MS_PER_SECOND = 1000
const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000
const BYTES_PER_KB = 1024
const SECONDS_DISPLAY_FROM_MS = 10_000
const PERCENT = 100
const DECIMAL_DISPLAY_BELOW = 10
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const DAYS_PER_WEEK = 7

/**
 * Makes the `Intl.DateTimeFormat` of a set of options. The blocks pass the
 * DMS's `useRegionalFormat({ locale: "format" }).dateTimeFormat`
 * (`useDateFormat`), so every date and time follows the user's Language &
 * region preferences: time zone, clock and date format.
 */
export type DateFormat = (
  options: Intl.DateTimeFormatOptions,
) => Intl.DateTimeFormat

/**
 * `make`, each format made once per set of options: a table writes the time
 * of each of its rows (2,000 after a few "Load more"), and making a format
 * costs far more than using one (about 0.15 ms a row). The options are
 * constants, so they key the cache as they are.
 */
export function cachedDateFormat(make: DateFormat): DateFormat {
  const formats = new WeakMap<Intl.DateTimeFormatOptions, Intl.DateTimeFormat>()
  return (options) => {
    let format = formats.get(options)
    if (!format) {
      format = make(options)
      formats.set(options, format)
    }
    return format
  }
}

const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
const CLOCK_TIME: Intl.DateTimeFormatOptions = { ...TIME, second: '2-digit' }
const CLOCK_TIME_MS: Intl.DateTimeFormatOptions = {
  ...CLOCK_TIME,
  fractionalSecondDigits: 3,
}
const SHORT_DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
const SHORT_DAY_YEAR: Intl.DateTimeFormatOptions = {
  ...SHORT_DAY,
  year: 'numeric',
}
const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: 'short' }
const FULL_DATE_TIME: Intl.DateTimeFormatOptions = {
  dateStyle: 'full',
  timeStyle: 'short',
}

const dayPartFormats = new Map<string, Intl.DateTimeFormat>()

/**
 * The calendar day a moment falls on in the time zone `format` writes in
 * (the user's), as a day count: two moments share a day when their numbers
 * are equal.
 */
function dayNumber(date: Date, format: DateFormat): number {
  const { timeZone } = format(TIME).resolvedOptions()
  let parts = dayPartFormats.get(timeZone)
  if (!parts) {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
    dayPartFormats.set(timeZone, parts)
  }
  const values = parts.formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(values.find((part) => part.type === type)?.value ?? 0)
  return Date.UTC(read('year'), read('month') - 1, read('day')) / MS_PER_DAY
}

/** Whole calendar days from `date` to `now`, in the user's time zone. */
export function daysBefore(date: Date, now: Date, format: DateFormat): number {
  return dayNumber(now, format) - dayNumber(date, format)
}

/** The year a moment falls in, in the user's time zone. */
function yearOf(date: Date, format: DateFormat): number {
  return new Date(dayNumber(date, format) * MS_PER_DAY).getUTCFullYear()
}

/** "yesterday", "hier": the day before, in the language `format` writes. */
function yesterday(format: DateFormat): string {
  const { locale } = format(TIME).resolvedOptions()
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
    -1,
    'day',
  )
}

const numberFormats = new Map<string, Intl.NumberFormat>()

/**
 * The locale's number format, made once: a table draws a count and a
 * duration in each of its thousands of cells, and making a format costs
 * far more than using one.
 */
function numberFormat(
  locale?: string,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${locale ?? ''}|${options ? JSON.stringify(options) : ''}`
  let format = numberFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(locale, options)
    numberFormats.set(key, format)
  }
  return format
}

/** A count, grouped the way the locale writes it. */
export function formatCount(value: number, locale?: string): string {
  return numberFormat(locale).format(Math.round(value))
}

/**
 * A duration in ms, as "48 ms", "1,840 ms" or "12.4 s"; "< 1 ms" under a
 * millisecond, which "0 ms" would read as no time at all.
 */
export function formatMs(value: number, locale?: string): string {
  if (value > 0 && value < 1) return `< ${formatCount(1, locale)} ms`
  if (value >= SECONDS_DISPLAY_FROM_MS) {
    return `${numberFormat(locale, { maximumFractionDigits: 1 }).format(value / MS_PER_SECOND)} s`
  }
  return `${formatCount(value, locale)} ms`
}

/**
 * A duration threshold (the slow threshold of the settings), the one way
 * every page writes it: "800 ms" under a second, "1 s", "1.5 s" from one.
 */
export function formatThreshold(ms: number, locale?: string): string {
  if (ms < MS_PER_SECOND) return `${formatCount(ms, locale)} ms`
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(ms / MS_PER_SECOND)} s`
}

/**
 * A share in percent (0–100), written the way the locale writes a percentage
 * ("11.4%" in English, "11,4 %" in French): one decimal, two under 1 % so a
 * small rate does not read as zero.
 */
export function formatPercent(value: number, locale?: string): string {
  const digits = value > 0 && value < 1 ? 2 : 1
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: digits,
  }).format(value / PERCENT)
}

/** A count that may have a decimal, such as a rate per minute: "4.2", "1,250". */
export function formatDecimal(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: Math.abs(value) < DECIMAL_DISPLAY_BELOW ? 1 : 0,
  }).format(value)
}

export function formatBytes(bytes: number, locale?: string): string {
  if (bytes < BYTES_PER_KB) return `${formatCount(bytes, locale)} B`
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / BYTES_PER_KB)} KB`
}

/**
 * The time of a request: "14:31:58.412" today, "28 Sept, 14:31:58" before.
 */
export function formatClock(
  value: string | number | Date | undefined,
  format: DateFormat,
  milliseconds = false,
  now: Date = new Date(),
): string {
  if (value === undefined || value === null) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const time = format(milliseconds ? CLOCK_TIME_MS : CLOCK_TIME).format(date)
  if (daysBefore(date, now, format) === 0) return time
  return `${format(SHORT_DAY).format(date)}, ${time}`
}

/**
 * A moment named from today: "17:33" today, "yesterday 17:33", "Mon 17:33"
 * within the week, "3 Oct, 17:33" before, with the year when it is not this
 * one. A bare "9 Oct, 17:33" beside a time of today reads as if it came after.
 */
export function formatRelativeDay(
  value: string | number | Date | undefined | null,
  format: DateFormat,
  now: Date = new Date(),
): string {
  if (value === undefined || value === null) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const time = format(TIME).format(date)
  const days = daysBefore(date, now, format)
  if (days === 0) return time
  if (days === 1) return `${yesterday(format)} ${time}`
  if (days > 1 && days < DAYS_PER_WEEK) {
    return `${format(WEEKDAY).format(date)} ${time}`
  }
  const sameYear = yearOf(date, format) === yearOf(now, format)
  const day = format(sameYear ? SHORT_DAY : SHORT_DAY_YEAR).format(date)
  return `${day}, ${time}`
}

/** The whole date and time, for a tooltip: "Friday 9 October 2026 at 17:33". */
export function formatFullDateTime(
  value: string | number | Date | undefined | null,
  format: DateFormat,
): string {
  if (value === undefined || value === null) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return format(FULL_DATE_TIME).format(date)
}

export type DurationUnit = 's' | 'min' | 'h' | 'd'

/**
 * A length of time in its two largest units, rounded down: "45 s",
 * "38 min", "2 h 5 min", "3 d 4 h". The caller words each part.
 */
export function durationParts(
  ms: number,
): Array<{ amount: number; unit: DurationUnit }> {
  const seconds = Math.max(0, Math.floor(ms / MS_PER_SECOND))
  if (seconds < SECONDS_PER_MINUTE) return [{ amount: seconds, unit: 's' }]
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  if (minutes < MINUTES_PER_HOUR) return [{ amount: minutes, unit: 'min' }]
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  const parts: Array<{ amount: number; unit: DurationUnit }> =
    hours < HOURS_PER_DAY
      ? [
          { amount: hours, unit: 'h' },
          { amount: minutes % MINUTES_PER_HOUR, unit: 'min' },
        ]
      : [
          { amount: Math.floor(hours / HOURS_PER_DAY), unit: 'd' },
          { amount: hours % HOURS_PER_DAY, unit: 'h' },
        ]
  return parts.filter((part, index) => index === 0 || part.amount > 0)
}

/**
 * The length of a window in one unit, the way a card names it: "15 min",
 * "24 h", "7 d". Hours up to two days, so the last day reads "24 h".
 */
export function spanPart(ms: number): { amount: number; unit: DurationUnit } {
  const minutes = Math.round(ms / MS_PER_MINUTE)
  if (minutes < MINUTES_PER_HOUR) return { amount: minutes, unit: 'min' }
  const hours = Math.round(minutes / MINUTES_PER_HOUR)
  if (hours <= 2 * HOURS_PER_DAY) return { amount: hours, unit: 'h' }
  return { amount: Math.round(hours / HOURS_PER_DAY), unit: 'd' }
}

/** Pretty JSON when the text parses, the text itself otherwise. */
export function prettyBody(text: string | undefined | null): {
  text: string
  json: boolean
} {
  if (!text) return { text: '', json: false }
  try {
    return { text: JSON.stringify(JSON.parse(text), null, 2), json: true }
  } catch {
    return { text, json: false }
  }
}

/** UTF-8 size of a text, in bytes. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}
