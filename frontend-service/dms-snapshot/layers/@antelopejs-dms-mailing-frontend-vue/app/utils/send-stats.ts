/** Past this latency the drawer shows the API call in red. */
export const SLOW_LATENCY_MS = 5000

const MS_PER_SECOND = 1000
const SECONDS_DECIMALS = 1

/** A latency as the log prints it: milliseconds, seconds past 5 s, a dash when unknown. */
export function formatLatency(
	ms: number | null | undefined,
	locale: string,
): string {
	if (ms === null || ms === undefined) return '—'
	if (ms < SLOW_LATENCY_MS)
		return `${new Intl.NumberFormat(locale).format(ms)} ms`
	const seconds = new Intl.NumberFormat(locale, {
		minimumFractionDigits: SECONDS_DECIMALS,
		maximumFractionDigits: SECONDS_DECIMALS,
	}).format(ms / MS_PER_SECOND)
	return `${seconds} s`
}

export function isSlowLatency(ms: number | null | undefined): boolean {
	return (ms ?? 0) >= SLOW_LATENCY_MS
}
