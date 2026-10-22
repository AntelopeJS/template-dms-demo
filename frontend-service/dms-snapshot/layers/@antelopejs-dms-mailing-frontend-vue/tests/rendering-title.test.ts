import { describe, expect, it } from 'vitest'
import { renderingTitleKey } from '../app/utils/rendering-title'

describe('renderingTitleKey', () => {
	it('says "received" only once the e-mail reached the mailbox', () => {
		expect(renderingTitleKey('delivered')).toBe(
			'dms_mailing.rendering.received_by',
		)
		expect(renderingTitleKey('opened')).toBe(
			'dms_mailing.rendering.received_by',
		)
	})
	it('says "meant for" for a send that never arrived or may not have', () => {
		for (const status of [
			'queued',
			'sent',
			'bounced',
			'failed',
			'suppressed',
		] as const) {
			expect(renderingTitleKey(status)).toBe('dms_mailing.rendering.meant_for')
		}
	})
})
