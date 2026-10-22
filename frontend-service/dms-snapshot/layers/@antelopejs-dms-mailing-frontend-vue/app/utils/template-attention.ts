import type {
	TemplateRow,
	TemplateStats,
	TemplateStatus,
	VariableDefinition,
} from '../types/mailing'
import { readPath } from './paths'

const MS_PER_DAY = 86_400_000

export type AttentionReason = 'stale_draft' | 'never_sent' | 'missing_locale'

/** How the row's `attention` field separates its reasons. */
const REASON_SEPARATOR = ','

/** Why the server says a template needs a look, read off its row. */
export function attentionReasons(row: TemplateRow): AttentionReason[] {
	return row.attention
		.split(REASON_SEPARATOR)
		.filter(Boolean) as AttentionReason[]
}

/** Whole days between `date` and `now`; 0 for an unreadable date. */
export function daysSince(date: string | null | undefined, now: Date): number {
	const time = date ? new Date(date).getTime() : Number.NaN
	if (Number.isNaN(time)) return 0
	return Math.max(0, Math.floor((now.getTime() - time) / MS_PER_DAY))
}

export type CardFooterKind = 'stats' | 'edited' | 'no_send'

/** Which line a card's footer reads, with the figures it needs. */
export interface CardFooter {
	kind: CardFooterKind
	sends: number
	openRate: number
	/** The date the line names: last edit, or the day it went live. */
	at: string
	by: string
}

/**
 * The footer of a gallery card: the 30-day figures once real sends exist,
 * otherwise who last edited a draft, or since when a live template waits for
 * its first send.
 */
export function cardFooter(
	row: TemplateRow,
	stats?: TemplateStats,
): CardFooter {
	const base = {
		sends: stats?.sends ?? 0,
		openRate: stats?.openRate ?? 0,
		at: row.updatedAt,
		by: row.updatedBy,
	}
	if (base.sends > 0) return { ...base, kind: 'stats' }
	if (row.status === 'live') {
		return { ...base, kind: 'no_send', at: row.publishedAt || row.updatedAt }
	}
	return { ...base, kind: 'edited' }
}

export type LifecycleAction = 'publish' | 'unpublish' | 'archive' | 'restore'

type TransitionRule = (row: TemplateRow) => LifecycleAction[]

/**
 * The backend refuses any other move with `409 invalid_transition`. On a live
 * template, publishing only makes sense when a draft waits.
 */
const TRANSITIONS: Record<TemplateStatus, TransitionRule> = {
	draft: () => ['publish', 'archive'],
	live: (row) =>
		row.isDraftPending
			? ['publish', 'unpublish', 'archive']
			: ['unpublish', 'archive'],
	archived: () => ['restore'],
}

/** The lifecycle moves a template accepts from its current status. */
export function validTransitions(row: TemplateRow): LifecycleAction[] {
	return TRANSITIONS[row.status]?.(row) ?? []
}

const isFilled = (value: unknown) =>
	value !== undefined && value !== null && value !== ''

/**
 * Whether the variables are ready for a real send: every path the content
 * uses is declared, and every required one has a test value.
 */
export function variablesCovered(
	declared: VariableDefinition[],
	detected: string[],
	testData: Record<string, unknown>,
): boolean {
	const declaredPaths = new Set(declared.map((entry) => entry.path))
	const everyUsedDeclared = detected.every((path) => declaredPaths.has(path))
	const everyRequiredFilled = declared
		.filter((entry) => entry.required)
		.every((entry) => isFilled(readPath(testData, entry.path)))
	return everyUsedDeclared && everyRequiredFilled
}
