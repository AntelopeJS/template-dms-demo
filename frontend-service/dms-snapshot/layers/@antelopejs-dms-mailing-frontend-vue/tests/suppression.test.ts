import { describe, expect, it } from 'vitest'
import { SEND_STATUS_TONES, sendFooterActions } from '../app/utils/send-actions'
import {
	isSuppressedStatus,
	reasonKey,
	suppressedReasonOf,
	suppressionNotice,
	suppressionRoute,
	type SuppressionSummary,
} from '../app/utils/suppression'
import { buildTimeline } from '../app/utils/timeline'
import type { SendEventRow, SendStatus } from '../app/types/mailing'

const ENTRY: SuppressionSummary = {
	id: 'sup_1',
	email: 'ana@example.com',
	reason: 'complaint',
	createdAt: '2026-10-01T10:00:00.000Z',
	sendId: 'snd_1',
}

const WORDING = {
	date: (iso: string) => `on ${iso.slice(0, 10)}`,
	reason: (reason: string) => `[${reason}]`,
}

/** A send of the log nothing was sent for, as the API answers it. */
const SUPPRESSED = 'suppressed' as SendStatus

const ids = (send: Parameters<typeof sendFooterActions>[0]) =>
	sendFooterActions(send).map((action) => action.id)

describe('suppressionNotice', () => {
	it('says a suppressed send was not sent, and links to the list', () => {
		const notice = suppressionNotice(
			{ status: 'suppressed', recipientEmail: 'ana@example.com' },
			ENTRY,
			WORDING,
		)
		expect(notice).toMatchObject({
			tone: 'warning',
			titleKey: 'dms_mailing.suppressions.notice.not_sent.title',
			hasListLink: true,
			params: { date: 'on 2026-10-01', reason: '[complaint]' },
		})
	})

	it('tells a suppressed send whose address was reactivated since', () => {
		const notice = suppressionNotice(
			{ status: 'suppressed', recipientEmail: 'ana@example.com' },
			null,
			WORDING,
		)
		expect(notice).toMatchObject({
			tone: 'success',
			titleKey: 'dms_mailing.suppressions.notice.reactivated.title',
			hasListLink: false,
		})
	})

	it('tells that a sent address receives nothing any more', () => {
		expect(
			suppressionNotice(
				{ status: 'spam', recipientEmail: 'ana@example.com' },
				ENTRY,
				WORDING,
			)?.titleKey,
		).toBe('dms_mailing.suppressions.notice.on_list.title')
		expect(
			suppressionNotice(
				{ status: 'delivered', recipientEmail: 'ana@example.com' },
				null,
				WORDING,
			),
		).toBeNull()
	})

	it('links to the list narrowed to the address', () => {
		expect(suppressionRoute('ana@example.com')).toEqual({
			path: '/modules/mailing/suppressions',
			query: { email: 'ana@example.com' },
		})
		expect(suppressionRoute(' Ana@Example.com ').query).toEqual({
			email: 'ana@example.com',
		})
		expect(reasonKey('hard_bounce')).toBe(
			'dms_mailing.suppressions.reasons.hard_bounce',
		)
		expect(isSuppressedStatus('suppressed')).toBe(true)
		expect(isSuppressedStatus('failed')).toBe(false)
	})
})

describe('a suppressed send in the drawer', () => {
	it('offers no send again while the address is suppressed', () => {
		expect(ids({ status: SUPPRESSED })).toEqual(['rendering', 'copy_address'])
		expect(ids({ status: SUPPRESSED, isAddressSuppressed: true })).toEqual([
			'rendering',
			'copy_address',
		])
	})

	it('offers no send again of a failure whose address is suppressed', () => {
		expect(ids({ status: 'failed', isAddressSuppressed: true })).toEqual([
			'rendering',
			'copy_address',
		])
		expect(ids({ status: 'failed', isAddressSuppressed: false })).toEqual([
			'rendering',
			'send_again',
		])
		expect(ids({ status: 'bounced', isAddressSuppressed: true })).toContain(
			'fix_address',
		)
	})

	it('offers to send again once the address is reactivated', () => {
		expect(ids({ status: SUPPRESSED, isAddressSuppressed: false })).toEqual([
			'rendering',
			'send_again',
		])
		expect(SEND_STATUS_TONES.suppressed).toBe('neutral')
	})

	it('draws one step, without a queued one nor a raw reason', () => {
		const events: SendEventRow[] = [
			{
				_id: 'evt_1',
				sendId: 'snd_2',
				type: SUPPRESSED,
				at: '2026-10-02T10:00:00.000Z',
				json_details: JSON.stringify({
					reason: '$dms_mailing.errors.suppressed_complaint',
				}),
			},
		]
		const steps = buildTimeline(events, {
			_id: 'snd_2',
			status: SUPPRESSED,
			createdAt: '2026-10-02T10:00:00.000Z',
		})
		expect(steps.map((step) => step.type)).toEqual(['suppressed'])
		expect(steps[0]).toMatchObject({
			titleKey: 'dms_mailing.sends.timeline.suppressed',
			detail: '',
			isPending: false,
		})
	})
})

describe('the suppression list narrowed by a link', () => {
	it('reads the reason a suppressed send keeps, nothing for another error', () => {
		expect(suppressedReasonOf('$dms_mailing.errors.suppressed.manual')).toBe(
			'manual',
		)
		expect(suppressedReasonOf('ECONNREFUSED')).toBe(null)
		expect(suppressedReasonOf(undefined)).toBe(null)
	})
})
