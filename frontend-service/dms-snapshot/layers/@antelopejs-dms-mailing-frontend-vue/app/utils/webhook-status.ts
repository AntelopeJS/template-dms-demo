/** Why the webhook refused a call. */
export type WebhookRefusal = 'missing_secret' | 'bad_secret' | 'invalid_event'

/** The last call the webhook accepted. */
export interface WebhookReceipt {
	at: string
	provider: string
	type: string
	/** Recorded against a send; not when no send carries its message id. */
	isMatched: boolean
	/** The settings' own test event. */
	isTest: boolean
}

/** The last call the webhook refused. */
export interface WebhookRejection {
	at: string
	provider: string
	reason: WebhookRefusal
}

export interface WebhookStatus {
	lastReceived: WebhookReceipt | null
	lastRefused: WebhookRejection | null
}

/** What "Send a test event" found, and the status after it. */
export interface WebhookTestResult {
	isReceived: boolean
	url: string
	durationMs: number
	httpStatus?: number
	refusal?: WebhookRefusal
	networkError?: string
	status: WebhookStatus
}

export type WebhookLineTone = 'success' | 'warning' | 'error' | 'neutral'

/** One line of the webhook status: what came in last, or was refused. */
export interface WebhookStatusLine {
	id: 'received' | 'refused'
	icon: string
	tone: WebhookLineTone
	/** i18n key, interpolated with `params`. */
	labelKey: string
	params: Record<string, string>
	/** i18n key of the refusal's reason, given to the label as `{reason}`. */
	reasonKey?: string
	/** When it happened; `null` for "nothing yet". */
	at: string | null
}

/** The toast a test event ends with. */
export interface WebhookTestMessage {
	color: 'success' | 'error'
	titleKey: string
	descriptionKey?: string
	params: Record<string, string>
}

const KEY_PREFIX = 'dms_mailing.settings.webhook_status.'
/** What a front-end proxy answers a cross-site call it refuses. */
const HTTP_FORBIDDEN = 403

const key = (path: string): string => `${KEY_PREFIX}${path}`

/** The i18n key of a refusal's reason, in plain words. */
export function refusalKey(reason: WebhookRefusal): string {
	return key(`refusals.${reason}`)
}

const receivedKey = (receipt: WebhookReceipt): string => {
	if (receipt.isTest) return key('received_test')
	return receipt.isMatched ? key('received') : key('received_unmatched')
}

const timeOf = (iso: string | undefined): number =>
	iso ? new Date(iso).getTime() : Number.NEGATIVE_INFINITY

/** Whether the last call refused came after the last one accepted. */
export function isRefusalLatest(status: WebhookStatus): boolean {
	if (!status.lastRefused) return false
	return timeOf(status.lastRefused.at) > timeOf(status.lastReceived?.at)
}

function receivedLine(receipt: WebhookReceipt | null): WebhookStatusLine {
	if (!receipt)
		return {
			id: 'received',
			icon: 'i-ph-hourglass',
			tone: 'neutral',
			labelKey: key('never_received'),
			params: {},
			at: null,
		}
	return {
		id: 'received',
		icon: 'i-ph-check-circle',
		tone: receipt.isMatched || receipt.isTest ? 'success' : 'warning',
		labelKey: receivedKey(receipt),
		params: { type: receipt.type, provider: receipt.provider },
		at: receipt.at,
	}
}

function refusedLine(status: WebhookStatus): WebhookStatusLine[] {
	const rejection = status.lastRefused
	if (!rejection) return []
	return [
		{
			id: 'refused',
			icon: 'i-ph-shield-warning',
			tone: isRefusalLatest(status) ? 'error' : 'warning',
			labelKey: key('refused'),
			params: { provider: rejection.provider },
			reasonKey: refusalKey(rejection.reason),
			at: rejection.at,
		},
	]
}

/**
 * The lines of the webhook status: the last event received (or none yet),
 * then the last call refused when there was one, in red while nothing was
 * accepted since.
 */
export function webhookStatusLines(status: WebhookStatus): WebhookStatusLine[] {
	return [receivedLine(status.lastReceived), ...refusedLine(status)]
}

/**
 * What a test event tells: received, refused (and why), answered with an
 * error status, or not reached at all.
 */
export function webhookTestMessage(
	result: WebhookTestResult,
): WebhookTestMessage {
	const params = {
		url: result.url,
		duration: String(result.durationMs),
		status: String(result.httpStatus ?? ''),
		error: result.networkError ?? '',
	}
	if (result.isReceived)
		return { color: 'success', titleKey: key('test.received'), params }
	if (result.refusal)
		return {
			color: 'error',
			titleKey: key('test.refused'),
			descriptionKey: refusalKey(result.refusal),
			params,
		}
	if (result.httpStatus)
		return {
			color: 'error',
			titleKey: key('test.http_error'),
			descriptionKey:
				result.httpStatus === HTTP_FORBIDDEN
					? key('test.proxy_hint')
					: undefined,
			params,
		}
	return {
		color: 'error',
		titleKey: key('test.unreachable'),
		descriptionKey: key('test.unreachable_hint'),
		params,
	}
}
