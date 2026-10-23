// When an invoice is late, counted in calendar days of the office's time zone:
// an invoice due today is still on time until midnight, and becomes one day
// late the morning after, whatever hour its due date was stamped with.

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Whole calendar days from `dueAt` to `now`: 0 on the due day itself. */
export function daysLate(dueAt: Date, now = Date.now()): number {
  const from = new Date(startOfDay(dueAt.getTime()));
  const to = new Date(startOfDay(now));
  // Calendar dates, not 24-hour spans: a daylight-saving night is still a day.
  const utc = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utc(to) - utc(from)) / (24 * 60 * 60 * 1000));
}

/** Whether the due date is over: from the day after it. */
export function isPastDue(dueAt: Date, now = Date.now()): boolean {
  return daysLate(dueAt, now) >= 1;
}
