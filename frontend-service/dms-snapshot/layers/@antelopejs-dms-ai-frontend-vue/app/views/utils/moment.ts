type DateTimeFormatter = (
	options: Intl.DateTimeFormatOptions,
) => Intl.DateTimeFormat;

export type Translate = (
	key: string,
	params?: Record<string, unknown>,
) => string;

export interface MomentOptions {
	format: DateTimeFormatter;
	t: Translate;
	nowMs: number;
	withSeconds?: boolean;
}

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const DAY_KEY_OPTIONS: Intl.DateTimeFormatOptions = {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
};
const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
	hour: "numeric",
	minute: "2-digit",
};
const TIME_WITH_SECONDS_OPTIONS: Intl.DateTimeFormatOptions = {
	...TIME_OPTIONS,
	second: "2-digit",
};
const WEEKDAY_OPTIONS: Intl.DateTimeFormatOptions = { weekday: "short" };
const SAME_YEAR_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
};
const OTHER_YEAR_OPTIONS: Intl.DateTimeFormatOptions = {
	...SAME_YEAR_OPTIONS,
	year: "numeric",
};
const YEAR_OPTIONS: Intl.DateTimeFormatOptions = { year: "numeric" };

function dayKey(ms: number, format: DateTimeFormatter): string {
	return format(DAY_KEY_OPTIONS).format(ms);
}

function daysAgo(ms: number, options: MomentOptions): number {
	const target = dayKey(ms, options.format);
	const offsets = Array.from({ length: WEEK_DAYS }, (_, days) => days);
	const match = offsets.find(
		(days) => dayKey(options.nowMs - days * DAY_MS, options.format) === target,
	);
	return match ?? WEEK_DAYS;
}

/** Only the clock part ("09:58"), for a moment already placed in its day. */
export function formatClock(ms: number, options: MomentOptions): string {
	const timeOptions = options.withSeconds
		? TIME_WITH_SECONDS_OPTIONS
		: TIME_OPTIONS;
	return options.format(timeOptions).format(ms);
}

function formatDay(ms: number, options: MomentOptions): string {
	const yearFormat = options.format(YEAR_OPTIONS);
	const isSameYear = yearFormat.format(ms) === yearFormat.format(options.nowMs);
	return options
		.format(isSameYear ? SAME_YEAR_OPTIONS : OTHER_YEAR_OPTIONS)
		.format(ms);
}

const RECENT_DAY_KEYS: Record<number, string> = {
	0: "dms_ai.views.moment.today",
	1: "dms_ai.views.moment.yesterday",
};

/**
 * A moment the way the mockup writes it: "Today 14:02", "Yesterday 09:51",
 * "Mon 17:20" within the week, then the day ("Sep 24"), in the user's
 * language, time zone and clock.
 */
export function formatMoment(ms: number, options: MomentOptions): string {
	const days = daysAgo(ms, options);
	const time = formatClock(ms, options);
	const recentKey = RECENT_DAY_KEYS[days];
	if (recentKey !== undefined) return options.t(recentKey, { time });
	if (days < WEEK_DAYS) {
		const weekday = options.format(WEEKDAY_OPTIONS).format(ms);
		return `${weekday} ${time}`;
	}
	return formatDay(ms, options);
}
