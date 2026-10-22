import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReplayToast } from '../app/composables/useReplayToast'
import { stubNuxtGlobals, type NuxtStubs } from './helpers/nuxt-globals'

interface ToastAction {
	label: string
	onClick: () => void
}

describe('useReplayToast', () => {
	let stubs: NuxtStubs

	beforeEach(() => {
		stubs = stubNuxtGlobals()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('says sent again, with a link to the new send', () => {
		useReplayToast()({ sendId: 's2', status: 'sent' }, 'a@x.test', 'Sent again')
		expect(stubs.toasts).toHaveLength(1)
		const [toast] = stubs.toasts
		expect(toast).toMatchObject({ color: 'success', title: 'Sent again' })
		;(toast.actions as ToastAction[])[0].onClick()
		expect(stubs.navigations).toEqual([
			{ path: '/modules/mailing/sends', query: { record: 's2' } },
		])
	})

	it('warns instead when the address is on the suppression list', () => {
		useReplayToast()(
			{
				sendId: 's3',
				status: 'suppressed',
				error: '$dms_mailing.errors.suppressed.unsubscribe',
			},
			'a@x.test',
			'Sent again',
		)
		const [toast] = stubs.toasts
		expect(toast).toMatchObject({
			color: 'warning',
			title: 'dms_mailing.suppressions.notice.not_sent.toast_title email=a@x.test',
			description:
				'dms_mailing.suppressions.notice.not_sent.reason reason=dms_mailing.suppressions.reasons.unsubscribe',
		})
		;(toast.actions as ToastAction[])[0].onClick()
		expect(stubs.navigations).toEqual([
			{ path: '/modules/mailing/suppressions', query: { email: 'a@x.test' } },
		])
	})

	it('reports a provider failure as an error', () => {
		useReplayToast()(
			{ sendId: 's4', status: 'failed', error: 'ECONNREFUSED' },
			'a@x.test',
			'Sent again',
		)
		expect(stubs.toasts[0]).toMatchObject({
			color: 'error',
			title: 'a@x.test',
			description: 'ECONNREFUSED',
		})
	})
})
