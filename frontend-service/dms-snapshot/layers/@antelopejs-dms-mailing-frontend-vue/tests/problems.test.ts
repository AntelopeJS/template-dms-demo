import { describe, expect, it } from 'vitest'
import {
	describeProblem,
	problemEventReason,
	problemTone,
	type ProblemSend,
} from '../app/utils/problems'

const send = (patch: Partial<ProblemSend>): ProblemSend => ({
	status: 'bounced',
	error: '',
	recipientEmail: 'procurement@stark.com',
	provider: 'Brevo',
	...patch,
})

describe('describeProblem', () => {
	it('has nothing to say about a send that went through', () => {
		expect(describeProblem(send({ status: 'delivered' }))).toBeNull()
		expect(describeProblem(send({ status: 'queued' }))).toBeNull()
	})

	it.each([
		['550 5.1.1 Mailbox does not exist', 'address_missing'],
		['User unknown', 'address_missing'],
		['452 4.2.2 Mailbox full', 'mailbox_full'],
		['552 Quota exceeded', 'mailbox_full'],
		['554 5.7.1 Message rejected as spam', 'rejected_spam'],
		['421 Try again later', 'rejected'],
	])('reads the bounce "%s" as %s', (error, kind) => {
		expect(describeProblem(send({ error }))?.kind).toBe(kind)
	})

	it('reads a provider timeout as safe to send again', () => {
		const problem = describeProblem(
			send({ status: 'failed', error: 'Provider timeout after 30 s' }),
		)
		expect(problem).toMatchObject({
			kind: 'provider_timeout',
			icon: 'i-ph-plugs',
			titleKey: 'dms_mailing.sends.problems.provider_timeout.title',
			params: { provider: 'Brevo' },
		})
	})

	it.each([
		['connect ECONNREFUSED 127.0.0.1:1025', 'provider_unreachable'],
		['getaddrinfo ENOTFOUND smtp.example.test', 'provider_unreachable'],
		['connect EHOSTUNREACH 10.0.0.9:587', 'provider_unreachable'],
		['read ECONNRESET', 'provider_unreachable'],
		['connect ETIMEDOUT 10.0.0.9:587', 'provider_timeout'],
		['Connection timeout', 'provider_timeout'],
	])('reads the failure "%s" as %s', (error, kind) => {
		expect(describeProblem(send({ status: 'failed', error }))?.kind).toBe(kind)
	})

	it('tells an unreachable provider apart from a slow one', () => {
		const problem = describeProblem(
			send({ status: 'failed', error: 'connect ECONNREFUSED 127.0.0.1:1025' }),
			'nodemailer',
			false,
		)
		expect(problem).toMatchObject({
			titleKey: 'dms_mailing.sends.problems.provider_unreachable.title',
			descriptionKey:
				'dms_mailing.sends.problems.provider_unreachable.description_no_advice',
		})
	})

	it('falls back on a generic provider error', () => {
		expect(
			describeProblem(send({ status: 'failed', error: 'Invalid API key' }))
				?.kind,
		).toBe('provider_error')
	})

	it('reports a spam complaint', () => {
		expect(describeProblem(send({ status: 'spam' }))?.kind).toBe('spam_report')
	})

	it('explains an unsubscription, in amber like a spam report', () => {
		const problem = describeProblem(send({ status: 'unsubscribed' }))
		expect(problem?.kind).toBe('unsubscribed')
		expect(problem?.titleKey).toBe(
			'dms_mailing.sends.problems.unsubscribed.title',
		)
		expect(problemTone('unsubscribed')).toBe('warning')
		expect(problemTone('spam_report')).toBe('warning')
		expect(problemTone('address_missing')).toBe('error')
	})

	it('stops short of the colon when the provider gave no reason', () => {
		expect(describeProblem(send({ error: '' }))?.descriptionKey).toBe(
			'dms_mailing.sends.problems.rejected.description_no_reason',
		)
		expect(
			describeProblem(send({ status: 'failed', error: ' ' }))?.descriptionKey,
		).toBe('dms_mailing.sends.problems.provider_error.description_no_reason')
		expect(describeProblem(send({ error: '421 Later' }))?.descriptionKey).toBe(
			'dms_mailing.sends.problems.rejected.description',
		)
	})

	it('drops the advice to send again when the address is suppressed', () => {
		const failed = send({ status: 'failed', error: 'Invalid API key' })
		expect(describeProblem(failed, '', false)?.descriptionKey).toBe(
			'dms_mailing.sends.problems.provider_error.description_no_advice',
		)
		expect(
			describeProblem({ ...failed, error: '' }, '', false)?.descriptionKey,
		).toBe(
			'dms_mailing.sends.problems.provider_error.description_no_reason_no_advice',
		)
		expect(
			describeProblem(send({ error: '' }), '', false)?.descriptionKey,
		).toBe('dms_mailing.sends.problems.rejected.description_no_reason')
	})

	it('names the domain and the fallback provider', () => {
		const problem = describeProblem(
			send({ provider: undefined, error: '550' }),
			'The provider',
		)
		expect(problem?.params).toMatchObject({
			domain: 'stark.com',
			provider: 'The provider',
		})
	})
})

describe('problemEventReason', () => {
	const event = (type: string, details: object) =>
		({
			_id: type,
			sendId: 's',
			type,
			at: '2026-10-07T10:00:00Z',
			json_details: JSON.stringify(details),
		}) as never

	it('reads the reason of the latest problem event', () => {
		expect(
			problemEventReason([
				event('sent', {}),
				event('bounced', { reason: '550 5.1.1 Mailbox does not exist' }),
			]),
		).toBe('550 5.1.1 Mailbox does not exist')
	})

	it('answers an empty string without a problem event', () => {
		expect(problemEventReason([event('delivered', { reason: 'x' })])).toBe('')
	})
})
