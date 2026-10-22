import type { SendEventRow, SendRow, SendStatus } from '../types/mailing'

export type ProblemKind =
	| 'address_missing'
	| 'mailbox_full'
	| 'rejected_spam'
	| 'spam_report'
	| 'provider_timeout'
	| 'provider_unreachable'
	| 'rejected'
	| 'provider_error'
	| 'unsubscribed'

export interface ProblemDescription {
	kind: ProblemKind
	icon: string
	/** i18n key of the plain-language title ("This address doesn't exist"). */
	titleKey: string
	/** i18n key of the one-line explanation under it. */
	descriptionKey: string
	params: Record<string, string>
}

export type ProblemSend = Pick<
	SendRow,
	'status' | 'error' | 'recipientEmail' | 'provider'
>

interface ProblemRule {
	kind: ProblemKind
	icon: string
	statuses: SendStatus[]
	/** Matched against the raw error; absent matches any error. */
	pattern?: RegExp
}

const KEY_PREFIX = 'dms_mailing.sends.problems.'
const DOMAIN_SEPARATOR = '@'

/**
 * Plain-language readings of a send problem, most specific first: the SMTP
 * class or the provider's wording decides, the status is the fallback.
 */
const PROBLEM_RULES: ProblemRule[] = [
	{
		kind: 'address_missing',
		icon: 'i-ph-at',
		statuses: ['bounced', 'failed'],
		pattern:
			/5\.1\.[0-3]|\b550\b|\b553\b|does ?n[o']t exist|unknown (user|recipient)|no such (user|mailbox)|user unknown|invalid (recipient|address)/i,
	},
	{
		kind: 'mailbox_full',
		icon: 'i-ph-tray',
		statuses: ['bounced', 'failed'],
		pattern:
			/\b452\b|\b552\b|[45]\.2\.2|mailbox (is )?full|over quota|quota exceeded/i,
	},
	{
		kind: 'rejected_spam',
		icon: 'i-ph-shield-warning',
		statuses: ['bounced', 'failed'],
		pattern: /5\.7\.[0-9]|\bspam\b|blocked|blacklist|reputation/i,
	},
	{ kind: 'spam_report', icon: 'i-ph-prohibit', statuses: ['spam'] },
	{
		kind: 'provider_timeout',
		icon: 'i-ph-plugs',
		statuses: ['failed'],
		pattern: /time(d)? ?out|ETIMEDOUT|did ?n[o']t answer/i,
	},
	{
		kind: 'provider_unreachable',
		icon: 'i-ph-plugs',
		statuses: ['failed'],
		pattern:
			/ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|connection refused|unreachable/i,
	},
	{ kind: 'rejected', icon: 'i-ph-arrow-u-up-left', statuses: ['bounced'] },
	{ kind: 'provider_error', icon: 'i-ph-warning', statuses: ['failed'] },
	{ kind: 'unsubscribed', icon: 'i-ph-user-minus', statuses: ['unsubscribed'] },
]

/** Problems the recipient chose rather than suffered: told in amber. */
const WARNING_KINDS = new Set<ProblemKind>(['spam_report', 'unsubscribed'])

/** The banner tone a problem is told in. */
export function problemTone(kind: ProblemKind): 'warning' | 'error' {
	return WARNING_KINDS.has(kind) ? 'warning' : 'error'
}

/**
 * Problems whose explanation quotes the provider's words; without them, a
 * sentence that stops short of the colon.
 */
const KINDS_QUOTING_ERROR = new Set<ProblemKind>(['rejected', 'provider_error'])
const NO_REASON_SUFFIX = '_no_reason'
/**
 * Problems whose explanation ends on the advice to send again; when sending
 * again is not possible (the address is on the suppression list), a sentence
 * without that advice.
 */
const KINDS_ADVISING_SEND_AGAIN = new Set<ProblemKind>([
	'provider_timeout',
	'provider_unreachable',
	'provider_error',
])
const NO_ADVICE_SUFFIX = '_no_advice'

function descriptionKey(
	kind: ProblemKind,
	error: string | undefined,
	canSendAgain: boolean,
): string {
	let key = `${KEY_PREFIX}${kind}.description`
	if (KINDS_QUOTING_ERROR.has(kind) && !error?.trim()) key += NO_REASON_SUFFIX
	if (!canSendAgain && KINDS_ADVISING_SEND_AGAIN.has(kind))
		key += NO_ADVICE_SUFFIX
	return key
}

function matches(rule: ProblemRule, send: ProblemSend): boolean {
	if (!rule.statuses.includes(send.status)) return false
	return !rule.pattern || rule.pattern.test(send.error ?? '')
}

function domainOf(email: string): string {
	return email.split(DOMAIN_SEPARATOR).at(-1) ?? email
}

/**
 * What went wrong with a send, in the words of the person reading the log:
 * the title and explanation keys plus the icon of the banner. `null` when the
 * send has no problem. `provider` names the provider when the send does not;
 * `canSendAgain` is false when the address can no longer be sent to.
 */
export function describeProblem(
	send: ProblemSend,
	provider = '',
	canSendAgain = true,
): ProblemDescription | null {
	const rule = PROBLEM_RULES.find((candidate) => matches(candidate, send))
	if (!rule) return null
	return {
		kind: rule.kind,
		icon: rule.icon,
		titleKey: `${KEY_PREFIX}${rule.kind}.title`,
		descriptionKey: descriptionKey(rule.kind, send.error, canSendAgain),
		params: {
			provider: send.provider || provider,
			domain: domainOf(send.recipientEmail),
			error: send.error ?? '',
		},
	}
}

const PROBLEM_EVENT_TYPES: SendStatus[] = ['bounced', 'failed', 'spam']

interface EventDetails {
	reason?: unknown
}

function reasonOf(event: SendEventRow): string {
	try {
		const details = JSON.parse(event.json_details || '{}') as EventDetails
		return typeof details.reason === 'string' ? details.reason : ''
	} catch {
		return ''
	}
}

/**
 * The provider's words for the latest problem event of a send, for sends
 * logged before their error was kept on the send itself.
 */
export function problemEventReason(events: SendEventRow[]): string {
	const problems = events.filter((event) =>
		PROBLEM_EVENT_TYPES.includes(event.type),
	)
	return problems.map(reasonOf).filter(Boolean).at(-1) ?? ''
}
