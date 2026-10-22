import { describe, expect, it } from 'vitest'
import {
	correctedAddressError,
	formatPayload,
	replayOutcome,
	SEND_STATUS_TONES,
	sendFooterActions,
	shortSendId,
} from '../app/utils/send-actions'
import { SEND_STATUSES } from '../app/types/mailing'

type Status = Parameters<typeof sendFooterActions>[0]['status']

const footer = (status: Status) => sendFooterActions({ status })
const ids = (status: Status) => footer(status).map((action) => action.id)

describe('sendFooterActions', () => {
	it('asks for a corrected address after a bounce, never a second send', () => {
		expect(ids('bounced')).toEqual(['rendering', 'copy_address', 'fix_address'])
		expect(
			footer('bounced').find((action) => action.id === 'fix_address')?.variant,
		).toBe('solid')
	})

	it('never answers a spam report with another e-mail', () => {
		expect(ids('spam')).not.toContain('send_again')
		expect(ids('spam')).not.toContain('fix_address')
	})

	it('makes sending again the main action of a provider failure', () => {
		const action = footer('failed').find((entry) => entry.id === 'send_again')
		expect(action?.variant).toBe('solid')
	})

	it('keeps sending again quiet for a send that went through', () => {
		for (const status of [
			'delivered',
			'opened',
			'clicked',
			'sent',
			'queued',
		] as const) {
			expect(
				footer(status).find((action) => action.id === 'send_again')?.variant,
			).toBe('ghost')
		}
	})

	it('sends a temporary bounce again to the same address', () => {
		const actions = sendFooterActions({ status: 'bounced', isSoftBounce: true })
		expect(actions.map((action) => action.id)).toEqual([
			'rendering',
			'send_again',
		])
	})

	it('never sends again to someone who unsubscribed', () => {
		expect(ids('unsubscribed')).toEqual(['rendering', 'copy_address'])
	})

	it('offers no second send once someone sent it again', () => {
		const actions = sendFooterActions({ status: 'failed', replayedBy: 'snd_2' })
		expect(actions.map((action) => action.id)).not.toContain('send_again')
		expect(actions.map((action) => action.id)).not.toContain('fix_address')
	})

	it('always offers the rendering', () => {
		for (const status of SEND_STATUSES)
			expect(ids(status)).toContain('rendering')
	})
})

describe('SEND_STATUS_TONES', () => {
	it('gives every status a tone', () => {
		expect(SEND_STATUSES.every((status) => SEND_STATUS_TONES[status])).toBe(
			true,
		)
		expect(SEND_STATUS_TONES.bounced).toBe('error')
	})
})

describe('correctedAddressError', () => {
	it('refuses an empty, invalid or unchanged address', () => {
		expect(correctedAddressError('', 'a@b.co')).toBe(
			'dms_mailing.sends.fix_address.errors.required',
		)
		expect(correctedAddressError('nope', 'a@b.co')).toBe(
			'dms_mailing.sends.fix_address.errors.invalid',
		)
		expect(correctedAddressError(' A@B.co ', 'a@b.co')).toBe(
			'dms_mailing.sends.fix_address.errors.same',
		)
	})

	it('accepts a different e-mail address', () => {
		expect(
			correctedAddressError('tony@stark.com', 'procurement@stark.com'),
		).toBeNull()
	})
})

describe('shortSendId and formatPayload', () => {
	it('keeps the end of the id', () => {
		expect(shortSendId('66f0c2a18f2a8c1e')).toBe('8f2a8c1e')
	})

	it('pretty-prints the data, or returns it raw', () => {
		expect(formatPayload('{"a":1}')).toBe('{\n  "a": 1\n}')
		expect(formatPayload('not json')).toBe('not json')
		expect(formatPayload(undefined)).toBe('')
	})
})

describe('replayOutcome', () => {
	it('counts a send again as sent only when the e-mail went out', () => {
		expect(replayOutcome({ status: 'sent' })).toBe('sent')
		expect(
			replayOutcome({
				status: 'suppressed',
				error: '$dms_mailing.errors.suppressed.unsubscribe',
			}),
		).toBe('suppressed')
		expect(replayOutcome({ status: 'failed', error: 'ECONNREFUSED' })).toBe(
			'failed',
		)
		expect(replayOutcome({ status: 'queued', error: 'boom' })).toBe('failed')
	})
})
