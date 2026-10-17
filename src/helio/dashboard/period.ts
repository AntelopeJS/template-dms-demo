// The period a dashboard card is asked for, as the PeriodSelector sends it
// (`from` / `to` / `compareFrom` / `compareTo` as ISO instants, plus `preset`
// and `comparison`), and the time buckets the charts and sparklines draw.

import { DAY_MS } from "../shared/seed";

export interface TimeRange {
  from: number;
  to: number;
}

export interface PeriodQuery {
  from?: string;
  to?: string;
  compareFrom?: string;
  compareTo?: string;
}

export interface Period {
  range: TimeRange;
  /** The comparison range, or undefined when the reader compares nothing. */
  compare?: TimeRange;
}

// "All time" sends no bounds: the Helio seeds cover the last twelve months,
// so a thirteen-month window holds every record.
const ALL_TIME_DAYS = 395;
// How far back the seeds write activity: a comparison reaching before it
// compares with an empty or partial past (a year-over-year delta of +11 000 %),
// so it is dropped and the cards print no delta.
const HISTORY_DAYS = 365;
const SPARKLINE_POINTS = 12;
const DAILY_LIMIT_DAYS = 45;
const WEEKLY_LIMIT_DAYS = 210;

function instant(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

function rangeOf(from?: string, to?: string): TimeRange | undefined {
  const start = instant(from);
  const end = instant(to);
  if (start === undefined || end === undefined || end < start) return undefined;
  return { from: start, to: end };
}

// "This month" runs to the end of the month: the days still to come hold
// nothing yet, so the range stops now, and its comparison keeps the same
// length (the first days of last month, not all of it).
function clampToNow(
  range: TimeRange,
  compare: TimeRange | undefined,
  now: number,
) {
  if (range.to <= now || range.from > now) return { range, compare };
  const clamped = { from: range.from, to: now };
  return {
    range: clamped,
    compare: compare && {
      from: compare.from,
      to: Math.min(compare.to, compare.from + (now - range.from)),
    },
  };
}

export function readPeriod(query: PeriodQuery): Period {
  const now = Date.now();
  const asked = rangeOf(query.from, query.to) ?? {
    from: now - ALL_TIME_DAYS * DAY_MS,
    to: now,
  };
  const { range, compare } = clampToNow(
    asked,
    rangeOf(query.compareFrom, query.compareTo),
    now,
  );
  const covered = compare && compare.from >= now - HISTORY_DAYS * DAY_MS;
  return { range, compare: covered ? compare : undefined };
}

export function toTime(value: Date | string | undefined | null): number {
  if (!value) return Number.NaN;
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

export function within(
  value: Date | string | undefined | null,
  range: TimeRange,
): boolean {
  const time = toTime(value);
  return time >= range.from && time <= range.to;
}

/** The change in percent the cards print (12.5 → +12.5 %), or null. */
export function deltaPercent(
  current: number,
  previous: number | undefined,
): number | null {
  if (previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** `count` equal slices of a range, for the sparklines. */
export function slices(
  range: TimeRange,
  count = SPARKLINE_POINTS,
): TimeRange[] {
  const width = (range.to - range.from) / count;
  return Array.from({ length: count }, (_, index) => ({
    from: range.from + index * width,
    to: index === count - 1 ? range.to : range.from + (index + 1) * width - 1,
  }));
}

function monthBuckets(range: TimeRange): TimeRange[] {
  const buckets: TimeRange[] = [];
  const cursor = new Date(range.from);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= range.to) {
    const start = Math.max(cursor.getTime(), range.from);
    cursor.setMonth(cursor.getMonth() + 1);
    buckets.push({ from: start, to: Math.min(cursor.getTime() - 1, range.to) });
  }
  return buckets;
}

function stepBuckets(range: TimeRange, step: number): TimeRange[] {
  const buckets: TimeRange[] = [];
  for (let start = range.from; start <= range.to; start += step) {
    buckets.push({ from: start, to: Math.min(start + step - 1, range.to) });
  }
  return buckets;
}

/**
 * Chart buckets readable at the range's length: days up to six weeks, weeks
 * up to seven months, calendar months beyond.
 */
export function chartBuckets(range: TimeRange): TimeRange[] {
  const days = (range.to - range.from) / DAY_MS;
  if (days <= DAILY_LIMIT_DAYS) return stepBuckets(range, DAY_MS);
  if (days <= WEEKLY_LIMIT_DAYS) return stepBuckets(range, 7 * DAY_MS);
  return monthBuckets(range);
}

/** The same buckets moved onto the comparison range, start for start. */
export function shiftBuckets(
  buckets: TimeRange[],
  range: TimeRange,
  compare: TimeRange,
): TimeRange[] {
  const offset = compare.from - range.from;
  return buckets.map((bucket) => ({
    from: bucket.from + offset,
    to: bucket.to + offset,
  }));
}

/** A chart's x value for a bucket: its first day, as an ISO date. */
export function bucketLabel(bucket: TimeRange): string {
  const date = new Date(bucket.from);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Sums `amount` of the rows whose date falls in each range. Added up in
 * cents, so every card summing the same rows lands on the same euro once
 * rounded (floating-point euros drift by one around a half).
 */
export function sumByRange<T>(
  rows: readonly T[],
  ranges: readonly TimeRange[],
  dateOf: (row: T) => Date | string | undefined | null,
  amount: (row: T) => number,
): number[] {
  return ranges.map(
    (range) =>
      rows.reduce(
        (total, row) =>
          within(dateOf(row), range)
            ? total + Math.round(amount(row) * 100)
            : total,
        0,
      ) / 100,
  );
}

export function roundAmount(value: number): number {
  return Math.round(value);
}
