const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const PRESET_KEY_SEPARATOR = /-/g
const KEY_SEPARATOR = '_'

/** Hour and minute on a 24-hour clock, the way the cards stamp "updated 14:32". */
export const CLOCK_FORMAT: Intl.DateTimeFormatOptions = {
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
}

/** The i18n key of a preset's short segmented label ("24H", "7D"…). */
export function presetShortLabelKey(preset: string): string {
	return `dms_mailing.period.short.${preset.replace(PRESET_KEY_SEPARATOR, KEY_SEPARATOR)}`
}

/** Whole minutes elapsed since `iso`; 0 for a missing or future date. */
export function minutesSince(
	iso: string | null | undefined,
	now: Date,
): number {
	if (!iso) return 0
	const elapsed = now.getTime() - new Date(iso).getTime()
	return elapsed > 0 ? Math.floor(elapsed / MINUTE_MS) : 0
}

/** Whether `at` falls within the next 24 hours: "tonight" rather than a date. */
export function isWithinADay(at: Date | string, now: Date): boolean {
	const delay = new Date(at).getTime() - now.getTime()
	return delay >= 0 && delay < DAY_MS
}

/** Retention presets of the settings form, in days. */
export const RETENTION_PRESETS = [30, 90, 365]
export const RETENTION_CUSTOM = 'custom'
export const MIN_RETENTION_DAYS = 1
export const MAX_RETENTION_DAYS = 3650

export type RetentionChoice = string

/** The segment a retention shows: its preset, else "custom". */
export function retentionChoice(
	days: number | null | undefined,
): RetentionChoice {
	return days && RETENTION_PRESETS.includes(days)
		? String(days)
		: RETENTION_CUSTOM
}

/** A typed retention brought back between 1 day and 10 years, whole days. */
export function clampRetention(days: number): number {
	if (!Number.isFinite(days)) return MIN_RETENTION_DAYS
	return Math.min(
		MAX_RETENTION_DAYS,
		Math.max(MIN_RETENTION_DAYS, Math.round(days)),
	)
}
