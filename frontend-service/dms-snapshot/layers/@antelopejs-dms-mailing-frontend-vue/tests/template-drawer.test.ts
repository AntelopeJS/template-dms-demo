// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DuplicateModal from '../app/components/DuplicateModal.vue'
import StarterGallery from '../app/components/StarterGallery.vue'
import TemplateDrawer from '../app/components/TemplateDrawer.vue'
import type {
	TemplateContentResponse,
	TemplateRow,
	TemplateStatus,
} from '../app/types/mailing'
import {
	FORM_STUBS,
	flush,
	mount,
	slotStub,
	stubNuxtGlobals,
	typeInto,
	type NuxtStubs,
} from './helpers/nuxt-globals'
import { mailingReads, stubApiData } from './helpers/api-data'

const api = {
	templateContent: vi.fn(),
	performance: vi.fn(),
	publish: vi.fn(),
	unpublish: vi.fn(),
	archive: vi.fn(),
	restore: vi.fn(),
	saveVariables: vi.fn(),
	listTemplates: vi.fn(),
	duplicate: vi.fn(),
	starters: vi.fn(),
	createTemplate: vi.fn(),
	saveTemplateDetails: vi.fn(),
}

vi.mock('../app/composables/useMailingApi', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useMailingApi: () => api,
}))

function row(
	status: TemplateStatus,
	overrides: Partial<TemplateRow> = {},
): TemplateRow {
	return {
		_id: 't1',
		slug: 'order-confirmed',
		name: 'Order confirmation',
		status,
		updatedAt: '2026-10-07T10:00:00Z',
		updatedBy: 'Julie Martin',
		...overrides,
	}
}

function detail(template: TemplateRow): TemplateContentResponse {
	const locales = { en: { subject: 'Hi', preheader: '', blocks: [] } }
	return {
		template,
		content: { locales },
		publishedContent: { locales },
		hasDraft: false,
		version: 12,
		revision: 3,
		changes: [],
		variables: [
			{ path: 'customer.firstName', type: 'string', required: true },
			{ path: 'customer.company', type: 'string', required: false },
		],
		detectedVariables: ['customer.firstName', 'order.trackingUrl'],
		publishedVariables: [
			{ path: 'customer.firstName', type: 'string', required: true },
			{ path: 'customer.company', type: 'string', required: false },
		],
		publishedDetectedVariables: ['customer.firstName', 'order.trackingUrl'],
		testData: {},
		fallbackLocale: 'en',
		categories: [],
		sender: { name: 'Acme', email: 'hello@acme.com', replyTo: '' },
	}
}

interface MenuItem {
	label: string
	onSelect: () => void
}

let menuGroups: MenuItem[][] = []

const DropdownStub = {
	props: { items: { type: Array, default: () => [] } },
	setup(props: { items: MenuItem[][] }) {
		return () => {
			menuGroups = props.items
			return null
		}
	},
}

const globals = {
	...FORM_STUBS,
	UDropdownMenu: DropdownStub,
	DmsBanner: slotStub('DmsBanner'),
	MailingTemplatePreviewFrame: slotStub('MailingTemplatePreviewFrame'),
	DmsCard: slotStub('DmsCard'),
	DmsEmptyState: slotStub('DmsEmptyState'),
}

let stubs: NuxtStubs

let starters: unknown[] = []

beforeEach(() => {
	stubs = stubNuxtGlobals()
	menuGroups = []
	starters = []
	stubApiData().respond(
		mailingReads(
			{
				templateContent: api.templateContent,
				performance: api.performance,
				listTemplates: api.listTemplates,
			},
			({ url }) => {
				if (url === '/api/mailing/templates/categories')
					return { categories: [] }
				if (url === '/api/mailing/templates/starters') return { starters }
				throw new Error(`unexpected read ${url}`)
			},
		),
	)
	api.performance.mockResolvedValue({
		id: 't1',
		slug: 'order-confirmed',
		sends: 6812,
		openRate: 71.9,
		problems: 2,
		lastSentAt: null,
		sources: [{ source: 'checkout', count: 6790 }],
		fallbacks: [{ requested: 'de', used: 'en', count: 4 }],
	})
	Object.values(api).forEach((fn) => fn.mockClear())
	api.publish.mockResolvedValue({ status: 'live', version: 13, changes: [] })
	api.archive.mockResolvedValue({ status: 'archived' })
	api.restore.mockResolvedValue({ status: 'draft' })
	api.saveVariables.mockImplementation(
		async (_id: string, variables: unknown) => ({ variables, revision: 4 }),
	)
})

afterEach(() => {
	vi.unstubAllGlobals()
	document.body.innerHTML = ''
})

const labels = () => menuGroups.flat().map((item) => item.label)

describe('TemplateDrawer', () => {
	it('offers only the valid lifecycle moves', async () => {
		api.templateContent.mockResolvedValue(detail(row('live')))
		const view = mount(TemplateDrawer, { templateId: 't1' }, globals)
		await flush()
		expect(labels()).toEqual([
			'dms_mailing.templates.lifecycle.unpublish',
			'dms_mailing.templates.lifecycle.archive',
			'dms_mailing.templates.actions.real_send',
		])
		view.unmount()
		api.templateContent.mockResolvedValue(detail(row('archived')))
		const archived = mount(TemplateDrawer, { templateId: 't1' }, globals)
		await flush()
		expect(labels()).toEqual(['dms_mailing.templates.lifecycle.restore'])
		archived.unmount()
	})

	it('confirms before publishing the pending draft, then reloads in place', async () => {
		api.templateContent.mockResolvedValue(
			detail(row('live', { isDraftPending: true })),
		)
		const onChanged = vi.fn()
		const view = mount(TemplateDrawer, { templateId: 't1', onChanged }, globals)
		await flush()
		menuGroups.flat()[0]!.onSelect()
		await flush()
		expect(stubs.confirmations[0]?.title).toContain('lifecycle.publish_title')
		const onConfirm = stubs.confirmations[0]?.onConfirm as () => Promise<void>
		await onConfirm()
		expect(api.publish).toHaveBeenCalledWith('t1')
		await flush()
		expect(onChanged).toHaveBeenCalled()
		expect(api.templateContent).toHaveBeenCalledTimes(2)
		view.unmount()
	})

	it('restores at once and hands the row action its callback', async () => {
		api.templateContent.mockResolvedValue(detail(row('archived')))
		const onSuccessCallback = vi.fn()
		const view = mount(
			TemplateDrawer,
			{ rowData: row('archived'), onSuccessCallback },
			globals,
		)
		await flush()
		menuGroups.flat()[0]!.onSelect()
		await flush()
		expect(stubs.confirmations).toEqual([])
		expect(api.restore).toHaveBeenCalledWith('t1')
		expect(onSuccessCallback).toHaveBeenCalled()
		view.unmount()
	})

	it('flags undeclared and unused variables, and declares one in the draft', async () => {
		api.templateContent.mockResolvedValue(detail(row('draft')))
		const view = mount(TemplateDrawer, { templateId: 't1' }, globals)
		await flush()
		const text = view.host.textContent ?? ''
		expect(text).toContain('order.trackingUrl')
		const pills = [...view.host.querySelectorAll('dmsstatuspill')].map((pill) =>
			pill.getAttribute('label'),
		)
		expect(pills).toContain('dms_mailing.templates.drawer.not_declared')
		expect(pills).toContain('dms_mailing.templates.drawer.unused')
		const declare = [...view.host.querySelectorAll('ubutton')].find(
			(button) =>
				button.getAttribute('label') === 'dms_mailing.templates.drawer.declare',
		) as HTMLElement
		declare.click()
		await flush()
		expect(api.saveVariables).toHaveBeenCalledWith(
			't1',
			expect.arrayContaining([
				{ path: 'order.trackingUrl', type: 'string', required: false },
			]),
			3,
		)
		view.unmount()
	})

	it('shows a live template its published contract, not the draft declarations', async () => {
		const live = detail(row('live', { isDraftPending: true }))
		api.templateContent.mockResolvedValue({
			...live,
			hasDraft: true,
			variables: [
				...live.variables,
				{ path: 'order.trackingUrl', type: 'url', required: true },
			],
			changes: [
				{ locale: '', kind: 'variable_added', variable: 'order.trackingUrl' },
			],
		})
		const view = mount(TemplateDrawer, { templateId: 't1' }, globals)
		await flush()
		const pills = [...view.host.querySelectorAll('dmsstatuspill')].map((pill) =>
			pill.getAttribute('label'),
		)
		expect(pills).toContain('dms_mailing.templates.drawer.not_declared')
		const buttons = [...view.host.querySelectorAll('ubutton')].map((button) =>
			button.getAttribute('label'),
		)
		expect(buttons).not.toContain('dms_mailing.templates.drawer.declare')
		const banners = [
			...view.host.querySelectorAll('[data-stub="DmsBanner"]'),
		].map((banner) => banner.getAttribute('title'))
		expect(banners).toContain('dms_mailing.templates.drawer.draft_declarations')
		view.unmount()
	})

	it('reloads after a real send made from its menu', async () => {
		vi.stubGlobal('useModal', () => ({
			open: () => ({
				result: Promise.resolve(true),
				patch: () => undefined,
			}),
		}))
		api.templateContent.mockResolvedValue(detail(row('live')))
		const onChanged = vi.fn()
		const view = mount(TemplateDrawer, { templateId: 't1', onChanged }, globals)
		await flush()
		menuGroups.flat().at(-1)!.onSelect()
		await flush()
		expect(api.templateContent).toHaveBeenCalledTimes(2)
		expect(onChanged).toHaveBeenCalled()
		view.unmount()
	})

	it('opens the send log narrowed to the template', async () => {
		api.templateContent.mockResolvedValue(detail(row('live')))
		const view = mount(TemplateDrawer, { templateId: 't1' }, globals)
		await flush()
		const link = [...view.host.querySelectorAll('ubutton')].find(
			(button) =>
				button.getAttribute('label') ===
				'dms_mailing.templates.drawer.open_send_log',
		) as HTMLElement
		link.click()
		expect(stubs.navigations).toEqual([
			{
				path: '/modules/mailing/sends',
				query: { template: 'order-confirmed' },
			},
		])
		view.unmount()
	})

	it('writes a complete SendTemplate call', async () => {
		api.templateContent.mockResolvedValue({
			...detail(row('live')),
			testData: { customer: { firstName: 'Sofie' } },
		})
		const view = mount(TemplateDrawer, { templateId: 't1' }, globals)
		await flush()
		const snippet = view.host.querySelector('pre')?.textContent ?? ''
		expect(snippet).toContain('await SendTemplate("order-confirmed", {')
		expect(snippet).toContain('tenantId,')
		expect(snippet).toContain('locale: "en",')
		expect(snippet).toContain('firstName: "Sofie"')
		expect(snippet).toContain('trackingUrl:')
		expect(snippet).not.toContain('company')
		view.unmount()
	})

	it('renames the template in place', async () => {
		api.templateContent.mockResolvedValue(detail(row('draft')))
		api.saveTemplateDetails.mockResolvedValue(1)
		const view = mount(TemplateDrawer, { templateId: 't1' }, globals)
		await flush()
		;(
			[...view.host.querySelectorAll('ubutton')].find(
				(button) =>
					button.getAttribute('aria-label') ===
					'dms_mailing.templates.drawer.rename',
			) as HTMLElement
		).click()
		await flush()
		const input = view.host.querySelector('form input') as HTMLInputElement
		await typeInto(input, '  Order shipped ')
		;(view.host.querySelector('form') as HTMLFormElement).dispatchEvent(
			new Event('submit'),
		)
		await flush()
		expect(api.saveTemplateDetails).toHaveBeenCalledWith('t1', {
			name: 'Order shipped',
			slug: 'order-confirmed',
			category: null,
		})
		view.unmount()
	})

	it('opens the editor on the missing locale and lists the callers', async () => {
		api.templateContent.mockResolvedValue(detail(row('live')))
		const view = mount(TemplateDrawer, { templateId: 't1' }, globals)
		await flush()
		const segmented = view.host.querySelector('dmssegmented')
		expect(segmented).not.toBeNull()
		expect(
			view.host.querySelectorAll('dmslistrow')[0]?.getAttribute('title'),
		).toBe('checkout')
		expect(
			view.host.querySelectorAll('dmslistrow')[1]?.getAttribute('title'),
		).toBe('DE → EN')
		view.unmount()
	})
})

describe('DuplicateModal', () => {
	it('prefills a free copy name and slug, then opens the copy', async () => {
		api.listTemplates.mockResolvedValue({
			results: [
				row('live'),
				row('live', {
					_id: 't2',
					slug: 'dms-mailing-duplicate-copy-name-name-order-confirmation',
				}),
			],
			total: 2,
		})
		api.duplicate.mockResolvedValue({ id: 'copy-id' })
		const view = mount(DuplicateModal, { templateId: 't1' }, globals)
		await flush()
		const [name, slug] = [
			...view.host.querySelectorAll('input'),
		] as HTMLInputElement[]
		expect(name!.value).toBe(
			'dms_mailing.duplicate.copy_name name=Order confirmation',
		)
		expect(slug!.value).toBe(
			'dms-mailing-duplicate-copy-name-name-order-confirmation-2',
		)
		await typeInto(name!, 'Order confirmation (B2B)')
		expect(slug!.value).toBe('order-confirmation-b2b')
		;(view.host.querySelector('form') as HTMLFormElement).dispatchEvent(
			new Event('submit'),
		)
		await flush()
		expect(api.duplicate).toHaveBeenCalledWith(
			't1',
			'order-confirmation-b2b',
			'Order confirmation (B2B)',
		)
		expect(stubs.navigations).toEqual([
			{ path: '/modules/mailing/templates/copy-id', query: {} },
		])
		view.unmount()
	})

	it('prefills a valid copy of a template with a long name', async () => {
		const long = row('live', { name: 'x'.repeat(120), slug: 'x'.repeat(64) })
		api.listTemplates.mockResolvedValue({ results: [long], total: 1 })
		const view = mount(DuplicateModal, { templateId: 't1' }, globals)
		await flush()
		const [name, slug] = [
			...view.host.querySelectorAll('input'),
		] as HTMLInputElement[]
		expect(name!.value.length).toBeLessThanOrEqual(120)
		expect(name!.value).toContain('dms_mailing.duplicate.copy_name')
		expect(slug!.value.length).toBeLessThanOrEqual(64)
		view.unmount()
	})
})

describe('StarterGallery', () => {
	beforeEach(() => {
		starters = [
			{
				id: 'order-confirmed',
				name: 'Order confirmation',
				slug: 'order-confirmed',
				category: 'orders',
				locales: ['en'],
			},
		]
	})

	it('creates a starter as a draft and opens it', async () => {
		api.createTemplate.mockResolvedValue(['new-id'])
		const view = mount(StarterGallery, {}, globals)
		await flush()
		;(view.host.querySelector('[data-stub="DmsCard"]') as HTMLElement).click()
		await flush()
		expect(api.createTemplate).toHaveBeenCalledWith({
			name: 'Order confirmation',
			slug: 'order-confirmed',
			category: undefined,
			starterId: 'order-confirmed',
		})
		expect(stubs.navigations).toEqual([
			{ path: '/modules/mailing/templates/new-id', query: {} },
		])
		view.unmount()
	})

	it('falls back to the new template dialog when the slug is taken', async () => {
		api.createTemplate.mockRejectedValue({ statusCode: 409 })
		const view = mount(StarterGallery, {}, globals)
		await flush()
		;(view.host.querySelector('[data-stub="DmsCard"]') as HTMLElement).click()
		await flush()
		expect(stubs.modalCalls[0]?.componentOptions).toEqual({
			initialName: 'Order confirmation',
			initialStarterId: 'order-confirmed',
		})
		view.unmount()
	})
})
