// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, onBeforeUnmount } from 'vue'
import OverviewGate from '../app/components/OverviewGate.vue'
import { useSetupHidesPeriod } from '../app/composables/useOverviewSetup'
import type { SetupFacts } from '../app/utils/overview-setup'
import { stubApiData, type ApiDataStub } from './helpers/api-data'
import { flush, mount, slotStub, stubNuxtGlobals } from './helpers/nuxt-globals'

let api: ApiDataStub
const SETUP_URL = '/api/mailing/metrics/setup'

interface ButtonAction {
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
			...(props.actions as ButtonAction[]).map((action) =>
				h('button', { onClick: action.onClick }, action.label),
			),
		]),
})

const ButtonStub = defineComponent({
	props: { label: { type: String, default: '' } },
	emits: ['click'],
	setup:
		(props, { emit }) =>
		() =>
			h('button', { onClick: () => emit('click') }, props.label),
})

const ListRowStub = defineComponent({
	props: { title: { type: String, default: '' } },
	setup:
		(props, { slots }) =>
		() =>
			h('div', { 'data-step': props.title }, [
				slots.leading?.(),
				slots.trailing?.(),
			]),
})

const Dashboard = defineComponent({
	setup: () => () => h('div', { 'data-dashboard': '' }),
})

const Gate = defineComponent({
	setup: () => () => h(OverviewGate, null, { default: () => h(Dashboard) }),
})

/** What the page header renders of the period selector. */
const PeriodHolder = defineComponent({
	props: { scope: { type: String, default: undefined } },
	setup: (props) => {
		const hidesPeriod = useSetupHidesPeriod(props.scope)
		return () => h('span', { 'data-hides-period': String(hidesPeriod.value) })
	},
})

const GLOBALS = {
	DmsCard: slotStub('DmsCard'),
	DmsEmptyState: EmptyStateStub,
	DmsIconWell: slotStub('DmsIconWell'),
	DmsListRow: ListRowStub,
	UButton: ButtonStub,
	UPopover: slotStub('UPopover'),
	USkeleton: slotStub('USkeleton'),
	UIcon: slotStub('UIcon'),
}

const facts = (overrides: Partial<SetupFacts> = {}): SetupFacts => ({
	isProviderConnected: true,
	isSenderSet: true,
	liveTemplateCount: 1,
	hasTestSend: true,
	...overrides,
})

beforeEach(() => {
	stubNuxtGlobals()
	vi.stubGlobal('onBeforeUnmount', onBeforeUnmount)
	vi.stubGlobal('holdPageHeaderActions', () =>
		defineComponent({ setup: () => () => null }),
	)
	api = stubApiData()
})

afterEach(() => {
	vi.unstubAllGlobals()
	document.body.innerHTML = ''
})

describe('OverviewGate', () => {
	it('mounts nothing of the dashboard before the facts are known', () => {
		api.respond(() => new Promise(() => undefined))
		const { host } = mount(Gate, {}, GLOBALS)
		expect(host.querySelector('[data-dashboard]')).toBeNull()
		expect(host.querySelector('[data-stub="USkeleton"]')).not.toBeNull()
	})

	it('says the facts failed to load and retries', async () => {
		api.respond(() => Promise.reject(new Error('500')))
		const { host } = mount(Gate, {}, GLOBALS)
		await flush()
		expect(host.querySelector('[data-dashboard]')).toBeNull()
		expect(api.reads).toEqual([{ url: SETUP_URL, query: {} }])
		api.respond(() => facts())
		host.querySelector<HTMLButtonElement>('[data-empty-state] button')?.click()
		await flush()
		expect(host.querySelector('[data-dashboard]')).not.toBeNull()
	})

	it('holds the dashboard and the period back while nothing can be sent', async () => {
		api.respond(() => facts({ liveTemplateCount: 0 }))
		const { host } = mount(Gate, {}, GLOBALS)
		await flush()
		expect(host.querySelector('[data-dashboard]')).toBeNull()
		expect(host.querySelectorAll('[data-step]')).toHaveLength(4)
	})

	it('hides the overview header period from the same facts, on no other page', async () => {
		api.respond(() => facts({ liveTemplateCount: 0 }))
		const overview = mount(PeriodHolder, { scope: 'mailing-overview' })
		const sends = mount(PeriodHolder, { scope: 'mailing-sends' })
		await flush()
		expect(overview.host.innerHTML).toContain('data-hides-period="true"')
		expect(sends.host.innerHTML).toContain('data-hides-period="false"')
		expect(api.reads).toEqual([{ url: SETUP_URL, query: {} }])
	})

	it('lets an unfinished setup be resumed above the dashboard', async () => {
		api.respond(() => facts({ hasTestSend: false }))
		const { host } = mount(Gate, {}, GLOBALS)
		await flush()
		expect(host.querySelector('[data-dashboard]')).not.toBeNull()
		expect(host.querySelector('[data-step]')).toBeNull()
		const resume = [...host.querySelectorAll('button')].find((button) =>
			button.textContent?.includes('dms_mailing.setup.resume'),
		)
		resume?.click()
		await flush()
		expect(host.querySelectorAll('[data-step]')).toHaveLength(4)
		expect(host.querySelector('[data-dashboard]')).not.toBeNull()
	})

	it('takes the props the page renderer adds without a fragment warning', async () => {
		api.respond(() => facts())
		const warnings: string[] = []
		const app = createApp(() =>
			h(
				OverviewGate,
				{ childCount: 0, routeParams: {} },
				{ default: () => h(Dashboard) },
			),
		)
		Object.entries(GLOBALS).forEach(([name, value]) =>
			app.component(name, value),
		)
		app.config.warnHandler = (message) => warnings.push(message)
		app.mount(document.body.appendChild(document.createElement('div')))
		await flush()
		app.unmount()
		expect(
			warnings.filter((message) =>
				message.includes('Extraneous non-props attributes'),
			),
		).toEqual([])
	})

	it('offers no resume once every step is done', async () => {
		api.respond(() => facts())
		const { host } = mount(Gate, {}, GLOBALS)
		await flush()
		expect(host.textContent).not.toContain('dms_mailing.setup.resume')
	})
})
