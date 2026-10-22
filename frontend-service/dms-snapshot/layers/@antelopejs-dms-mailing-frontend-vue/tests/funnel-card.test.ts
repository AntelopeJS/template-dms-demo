// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type Ref } from 'vue'
import FunnelCard from '../app/components/FunnelCard.vue'
import { flush, mount, slotStub, stubNuxtGlobals } from './helpers/nuxt-globals'

interface EmptyStateAction {
	label: string
	onClick: () => void
}

const EmptyStateStub = defineComponent({
	props: {
		title: { type: String, default: '' },
		actions: { type: Array, default: () => [] },
	},
	setup: (props) => () =>
		h('div', { 'data-empty-state': '' }, [
			props.title,
			...(props.actions as EmptyStateAction[]).map((action) =>
				h('button', { onClick: action.onClick }, action.label),
			),
		]),
})

const GLOBALS = {
	DmsCard: slotStub('DmsCard'),
	DmsSegmented: slotStub('DmsSegmented'),
	DmsMeter: slotStub('DmsMeter'),
	DmsEmptyState: EmptyStateStub,
	USkeleton: slotStub('USkeleton'),
	UIcon: slotStub('UIcon'),
}

interface ChartFetchOptions {
	fetchUrl: string
	routeParams: () => Record<string, string>
	periodScope: string
	realtimeTopic: string
}

interface ChartFetchStub {
	data: Ref<unknown>
	isLoading: Ref<boolean>
	error: Ref<unknown>
	refresh: ReturnType<typeof vi.fn>
	options?: ChartFetchOptions
}

let chart: ChartFetchStub

const funnelStep = (id: string, count: number, isMeasured = true) => ({
	id,
	label: `$dms_mailing.funnel.${id}`,
	count,
	rate: count ? 100 : null,
	isMeasured,
})

beforeEach(() => {
	stubNuxtGlobals()
	chart = {
		data: ref(null),
		isLoading: ref(false),
		error: ref(null),
		refresh: vi.fn(),
	}
	vi.stubGlobal('useChartFetch', (options: ChartFetchOptions) => {
		chart.options = options
		return chart
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
	document.body.innerHTML = ''
})

describe('FunnelCard', () => {
	it('reads the funnel of the overview period, again on each sent e-mail', () => {
		mount(FunnelCard, {}, GLOBALS)
		expect(chart.options?.fetchUrl).toContain('/metrics/funnel?kind=')
		expect(chart.options?.periodScope).toBe('mailing-overview')
		expect(chart.options?.realtimeTopic).toBe('mailing:sends')
		expect(chart.options?.routeParams()).toEqual({ kind: 'all' })
	})

	it('says the funnel failed to load and offers a retry', async () => {
		chart.error.value = new Error('500')
		const { host } = mount(FunnelCard, {}, GLOBALS)
		await flush()

		const empty = host.querySelector('[data-empty-state]')
		expect(empty?.textContent).toContain('dms_mailing.funnel_card.error_title')
		expect(host.textContent).not.toContain('dms_mailing.funnel_card.no_drop')

		empty?.querySelector('button')?.click()
		expect(chart.refresh).toHaveBeenCalledTimes(1)
	})

	it('writes "not tracked" in place of the figures nothing measures', async () => {
		chart.data.value = {
			steps: [
				funnelStep('sent', 32),
				funnelStep('delivered', 0, false),
				funnelStep('opened', 0, false),
				funnelStep('clicked', 0, false),
				funnelStep('unsubscribed', 0),
			],
		}
		const { host } = mount(FunnelCard, {}, GLOBALS)
		await flush()

		expect(host.querySelectorAll('[data-funnel-untracked]')).toHaveLength(3)
		expect(host.textContent).toContain('dms_mailing.funnel_card.untracked')
	})
})
