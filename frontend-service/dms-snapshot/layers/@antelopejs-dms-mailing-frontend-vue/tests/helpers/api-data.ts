import { vi } from 'vitest'
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

/** A backend read a component made through `useApiData`. */
export interface ApiRead {
	url: string
	query: Record<string, unknown>
}

export type ApiBackend = (read: ApiRead) => unknown

interface ApiDataOptions {
	query?: MaybeRefOrGetter<Record<string, unknown> | undefined>
	pick?: string[]
	immediate?: boolean
}

export interface ApiDataStub {
	/** Every read made, in order. */
	reads: ApiRead[]
	/** Answers the next reads; a thrown error or a rejection fails them. */
	respond: (backend: ApiBackend) => void
}

function picked(value: unknown, keys: string[] | undefined): unknown {
	if (!keys || !value || typeof value !== 'object') return value
	const source = value as Record<string, unknown>
	return Object.fromEntries(keys.map((key) => [key, source[key]]))
}

/**
 * Stands in for the DMS's `useApiData` (an auto-import the layer's tests do
 * not have): reads the URL, and again whenever it or its query changes, from
 * `respond`'s backend, with the result's `data`, `error`, `status` and
 * `refresh()`; with `immediate: false`, only once `execute()` asks. Whether the server renders it and hands it over is the DMS's
 * and the renderer's, proven on the playground.
 */
export function stubApiData(): ApiDataStub {
	const stub: ApiDataStub = {
		reads: [],
		respond: (next) => {
			backend = next
		},
	}
	let backend: ApiBackend = () => ({})
	vi.stubGlobal(
		'useApiData',
		(
			url: MaybeRefOrGetter<string | null | undefined>,
			options: ApiDataOptions = {},
		) => {
			const data = ref<unknown>(null)
			const error = ref<unknown>(null)
			const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
			const request = () => ({
				url: toValue(url),
				query: toValue(options.query) ?? {},
			})
			async function refresh(): Promise<void> {
				const { url: path, query } = request()
				if (!path) return
				const read = { url: path, query }
				stub.reads.push(read)
				status.value = 'pending'
				try {
					data.value = picked(await backend(read), options.pick)
					error.value = null
					status.value = 'success'
				} catch (failure) {
					error.value = failure
					status.value = 'error'
				}
			}
			// A read made on demand (`immediate: false`) waits for `execute()`.
			if (options.immediate !== false)
				watch(
					() => JSON.stringify(request()),
					() => void refresh(),
					{
						immediate: true,
					},
				)
			return {
				data,
				error,
				status,
				pending: computed(() => status.value === 'pending'),
				refresh,
				execute: refresh,
				clear: () => {
					data.value = null
				},
			}
		},
	)
	return stub
}

/** The DMS's regional formatter, in the zone the tests run in. */
export function stubRegionalFormat(): void {
	vi.stubGlobal('useRegionalFormat', () => ({
		dateTimeFormat: (options: Intl.DateTimeFormatOptions) =>
			new Intl.DateTimeFormat('en', options),
	}))
}

/** The read routes of the mailing API, as a component's tests mock them. */
export interface MailingReadMocks {
	templateContent?: (id: string) => unknown
	performance?: (id: string) => unknown
	changes?: (id: string) => unknown
	versions?: (id: string) => unknown
	listTemplates?: () => unknown
	starters?: () => unknown
	starterPreview?: (id: string, locale?: string) => unknown
	send?: (id: string) => unknown
	sendHtml?: (id: string) => unknown
	provider?: () => unknown
}

type ReadRoute = (
	mocks: MailingReadMocks,
	match: RegExpExecArray,
	read: ApiRead,
) => unknown

const READ_ROUTES: Array<[RegExp, ReadRoute]> = [
	[/^\/api\/mailing\/templates\/starters$/, (m) => m.starters?.()],
	[
		/^\/api\/mailing\/templates\/starters\/([^/]+)\/preview$/,
		(m, [, id], { query }) =>
			m.starterPreview?.(id!, query.locale as string | undefined),
	],
	[
		/^\/api\/mailing\/templates\/([^/]+)\/content$/,
		(m, [, id]) => m.templateContent?.(id!),
	],
	[
		/^\/api\/mailing\/templates\/([^/]+)\/performance$/,
		(m, [, id]) => m.performance?.(id!),
	],
	[
		/^\/api\/mailing\/templates\/([^/]+)\/changes$/,
		(m, [, id]) => m.changes?.(id!),
	],
	[
		/^\/api\/mailing\/templates\/([^/]+)\/versions$/,
		(m, [, id]) => m.versions?.(id!),
	],
	[/^\/api\/mailing\/tables\/templates\/list$/, (m) => m.listTemplates?.()],
	[/^\/api\/mailing\/sends\/([^/]+)\/html$/, (m, [, id]) => m.sendHtml?.(id!)],
	[/^\/api\/mailing\/sends\/([^/]+)$/, (m, [, id]) => m.send?.(id!)],
	[/^\/api\/mailing\/provider$/, (m) => m.provider?.()],
]

/**
 * A backend answering the reads a component makes on demand with the
 * test's mocks of them, and the others (or a read with no mock) with
 * `fallback`.
 */
export function mailingReads(
	mocks: MailingReadMocks,
	fallback: ApiBackend = () => ({}),
): ApiBackend {
	return (read) => {
		for (const [pattern, route] of READ_ROUTES) {
			const match = pattern.exec(read.url)
			const answer = match ? route(mocks, match, read) : undefined
			if (answer !== undefined) return answer
		}
		return fallback(read)
	}
}
