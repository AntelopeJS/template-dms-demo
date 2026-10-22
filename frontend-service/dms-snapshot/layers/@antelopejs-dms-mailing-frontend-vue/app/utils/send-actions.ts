import type { SendRow, SendStatus } from '../types/mailing'
import { isSuppressedStatus } from './suppression'

export type SendActionId =
	'rendering' | 'copy_address' | 'fix_address' | 'send_again'

export type SendActionVariant = 'ghost' | 'outline' | 'solid'

export interface SendAction {
	id: SendActionId
	variant: SendActionVariant
	/** i18n key of the button label; absent for an icon-only button. */
	labelKey?: string
	icon: string
}

/**
 * A send as the drawer reads it: what the API added to a send since `SendRow`
 * — a temporary bounce, and the link between a send and its send again.
 */
export interface DrawerSend extends SendRow {
	isSoftBounce?: boolean
	/** The send this one repeats. */
	replayOf?: string
	/** The send that repeated this one, once someone sent it again. */
	replayedBy?: string
	/** When someone sent it again. */
	resolvedAt?: string
}

/** What decides a drawer's footer. */
export interface FooterSend extends Pick<
	DrawerSend,
	'status' | 'isSoftBounce' | 'replayedBy'
> {
	/**
	 * Whether the recipient is on the suppression list today; unknown until
	 * the send's detail is loaded.
	 */
	isAddressSuppressed?: boolean
}

interface FooterRule {
	matches: (send: FooterSend) => boolean
	actions: SendAction[]
}

const KEY_PREFIX = 'dms_mailing.sends.drawer.actions.'
const SHORT_ID_LENGTH = 8

const RENDERING: SendAction = {
	id: 'rendering',
	variant: 'ghost',
	labelKey: `${KEY_PREFIX}rendering`,
	icon: 'i-ph-eye',
}

const COPY_ADDRESS: SendAction = {
	id: 'copy_address',
	variant: 'outline',
	icon: 'i-ph-copy',
}

const FIX_ADDRESS: SendAction = {
	id: 'fix_address',
	variant: 'solid',
	labelKey: `${KEY_PREFIX}fix_address`,
	icon: 'i-ph-user-circle',
}

const sendAgain = (variant: SendActionVariant): SendAction => ({
	id: 'send_again',
	variant,
	labelKey: `${KEY_PREFIX}send_again`,
	icon: 'i-ph-arrow-clockwise',
})

/** The rendering, one label whatever the status, outlined beside a quiet resend. */
const RENDERING_OUTLINED: SendAction = { ...RENDERING, variant: 'outline' }

/** Footer of a send that went through: repeating it is possible but quiet. */
const DEFAULT_ACTIONS: SendAction[] = [sendAgain('ghost'), RENDERING_OUTLINED]

/** Nothing to send any more: what was received, and the address. */
const LOOK_ONLY: SendAction[] = [RENDERING, COPY_ADDRESS]

/**
 * The drawer footer by status (ML-03): a bounce asks for another address
 * since sending it again would bounce again, a spam report or an
 * unsubscription is never answered with another e-mail, a provider failure is
 * sent again as the main action.
 */
const ACTIONS_BY_STATUS: Partial<Record<SendStatus, SendAction[]>> = {
	bounced: [RENDERING, COPY_ADDRESS, FIX_ADDRESS],
	spam: LOOK_ONLY,
	unsubscribed: LOOK_ONLY,
	failed: [RENDERING, sendAgain('solid')],
	suppressed: LOOK_ONLY,
}

/**
 * Footers that win over the status: a send someone already sent again offers
 * no second one, a temporary bounce (a full mailbox) may go to the same
 * address later, and so may a suppressed send once its address is
 * reactivated.
 */
const FOOTER_RULES: FooterRule[] = [
	{ matches: (send) => !!send.replayedBy, actions: LOOK_ONLY },
	{
		matches: (send) => send.status === 'bounced' && !!send.isSoftBounce,
		actions: [RENDERING, sendAgain('solid')],
	},
	{
		matches: (send) =>
			isSuppressedStatus(send.status) && send.isAddressSuppressed === false,
		actions: [RENDERING, sendAgain('solid')],
	},
]

const offersSendAgain = (actions: SendAction[]): boolean =>
	actions.some((action) => action.id === 'send_again')

/**
 * The footer buttons of a send's drawer, in display order. While the address
 * is on the suppression list a send again would not leave: the footer only
 * looks, and the drawer's notice links to the list.
 */
export function sendFooterActions(send: FooterSend): SendAction[] {
	const rule = FOOTER_RULES.find((candidate) => candidate.matches(send))
	const actions =
		rule?.actions ?? ACTIONS_BY_STATUS[send.status] ?? DEFAULT_ACTIONS
	return send.isAddressSuppressed && offersSendAgain(actions)
		? LOOK_ONLY
		: actions
}

/** The short id the drawer's eyebrow shows ("SEND · 8f2a8c1e"). */
export function shortSendId(id: string): string {
	return id.slice(-SHORT_ID_LENGTH)
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Why a corrected address cannot be used, as an i18n key: empty, not an
 * e-mail, or the address that already failed. `null` when it can.
 */
export function correctedAddressError(
	value: string,
	previous: string,
): string | null {
	const address = value.trim()
	const rules: [boolean, string][] = [
		[!address, 'dms_mailing.sends.fix_address.errors.required'],
		[
			!EMAIL_PATTERN.test(address),
			'dms_mailing.sends.fix_address.errors.invalid',
		],
		[
			address.toLowerCase() === previous.trim().toLowerCase(),
			'dms_mailing.sends.fix_address.errors.same',
		],
	]
	return rules.find(([failed]) => failed)?.[1] ?? null
}

/**
 * What a send again did: went out, stopped by the suppression list (nothing
 * went out, the original stays a problem), or failed at the provider.
 */
export type ReplayOutcome = 'sent' | 'suppressed' | 'failed'

export function replayOutcome(result: {
	status: string
	error?: string
}): ReplayOutcome {
	if (isSuppressedStatus(result.status)) return 'suppressed'
	return result.error || result.status === 'failed' ? 'failed' : 'sent'
}

const PAYLOAD_INDENT = 2

/** The variables a send carried, pretty-printed; the raw text when unparsable. */
export function formatPayload(raw: string | undefined): string {
	if (!raw) return ''
	try {
		return JSON.stringify(JSON.parse(raw), null, PAYLOAD_INDENT)
	} catch {
		return raw
	}
}

export type SendTone = 'neutral' | 'info' | 'success' | 'warning' | 'error'

/** The tone of a send's status pill, the same in the log and the drawer. */
export const SEND_STATUS_TONES: Record<SendStatus, SendTone> = {
	queued: 'neutral',
	sent: 'info',
	delivered: 'success',
	opened: 'info',
	clicked: 'info',
	bounced: 'error',
	spam: 'warning',
	failed: 'error',
	unsubscribed: 'warning',
	suppressed: 'neutral',
}
