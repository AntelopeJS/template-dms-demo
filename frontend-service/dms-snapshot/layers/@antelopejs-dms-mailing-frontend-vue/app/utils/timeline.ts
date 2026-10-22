import type { SendEventRow, SendRow, SendStatus } from '../types/mailing'
import { isSuppressedStatus, SUPPRESSED_STATUS } from './suppression'

export type TimelineTone =
	'neutral' | 'success' | 'primary' | 'error' | 'warning'

export interface TimelineMeta {
	icon: string
	tone: TimelineTone
}

export interface TimelineItem {
	id: string
	type: SendStatus
	icon: string
	tone: TimelineTone
	/** i18n key of the step's title. */
	titleKey: string
	titleParams: Record<string, string>
	/** One line under the title: a raw SMTP answer, a message id, a URL… */
	detail: string
	/** Whether `detail` is a machine value, shown in mono. */
	isDetailMono: boolean
	/** `null` for a step still to come. */
	at: string | null
	/** A step that has not happened yet, drawn ghosted. */
	isPending: boolean
}

export interface TimelineSend extends Pick<
	SendRow,
	'_id' | 'status' | 'createdAt' | 'provider' | 'providerMessageId' | 'error'
> {
	isSoftBounce?: boolean
}

/** What the provider reports by itself; `null` while it is unknown. */
export interface TimelineTracking {
	openTracking: boolean
	clickTracking: boolean
}

export const TIMELINE_META: Record<SendStatus, TimelineMeta> = {
	queued: { icon: 'i-ph-clock', tone: 'neutral' },
	sent: { icon: 'i-ph-paper-plane-tilt', tone: 'primary' },
	delivered: { icon: 'i-ph-check', tone: 'success' },
	opened: { icon: 'i-ph-eye', tone: 'primary' },
	clicked: { icon: 'i-ph-cursor-click', tone: 'primary' },
	bounced: { icon: 'i-ph-warning', tone: 'error' },
	spam: { icon: 'i-ph-prohibit', tone: 'warning' },
	failed: { icon: 'i-ph-warning', tone: 'error' },
	unsubscribed: { icon: 'i-ph-user-minus', tone: 'warning' },
	suppressed: { icon: 'i-ph-prohibit', tone: 'neutral' },
}

/** The happy path a send walks; pending steps are drawn from it. */
const HAPPY_PATH: SendStatus[] = ['queued', 'sent', 'delivered', 'opened']
/** A provider that reports no open stops the path at the delivery. */
const DELIVERY_PATH: SendStatus[] = ['queued', 'sent', 'delivered']
/** A provider that reports nothing (SMTP) stops it once the e-mail left. */
const HANDOFF_PATH: SendStatus[] = ['queued', 'sent']

/** Statuses after which nothing more is waited for. */
const TERMINAL_STATUSES: SendStatus[] = [
	'bounced',
	'spam',
	'failed',
	'unsubscribed',
	SUPPRESSED_STATUS,
]

const SOFT_BOUNCE_TYPE = /soft|transient|temporary/i
const HARD_BOUNCE_TYPE = /hard|permanent/i
const SOFT_SMTP_ANSWER = /^\s*4\d\d\b|\b4\.\d{1,3}\.\d{1,3}\b/

const TITLE_KEY_PREFIX = 'dms_mailing.sends.timeline.'

/** Detail keys read off an event, in order; the first present one is shown. */
const DETAIL_KEYS = ['reason', 'smtp', 'code', 'url', 'userAgent', 'client']
const MONO_DETAIL_KEYS = new Set(['reason', 'smtp', 'code', 'url'])

type EventDetails = Record<string, unknown>

interface Detail {
	text: string
	isMono: boolean
}

const NO_DETAIL: Detail = { text: '', isMono: false }

/** Steps whose reason the drawer tells in a banner, not as a raw detail. */
const WORDED_ELSEWHERE = new Set<SendStatus>([SUPPRESSED_STATUS])

function parseDetails(raw: string): EventDetails {
	try {
		const parsed: unknown = raw ? JSON.parse(raw) : {}
		return typeof parsed === 'object' && parsed !== null
			? (parsed as EventDetails)
			: {}
	} catch {
		return {}
	}
}

function eventDetail(details: EventDetails): Detail {
	const key = DETAIL_KEYS.find((candidate) => details[candidate])
	if (!key) return NO_DETAIL
	return { text: String(details[key]), isMono: MONO_DETAIL_KEYS.has(key) }
}

/** What a step says beyond its event: the message id, the raw error. */
const SEND_DETAILS: Partial<
	Record<SendStatus, (send: TimelineSend) => Detail>
> = {
	sent: (send) => ({ text: send.providerMessageId ?? '', isMono: true }),
	bounced: (send) => ({ text: send.error ?? '', isMono: true }),
	failed: (send) => ({ text: send.error ?? '', isMono: true }),
}

/** Steps whose title names the provider when the send knows it. */
const PROVIDER_TITLE_KEYS: Partial<Record<SendStatus, string>> = {
	sent: `${TITLE_KEY_PREFIX}sent_to`,
}

interface StepTitle {
	titleKey: string
	titleParams: Record<string, string>
}

const textOf = (value: unknown): string =>
	typeof value === 'string' ? value : ''

/**
 * Whether a bounce event was temporary: the provider's `bounceType` when it
 * gives one, else the SMTP answer's class, else what the send recorded.
 */
export function isSoftBounceEvent(
	details: EventDetails,
	send: TimelineSend,
): boolean {
	const bounceType = textOf(details.bounceType)
	if (SOFT_BOUNCE_TYPE.test(bounceType)) return true
	if (HARD_BOUNCE_TYPE.test(bounceType)) return false
	const reason = textOf(details.reason)
	return reason ? SOFT_SMTP_ANSWER.test(reason) : !!send.isSoftBounce
}

/** Event titles that depend on what the event says. */
const EVENT_TITLE_KEYS: Partial<
	Record<SendStatus, (details: EventDetails, send: TimelineSend) => string>
> = {
	bounced: (details, send) =>
		`${TITLE_KEY_PREFIX}${isSoftBounceEvent(details, send) ? 'soft_bounce' : 'bounced'}`,
}

function titleOf(
	type: SendStatus,
	send: TimelineSend,
	details: EventDetails = {},
): StepTitle {
	const providerKey = PROVIDER_TITLE_KEYS[type]
	if (providerKey && send.provider)
		return { titleKey: providerKey, titleParams: { provider: send.provider } }
	const eventKey = EVENT_TITLE_KEYS[type]?.(details, send)
	return { titleKey: eventKey ?? `${TITLE_KEY_PREFIX}${type}`, titleParams: {} }
}

interface StepInput {
	id: string
	type: SendStatus
	at: string | null
	detail: Detail
	details?: EventDetails
}

function stepOf(input: StepInput, send: TimelineSend): TimelineItem {
	return {
		id: input.id,
		type: input.type,
		at: input.at,
		...TIMELINE_META[input.type],
		...titleOf(input.type, send, input.details),
		detail: input.detail.text,
		isDetailMono: input.detail.isMono,
		isPending: input.at === null,
	}
}

function happenedSteps(
	events: SendEventRow[],
	send: TimelineSend,
): TimelineItem[] {
	return [...events]
		.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
		.map((event) => {
			const details = parseDetails(event.json_details)
			const fromEvent = WORDED_ELSEWHERE.has(event.type)
				? NO_DETAIL
				: eventDetail(details)
			const fromSend = SEND_DETAILS[event.type]?.(send) ?? NO_DETAIL
			const detail = fromEvent.text ? fromEvent : fromSend
			return stepOf(
				{ id: event._id, type: event.type, at: event.at, detail, details },
				send,
			)
		})
}

/** The steps a send can still be seen walking with this provider. */
function trackedPath(tracking: TimelineTracking | null): SendStatus[] {
	if (!tracking || tracking.openTracking) return HAPPY_PATH
	return tracking.clickTracking ? DELIVERY_PATH : HANDOFF_PATH
}

function pendingSteps(
	send: TimelineSend,
	reached: SendStatus[],
	tracking: TimelineTracking | null,
): TimelineItem[] {
	const isOver = [send.status, ...reached].some((type) =>
		TERMINAL_STATUSES.includes(type),
	)
	if (isOver) return []
	const path = trackedPath(tracking)
	const furthest = Math.max(
		...reached.map((type) => path.indexOf(type as SendStatus)),
		path.indexOf(send.status),
	)
	if (furthest < 0) return []
	return path
		.slice(furthest + 1)
		.map((type) =>
			stepOf(
				{ id: `pending-${type}`, type, at: null, detail: NO_DETAIL },
				send,
			),
		)
}

/**
 * The steps of a send, oldest first: when it was queued (the send's own date
 * unless an event says so), every recorded event with the detail worth
 * reading (the raw SMTP answer, the provider's message id), then the steps of
 * the happy path still to come, ghosted. A problem or an unsubscription has
 * no step to come, and neither has a step the provider never reports. A send
 * to a suppressed address was never queued: its one step says so.
 */
export function buildTimeline(
	events: SendEventRow[],
	send: TimelineSend,
	tracking: TimelineTracking | null = null,
): TimelineItem[] {
	const happened = happenedSteps(events, send)
	const reached = happened.map((step) => step.type)
	const isQueued = reached.includes('queued') || isSuppressedStatus(send.status)
	const queued = isQueued
		? []
		: [
				stepOf(
					{
						id: `queued-${send._id}`,
						type: 'queued',
						at: send.createdAt,
						detail: NO_DETAIL,
					},
					send,
				),
			]
	return [...queued, ...happened, ...pendingSteps(send, reached, tracking)]
}
