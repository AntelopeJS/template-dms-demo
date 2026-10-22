import type { SendStatus } from '../types/mailing'

const KEY_PREFIX = 'dms_mailing.rendering'

/** Statuses that prove the e-mail reached the recipient's mailbox. */
const RECEIVED_STATUSES: ReadonlySet<SendStatus> = new Set<SendStatus>([
	'delivered',
	'opened',
	'clicked',
	'spam',
	'unsubscribed',
])

/**
 * The i18n key titling a send's rendering: "What {name} received" once the
 * e-mail is known to have arrived, "The e-mail meant for {name}" while it is
 * on its way, bounced, failed or was never sent.
 */
export function renderingTitleKey(status: SendStatus): string {
	return RECEIVED_STATUSES.has(status)
		? `${KEY_PREFIX}.received_by`
		: `${KEY_PREFIX}.meant_for`
}
