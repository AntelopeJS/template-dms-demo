import { describe, expect, it } from 'vitest'
import { buildTimeline, type TimelineSend } from '../app/utils/timeline'
import type { SendEventRow } from '../app/types/mailing'

const SEND: TimelineSend = {
	_id: 'snd_1',
	status: 'bounced',
	createdAt: '2026-09-09T09:59:58.000Z',
	provider: 'Brevo',
	providerMessageId: '<202609291429.84712@brevo>',
	error: '550 5.1.1 Mailbox does not exist',
}

const event = (
	id: string,
	type: SendEventRow['type'],
	at: string,
	details = '{}',
): SendEventRow => ({
	_id: id,
	sendId: SEND._id,
	type,
	at,
	json_details: details,
})

describe('buildTimeline', () => {
	it('starts on the queued step, then orders the events by time', () => {
		const items = buildTimeline(
			[
				event(
					'2',
					'bounced',
					'2026-09-09T10:01:00.000Z',
					'{"reason":"550 5.1.1"}',
				),
				event('1', 'sent', '2026-09-09T10:00:00.000Z'),
			],
			SEND,
		)
		expect(items.map((item) => item.type)).toEqual([
			'queued',
			'sent',
			'bounced',
		])
		expect(items[0]).toMatchObject({ at: SEND.createdAt, isPending: false })
	})

	it('names the provider and shows its message id in mono', () => {
		const [, sent] = buildTimeline(
			[event('1', 'sent', '2026-09-09T10:00:00.000Z')],
			SEND,
		)
		expect(sent).toMatchObject({
			titleKey: 'dms_mailing.sends.timeline.sent_to',
			titleParams: { provider: 'Brevo' },
			detail: SEND.providerMessageId,
			isDetailMono: true,
		})
	})

	it('falls back to the generic title when the provider is unknown', () => {
		const [, sent] = buildTimeline(
			[event('1', 'sent', '2026-09-09T10:00:00.000Z')],
			{
				...SEND,
				provider: undefined,
			},
		)
		expect(sent?.titleKey).toBe('dms_mailing.sends.timeline.sent')
	})

	it('keeps the raw SMTP answer of a bounce, from the event or the send', () => {
		const fromEvent = buildTimeline(
			[
				event(
					'2',
					'bounced',
					'2026-09-09T10:01:00.000Z',
					'{"reason":"550 5.1.1"}',
				),
			],
			SEND,
		).at(-1)
		expect(fromEvent).toMatchObject({
			tone: 'error',
			detail: '550 5.1.1',
			isDetailMono: true,
		})
		const fromSend = buildTimeline(
			[event('2', 'bounced', '2026-09-09T10:01:00.000Z')],
			SEND,
		).at(-1)
		expect(fromSend?.detail).toBe(SEND.error)
	})

	it('ghosts the happy-path steps still to come', () => {
		const items = buildTimeline(
			[event('1', 'sent', '2026-09-09T10:00:00.000Z')],
			{
				...SEND,
				status: 'sent',
			},
		)
		const pending = items.filter((item) => item.isPending)
		expect(pending.map((item) => item.type)).toEqual(['delivered', 'opened'])
		expect(pending.every((item) => item.at === null)).toBe(true)
	})

	it('draws no step to come after a problem', () => {
		const items = buildTimeline(
			[event('1', 'failed', '2026-09-09T10:00:30.000Z')],
			{
				...SEND,
				status: 'failed',
			},
		)
		expect(items.some((item) => item.isPending)).toBe(false)
	})

	it('draws no step to come after an unsubscription', () => {
		const items = buildTimeline(
			[
				event('1', 'delivered', '2026-09-09T10:00:30.000Z'),
				event('2', 'unsubscribed', '2026-09-09T10:05:00.000Z'),
			],
			{ ...SEND, status: 'unsubscribed' },
		)
		expect(items.some((item) => item.isPending)).toBe(false)
	})

	it('calls a 4.x.x bounce temporary', () => {
		const bounce = buildTimeline(
			[
				event(
					'2',
					'bounced',
					'2026-09-09T10:01:00.000Z',
					'{"reason":"452 4.2.2 The recipient mailbox is full"}',
				),
			],
			SEND,
		).at(-1)
		expect(bounce?.titleKey).toBe('dms_mailing.sends.timeline.soft_bounce')
		const typed = buildTimeline(
			[
				event(
					'2',
					'bounced',
					'2026-09-09T10:01:00.000Z',
					'{"bounceType":"hard","reason":"452 4.2.2"}',
				),
			],
			SEND,
		).at(-1)
		expect(typed?.titleKey).toBe('dms_mailing.sends.timeline.bounced')
	})

	it('waits only for what the provider reports', () => {
		const sent = { ...SEND, status: 'sent' as const }
		const events = [event('1', 'sent', '2026-09-09T10:00:00.000Z')]
		const pendingOf = (openTracking: boolean, clickTracking: boolean) =>
			buildTimeline(events, sent, { openTracking, clickTracking })
				.filter((item) => item.isPending)
				.map((item) => item.type)
		expect(pendingOf(false, false)).toEqual([])
		expect(pendingOf(false, true)).toEqual(['delivered'])
		expect(pendingOf(true, true)).toEqual(['delivered', 'opened'])
	})

	it('does not repeat the queued step when an event records it', () => {
		const items = buildTimeline(
			[event('0', 'queued', '2026-09-09T10:00:00.000Z')],
			{
				...SEND,
				status: 'queued',
			},
		)
		expect(items.filter((item) => item.type === 'queued')).toHaveLength(1)
		expect(
			items.filter((item) => item.isPending).map((item) => item.type),
		).toEqual(['sent', 'delivered', 'opened'])
	})
})
