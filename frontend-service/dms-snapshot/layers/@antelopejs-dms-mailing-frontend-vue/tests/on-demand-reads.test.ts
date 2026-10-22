import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import {
	useStarterPreviewRead,
	useTemplateContentRead,
	useTemplateListRead,
} from '../app/composables/useMailingReads'
import { stubApiData, type ApiDataStub } from './helpers/api-data'

let reads: ApiDataStub
const options: Record<string, unknown>[] = []

beforeEach(() => {
	reads = stubApiData()
	options.length = 0
	const stubbed = globalThis.useApiData
	vi.stubGlobal(
		'useApiData',
		(url: unknown, readOptions: Record<string, unknown>) => {
			options.push(readOptions)
			return stubbed(url as string, readOptions)
		},
	)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

const inScope = <T>(setup: () => T): T => effectScope().run(setup) as T

describe('reads made on demand', () => {
	it('read nothing until asked, then the current URL each time', async () => {
		reads.respond(({ url }) => ({ url }))
		const id = ref('t1')
		const readContent = inScope(() => useTemplateContentRead(id))
		await Promise.resolve()
		expect(reads.reads).toEqual([])
		expect(options[0]).toMatchObject({
			immediate: false,
			refreshOnPageRefresh: false,
		})

		await expect(readContent()).resolves.toEqual({
			url: '/api/mailing/templates/t1/content',
		})
		id.value = 't2'
		await readContent()
		expect(reads.reads.map((read) => read.url)).toEqual([
			'/api/mailing/templates/t1/content',
			'/api/mailing/templates/t2/content',
		])
	})

	it('reject with what the read failed with', async () => {
		const failure = Object.assign(new Error('gone'), { statusCode: 404 })
		reads.respond(() => Promise.reject(failure))
		const readContent = inScope(() => useTemplateContentRead('t1'))
		await expect(readContent()).rejects.toBe(failure)
	})

	it('send their query with the read', async () => {
		reads.respond(() => ({}))
		const readList = inScope(() => useTemplateListRead())
		const readPreview = inScope(() =>
			useStarterPreviewRead('invoice-ready', 'fr'),
		)
		await readList()
		await readPreview()
		expect(reads.reads).toEqual([
			{
				url: '/api/mailing/tables/templates/list',
				query: { limit: '100', sortKey: 'name' },
			},
			{
				url: '/api/mailing/templates/starters/invoice-ready/preview',
				query: { locale: 'fr' },
			},
		])
	})
})
