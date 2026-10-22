import type { SuppressionReason, SuppressionSummary } from '../types/mailing'
import { SUPPRESSIONS_PATH } from './pages'

/** The status of a send nothing was sent for: its address is suppressed. */
export const SUPPRESSED_STATUS = 'suppressed'

const EMAIL_QUERY_KEY = 'email'
const KEY_PREFIX = 'dms_mailing.suppressions.'

export type { SuppressionReason, SuppressionSummary }

/** A banner of the send drawer about the recipient's suppression. */
export interface SuppressionNotice {
	tone: 'warning' | 'info' | 'success'
	icon: string
	/** i18n keys, interpolated with `params`. */
	titleKey: string
	descriptionKey: string
	params: Record<string, string>
	/** Whether the banner links to the address on the suppression list. */
	hasListLink: boolean
}

/** What the drawer reads of a send to tell its suppression. */
export interface SuppressionSend {
	status: string
	recipientEmail: string
}

/** How the drawer words a suppression's date and reason. */
export interface SuppressionWording {
	date: (iso: string) => string
	reason: (reason: SuppressionReason) => string
}

export interface SuppressionRoute {
	path: string
	query: Record<string, string>
}

export function isSuppressedStatus(status: string | undefined): boolean {
	return status === SUPPRESSED_STATUS
}

/** The i18n key naming a suppression reason ("Hard bounce"). */
export function reasonKey(reason: SuppressionReason): string {
	return `${KEY_PREFIX}reasons.${reason}`
}

/** The prefix of the error a suppressed send keeps, one key per reason. */
const SUPPRESSED_ERROR_PREFIX = '$dms_mailing.errors.suppressed.'

/**
 * The reason a suppressed send's error names ("manual" out of
 * `$dms_mailing.errors.suppressed.manual`); `null` for any other error.
 */
export function suppressedReasonOf(
	error: string | undefined,
): SuppressionReason | null {
	if (!error?.startsWith(SUPPRESSED_ERROR_PREFIX)) return null
	return error.slice(SUPPRESSED_ERROR_PREFIX.length) as SuppressionReason
}

/**
 * The suppression list, narrowed to one address. The list filters on the
 * stored address exactly, and addresses are stored trimmed and lowercased.
 */
export function suppressionRoute(email: string): SuppressionRoute {
	return {
		path: SUPPRESSIONS_PATH,
		query: { [EMAIL_QUERY_KEY]: email.trim().toLowerCase() },
	}
}

const notice = (
	key: string,
	tone: SuppressionNotice['tone'],
	hasListLink: boolean,
	params: Record<string, string>,
): SuppressionNotice => ({
	tone,
	icon: 'i-ph-prohibit',
	titleKey: `${KEY_PREFIX}notice.${key}.title`,
	descriptionKey: `${KEY_PREFIX}notice.${key}.description`,
	params,
	hasListLink,
})

/**
 * What the drawer says about the recipient's suppression: a send that was
 * not sent (and whether the address is still suppressed), or an address that
 * receives nothing any more since this send. `null` when there is nothing to
 * say.
 */
export function suppressionNotice(
	send: SuppressionSend,
	suppression: SuppressionSummary | null | undefined,
	wording: SuppressionWording,
): SuppressionNotice | null {
	const params = suppression
		? {
				date: wording.date(suppression.createdAt),
				reason: wording.reason(suppression.reason),
				email: suppression.email,
			}
		: { date: '', reason: '', email: send.recipientEmail }
	if (isSuppressedStatus(send.status))
		return suppression
			? notice('not_sent', 'warning', true, params)
			: notice('reactivated', 'success', false, params)
	return suppression ? notice('on_list', 'info', true, params) : null
}
