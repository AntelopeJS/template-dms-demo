import type { FunnelKind, FunnelStep } from '../types/mailing'

/** The step that leaks out of the funnel rather than going down it. */
export const FUNNEL_LEAK_STEP = 'unsubscribed'

export const FUNNEL_KINDS: FunnelKind[] = ['all', 'transactional', 'marketing']

/**
 * A step as `GET /metrics/funnel` answers it: `rate` is `null` on an empty
 * base, `isMeasured` false when nothing reports the events it counts.
 */
export interface FunnelStepReading extends Omit<FunnelStep, 'rate'> {
	rate: number | null
	isMeasured?: boolean
}

export interface FunnelDrop {
	from: FunnelStepReading
	to: FunnelStepReading
	/** Share of the sends lost between the two steps, in points. */
	points: number
}

/** What the card's footer says about the funnel. */
export type FunnelTakeaway = 'empty' | 'untracked' | 'no_loss' | 'drop'

const RATE_DECIMALS = 1
const PERCENT = 100
const ABSENT_RATE = '—'

/** `false` only when the backend says nothing reports the step's events. */
export const isMeasured = (step: FunnelStepReading): boolean =>
	step.isMeasured !== false

/**
 * The biggest fall between two consecutive steps of the funnel (the leak and
 * the unmeasured steps excluded), measured on the sends lost. `null` when
 * nothing was sent or no step loses anything.
 */
export function biggestDrop(steps: FunnelStepReading[]): FunnelDrop | null {
	const path = steps.filter(
		(step) => step.id !== FUNNEL_LEAK_STEP && isMeasured(step),
	)
	const total = path[0]?.count ?? 0
	if (!total) return null
	const drops = path.slice(1).map((step, index) => {
		const from = path[index] as FunnelStepReading
		return {
			from,
			to: step,
			points: ((from.count - step.count) / total) * PERCENT,
		}
	})
	return drops.reduce<FunnelDrop | null>(
		(best, drop) => (drop.points > (best?.points ?? 0) ? drop : best),
		null,
	)
}

/** Which sentence the footer writes: there may be no drop for three reasons. */
export function funnelTakeaway(steps: FunnelStepReading[]): FunnelTakeaway {
	if (!steps[0]?.count) return 'empty'
	if (biggestDrop(steps)) return 'drop'
	return steps.some((step) => !isMeasured(step)) ? 'untracked' : 'no_loss'
}

/** A funnel rate as the card prints it: one decimal, none when whole. */
export function formatRate(rate: number | null, locale: string): string {
	if (rate === null) return ABSENT_RATE
	return new Intl.NumberFormat(locale, {
		style: 'percent',
		maximumFractionDigits: RATE_DECIMALS,
	}).format(rate / PERCENT)
}
