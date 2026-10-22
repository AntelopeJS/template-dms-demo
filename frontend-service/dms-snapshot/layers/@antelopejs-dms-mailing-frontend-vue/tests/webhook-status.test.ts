import { describe, expect, it } from 'vitest'
import {
	isRefusalLatest,
	refusalKey,
	type WebhookReceipt,
	type WebhookStatus,
	webhookStatusLines,
	type WebhookTestResult,
	webhookTestMessage,
} from '../app/utils/webhook-status'

const EARLY = '2026-10-01T10:00:00.000Z'
const LATE = '2026-10-01T11:00:00.000Z'
const URL = 'https://api.example.com/api/mailing/events/smtp/default'

const received = (overrides: Partial<WebhookReceipt> = {}): WebhookReceipt => ({
	at: EARLY,
	provider: 'postmark',
	type: 'delivered',
	isMatched: true,
	isTest: false,
	...overrides,
})

const tested = (overrides: Partial<WebhookTestResult>): WebhookTestResult => ({
	isReceived: false,
	url: URL,
	durationMs: 42,
	status: { lastReceived: null, lastRefused: null },
	...overrides,
})

describe('webhookStatusLines', () => {
	it('says nothing came in yet', () => {
		const [line] = webhookStatusLines({ lastReceived: null, lastRefused: null })
		expect(line).toMatchObject({
			id: 'received',
			tone: 'neutral',
			labelKey: 'dms_mailing.settings.webhook_status.never_received',
			at: null,
		})
	})

	it('tells a matched, an unmatched and a test event apart', () => {
		const keyOf = (receipt: WebhookReceipt) =>
			webhookStatusLines({ lastReceived: receipt, lastRefused: null })[0]
				?.labelKey
		expect(keyOf(received())).toBe(
			'dms_mailing.settings.webhook_status.received',
		)
		expect(keyOf(received({ isMatched: false }))).toBe(
			'dms_mailing.settings.webhook_status.received_unmatched',
		)
		expect(keyOf(received({ isMatched: false, isTest: true }))).toBe(
			'dms_mailing.settings.webhook_status.received_test',
		)
	})

	it('shows a refusal in red while nothing was accepted since', () => {
		const status: WebhookStatus = {
			lastReceived: received(),
			lastRefused: { at: LATE, provider: 'postmark', reason: 'bad_secret' },
		}
		expect(isRefusalLatest(status)).toBe(true)
		expect(webhookStatusLines(status)[1]).toMatchObject({
			id: 'refused',
			tone: 'error',
			reasonKey: refusalKey('bad_secret'),
		})
		const healed: WebhookStatus = {
			lastReceived: received({ at: LATE }),
			lastRefused: { at: EARLY, provider: 'postmark', reason: 'bad_secret' },
		}
		expect(webhookStatusLines(healed)[1]?.tone).toBe('warning')
	})
})

describe('webhookTestMessage', () => {
	it('confirms a received test event', () => {
		expect(webhookTestMessage(tested({ isReceived: true }))).toMatchObject({
			color: 'success',
			titleKey: 'dms_mailing.settings.webhook_status.test.received',
			params: { duration: '42' },
		})
	})

	it('names a refusal, an error status and an unreachable URL', () => {
		expect(
			webhookTestMessage(tested({ httpStatus: 403, refusal: 'bad_secret' })),
		).toMatchObject({
			color: 'error',
			descriptionKey: refusalKey('bad_secret'),
		})
		expect(webhookTestMessage(tested({ httpStatus: 403 }))).toMatchObject({
			titleKey: 'dms_mailing.settings.webhook_status.test.http_error',
			descriptionKey: 'dms_mailing.settings.webhook_status.test.proxy_hint',
		})
		expect(
			webhookTestMessage(tested({ httpStatus: 502 })).descriptionKey,
		).toBeUndefined()
		expect(
			webhookTestMessage(tested({ networkError: 'ECONNREFUSED' })),
		).toMatchObject({
			titleKey: 'dms_mailing.settings.webhook_status.test.unreachable',
			params: { error: 'ECONNREFUSED', url: URL },
		})
	})
})
