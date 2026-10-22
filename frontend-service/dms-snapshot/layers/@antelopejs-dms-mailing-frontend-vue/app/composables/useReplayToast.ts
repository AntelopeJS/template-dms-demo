import type { SendResult } from './useMailingApi'
import { replayOutcome } from '../utils/send-actions'
import { sendRoute } from '../utils/send-link'
import {
	reasonKey,
	suppressedReasonOf,
	suppressionRoute,
} from '../utils/suppression'

/**
 * The toast after a send again, from what the API answered: a success only
 * when the e-mail went out. A suppressed address gets a warning with its
 * place on the suppression list, a provider failure an error.
 */
export function useReplayToast() {
	const toast = useToast()
	const { t } = useI18n()
	const { processApiMessage } = useTranslation()

	/** Why nothing went: the reason only, the title already says "Not sent". */
	const suppressedReason = (error: string | undefined): string | undefined => {
		const reason = suppressedReasonOf(error)
		if (!reason) return error ? processApiMessage(error) : undefined
		return t('dms_mailing.suppressions.notice.not_sent.reason', {
			reason: t(reasonKey(reason)),
		})
	}

	return function reportReplay(
		result: SendResult,
		email: string,
		sentTitle: string,
	): void {
		const seeSend = result.sendId
			? [
					{
						label: t('dms_mailing.sends.drawer.see_send'),
						onClick: () => void navigateDms(sendRoute(result.sendId)),
					},
				]
			: []
		const reason = result.error ? processApiMessage(result.error) : undefined
		const outcome = replayOutcome(result)
		if (outcome === 'suppressed') {
			toast.add({
				color: 'warning',
				icon: 'i-ph-prohibit',
				title: t('dms_mailing.suppressions.notice.not_sent.toast_title', {
					email,
				}),
				description: suppressedReason(result.error),
				actions: [
					{
						label: t('dms_mailing.suppressions.notice.open_list'),
						onClick: () => void navigateDms(suppressionRoute(email)),
					},
				],
			})
			return
		}
		toast.add(
			outcome === 'failed'
				? {
						color: 'error',
						title: email,
						description: reason,
						actions: seeSend,
					}
				: { color: 'success', title: sentTitle, actions: seeSend },
		)
	}
}
