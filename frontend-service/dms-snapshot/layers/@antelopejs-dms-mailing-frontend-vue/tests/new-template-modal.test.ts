// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NewTemplateModal from '../app/components/NewTemplateModal.vue'
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
	listTemplates: vi.fn(),
	starters: vi.fn(),
	createTemplate: vi.fn(),
}

vi.mock('../app/composables/useMailingApi', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useMailingApi: () => api,
}))

const globals = {
	...FORM_STUBS,
	MailingTemplatePreviewFrame: slotStub('MailingTemplatePreviewFrame'),
}

let stubs: NuxtStubs

beforeEach(() => {
	stubs = stubNuxtGlobals()
	api.listTemplates.mockResolvedValue({
		results: [
			{
				_id: 't1',
				name: 'Welcome',
				slug: 'welcome',
				status: 'live',
				category: 'account',
			},
		],
		total: 1,
	})
	api.starters.mockResolvedValue({
		starters: [
			{
				id: 'invoice-ready',
				name: 'Invoice available',
				slug: 'invoice-ready',
				category: 'billing',
				locales: ['en'],
			},
		],
	})
	stubApiData().respond(
		mailingReads(
			{ listTemplates: api.listTemplates, starters: api.starters },
			({ url }) => {
				if (url !== '/api/mailing/templates/categories')
					throw new Error(`unexpected read ${url}`)
				return {
					categories: [
						{ id: 'billing', label: 'Billing', icon: 'i-ph-file-text' },
					],
				}
			},
		),
	)
	api.createTemplate.mockResolvedValue(['new-id'])
})

afterEach(() => {
	vi.unstubAllGlobals()
	document.body.innerHTML = ''
})

const inputs = (host: HTMLElement) => [...host.querySelectorAll('input')]
const fields = (host: HTMLElement) =>
	[...host.querySelectorAll('[data-stub="UFormField"]')] as HTMLElement[]

describe('NewTemplateModal', () => {
	it('derives the slug from the name until the slug is edited', async () => {
		const view = mount(NewTemplateModal, {}, globals)
		await flush()
		const [name, slug] = inputs(view.host)
		await typeInto(name!, 'Quote accepted')
		expect((slug as HTMLInputElement).value).toBe('quote-accepted')
		await typeInto(slug!, 'quote-ok')
		await typeInto(name!, 'Quote accepted for real')
		expect((slug as HTMLInputElement).value).toBe('quote-ok')
		view.unmount()
	})

	it('asks for a slug when the name gives none, and derives it again once cleared', async () => {
		const view = mount(NewTemplateModal, {}, globals)
		await flush()
		const [name, slug] = inputs(view.host)
		await typeInto(name!, '日本語のテンプレート')
		expect(fields(view.host)[1]!.getAttribute('error')).toBe(
			'dms_mailing.new_template.slug_from_name_empty',
		)
		await typeInto(name!, 'Quote accepted')
		await typeInto(slug!, 'quote-ok')
		await typeInto(slug!, '')
		expect((slug as HTMLInputElement).value).toBe('quote-accepted')
		await typeInto(name!, 'Quote refused')
		expect((slug as HTMLInputElement).value).toBe('quote-refused')
		view.unmount()
	})

	it('lists the starters apart from the templates to copy, archived ones left out', async () => {
		api.listTemplates.mockResolvedValue({
			results: [
				{ _id: 't1', name: 'Welcome', slug: 'welcome', status: 'live' },
				{ _id: 't2', name: 'Invoice', slug: 'invoice', status: 'draft' },
				{ _id: 't3', name: 'Old', slug: 'old', status: 'archived' },
			],
			total: 3,
		})
		const view = mount(NewTemplateModal, {}, globals)
		await flush()
		const titles = () =>
			[...view.host.querySelectorAll('section')].map((section) =>
				[...section.querySelectorAll('button[role="radio"]')].map(
					(tile) => tile.querySelector('span:nth-of-type(2)')?.textContent,
				),
			)
		expect(titles()).toEqual([
			['dms_mailing.templates.start_from.blank', 'Invoice available'],
			['Welcome', 'Invoice'],
		])
		const search = inputs(view.host)[2]!
		await typeInto(search, 'welc')
		expect(titles()[1]).toEqual(['Welcome'])
		view.unmount()
	})

	it('refuses a taken slug inline, before the server does', async () => {
		const view = mount(NewTemplateModal, { initialName: 'Welcome' }, globals)
		await flush()
		expect(fields(view.host)[1]!.getAttribute('error')).toBe(
			'dms_mailing.templates.slug_errors.taken',
		)
		;(view.host.querySelector('form') as HTMLFormElement).dispatchEvent(
			new Event('submit'),
		)
		await flush()
		expect(api.createTemplate).not.toHaveBeenCalled()
		view.unmount()
	})

	it('creates from a starter and opens the editor of the new template', async () => {
		const view = mount(NewTemplateModal, {}, globals)
		await flush()
		const starter = [
			...view.host.querySelectorAll('button[role="radio"]'),
		].find((tile) =>
			tile.textContent?.includes('Invoice available'),
		) as HTMLElement
		starter.click()
		await flush()
		expect((inputs(view.host)[0] as HTMLInputElement).value).toBe(
			'Invoice available',
		)
		;(view.host.querySelector('form') as HTMLFormElement).dispatchEvent(
			new Event('submit'),
		)
		await flush()
		expect(api.createTemplate).toHaveBeenCalledWith({
			name: 'Invoice available',
			slug: 'invoice-available',
			category: 'billing',
			starterId: 'invoice-ready',
		})
		expect(stubs.navigations).toEqual([
			{ path: '/modules/mailing/templates/new-id', query: {} },
		])
		view.unmount()
	})

	it('marks the slug taken when the server answers 409', async () => {
		api.createTemplate.mockRejectedValue({ statusCode: 409 })
		const view = mount(NewTemplateModal, { initialName: 'Refund' }, globals)
		await flush()
		;(view.host.querySelector('form') as HTMLFormElement).dispatchEvent(
			new Event('submit'),
		)
		await flush()
		expect(fields(view.host)[1]!.getAttribute('error')).toBe(
			'dms_mailing.templates.slug_errors.taken',
		)
		expect(stubs.toasts).toEqual([])
		view.unmount()
	})

	it('copies an existing template when one is picked', async () => {
		const onSuccessCallback = vi.fn()
		const view = mount(
			NewTemplateModal,
			{ initialName: 'Welcome B2B', onSuccessCallback },
			globals,
		)
		await flush()
		const tile = [...view.host.querySelectorAll('button[role="radio"]')].find(
			(candidate) => candidate.textContent?.includes('welcome'),
		) as HTMLElement
		tile.click()
		;(view.host.querySelector('form') as HTMLFormElement).dispatchEvent(
			new Event('submit'),
		)
		await flush()
		expect(api.createTemplate).toHaveBeenCalledWith({
			name: 'Welcome B2B',
			slug: 'welcome-b2b',
			sourceTemplateId: 't1',
		})
		expect(onSuccessCallback).toHaveBeenCalled()
		view.unmount()
	})
})
