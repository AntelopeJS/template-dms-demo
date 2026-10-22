import { toValue, type MaybeRefOrGetter } from 'vue'
import {
	mailingPath,
	TEMPLATE_LIST_LIMIT,
	type CategoriesResponse,
	type CategoryUsageResponse,
	type ChangesResponse,
	type StarterPreviewResponse,
	type StartersResponse,
	type TemplateListResponse,
	type TemplateOverviewResponse,
	type VersionsResponse,
} from './useMailingApi'
import type { SetupFacts } from '../utils/overview-setup'
import type { WebhookStatus } from '../utils/webhook-status'
import type {
	ProviderInfo,
	RetentionPreview,
	SendDetailResponse,
	SendHtmlResponse,
	TemplateContentResponse,
	TemplatePerformance,
} from '../types/mailing'

/**
 * The module's reads, through `useApiData`. The ones a page renders: a server
 * render reads them and hands them to the browser with the page, and the
 * components showing one request share it. The ones a drawer, a dialog or the
 * editor makes when it opens or asks: `ReadOnDemand`. Writes go through
 * `useMailingApi`.
 */

/** The e-mail provider the page header names; nothing read while `enabled` is false. */
export function useProviderInfo(
	enabled: MaybeRefOrGetter<boolean>,
): ApiDataResult<ProviderInfo> {
	return useApiData<ProviderInfo>(() =>
		toValue(enabled) ? mailingPath('provider') : null,
	)
}

/** What the overview's setup checklist is made of. */
export function useSetupFacts(): ApiDataResult<SetupFacts> {
	return useApiData<SetupFacts>(mailingPath('metrics', 'setup'))
}

/** The webhook's last event and last refused call. */
export function useWebhookStatus(): ApiDataResult<WebhookStatus> {
	return useApiData<WebhookStatus>(mailingPath('settings', 'webhook-status'))
}

/** What a retention of `days` deletes, and when; nothing read without days. */
export function useRetentionPreview(
	days: MaybeRefOrGetter<number | null>,
): ApiDataResult<RetentionPreview> {
	return useApiData<RetentionPreview>(
		() => (toValue(days) ? mailingPath('settings', 'retention-preview') : null),
		{ query: () => ({ days: String(toValue(days)) }) },
	)
}

/** How many templates each category holds. */
export function useCategoryUsage(): ApiDataResult<CategoryUsageResponse> {
	return useApiData<CategoryUsageResponse>(
		mailingPath('settings', 'category-usage'),
	)
}

/** The tenant's template categories, as stored. */
export function useStoredCategories(): ApiDataResult<CategoriesResponse> {
	return useApiData<CategoriesResponse>(mailingPath('templates', 'categories'))
}

/**
 * Each template's sends and rates, for the gallery's cards: read again with
 * the gallery's rows, rather than with the page.
 */
export function useTemplatesOverview(): ApiDataResult<TemplateOverviewResponse> {
	return useApiData<TemplateOverviewResponse>(
		mailingPath('templates', 'overview'),
		{ refreshOnPageRefresh: false },
	)
}

/**
 * How many templates the tenant has, whatever the gallery's filters: the
 * list route's total, without its rows. Read again with the gallery's rows.
 */
export function useTemplateTotal(): ApiDataResult<
	Pick<TemplateListResponse, 'total'>
> {
	return useApiData<Pick<TemplateListResponse, 'total'>>(
		mailingPath('tables', 'templates', 'list'),
		{ query: { limit: '1' }, pick: ['total'], refreshOnPageRefresh: false },
	)
}

/** The starter templates the module ships. */
export function useStarters(): ApiDataResult<StartersResponse> {
	return useApiData<StartersResponse>(mailingPath('templates', 'starters'))
}

/** The query of a read made on demand. */
type ReadQuery = MaybeRefOrGetter<Record<string, string> | undefined>

/**
 * A read a drawer, a dialog, a preview frame or the editor makes when it
 * opens or asks, through `useApiData` with `immediate: false`: the call reads
 * the current URL and resolves with its answer, or rejects with what the read
 * failed with. The caller keeps the answer, so the page's refreshes leave it.
 */
export type ReadOnDemand<T> = () => Promise<T>

function useReadOnDemand<T>(
	url: MaybeRefOrGetter<string | null>,
	query?: ReadQuery,
): ReadOnDemand<T> {
	const read = useApiData<T>(url, {
		query,
		immediate: false,
		refreshOnPageRefresh: false,
	})
	return async () => {
		await read.execute({ dedupe: 'defer' })
		if (read.error.value) throw read.error.value
		return read.data.value as T
	}
}

/** A template's path below `/templates/<id>`; none without an id. */
const templatePath =
	(id: MaybeRefOrGetter<string>, segment: string) => (): string | null =>
		toValue(id) ? mailingPath('templates', toValue(id), segment) : null

/** The template's record, its draft and published content, for a drawer or the editor. */
export function useTemplateContentRead(
	id: MaybeRefOrGetter<string>,
): ReadOnDemand<TemplateContentResponse> {
	return useReadOnDemand(templatePath(id, 'content'))
}

/** The template's sends and rates. */
export function useTemplatePerformanceRead(
	id: MaybeRefOrGetter<string>,
): ReadOnDemand<TemplatePerformance> {
	return useReadOnDemand(templatePath(id, 'performance'))
}

/** What publishing the template's draft would change. */
export function useTemplateChangesRead(
	id: MaybeRefOrGetter<string>,
): ReadOnDemand<ChangesResponse> {
	return useReadOnDemand(templatePath(id, 'changes'))
}

/** The template's published versions. */
export function useTemplateVersionsRead(
	id: MaybeRefOrGetter<string>,
): ReadOnDemand<VersionsResponse> {
	return useReadOnDemand(templatePath(id, 'versions'))
}

/** Every template of the tenant, by name, for the slugs a new one must avoid. */
export function useTemplateListRead(): ReadOnDemand<TemplateListResponse> {
	return useReadOnDemand(mailingPath('tables', 'templates', 'list'), {
		limit: TEMPLATE_LIST_LIMIT,
		sortKey: 'name',
	})
}

/** The starter templates, for a dialog. */
export function useStartersRead(): ReadOnDemand<StartersResponse> {
	return useReadOnDemand(mailingPath('templates', 'starters'))
}

/** A starter's preview, in `locale` when given. */
export function useStarterPreviewRead(
	starterId: MaybeRefOrGetter<string | undefined>,
	locale: MaybeRefOrGetter<string | undefined>,
): ReadOnDemand<StarterPreviewResponse> {
	return useReadOnDemand(
		() => {
			const id = toValue(starterId)
			return id ? mailingPath('templates', 'starters', id, 'preview') : null
		},
		() => {
			const value = toValue(locale)
			return value ? { locale: value } : undefined
		},
	)
}

/** A send's path below `/sends`; none without an id. */
const sendPath =
	(id: MaybeRefOrGetter<string>, ...segments: string[]) =>
	(): string | null =>
		toValue(id) ? mailingPath('sends', toValue(id), ...segments) : null

/** A send with its events and the template it used. */
export function useSendRead(
	id: MaybeRefOrGetter<string>,
): ReadOnDemand<SendDetailResponse> {
	return useReadOnDemand(sendPath(id))
}

/** The e-mail a send rendered. */
export function useSendHtmlRead(
	id: MaybeRefOrGetter<string>,
): ReadOnDemand<SendHtmlResponse> {
	return useReadOnDemand(sendPath(id, 'html'))
}

/** The e-mail provider and the tracking it reports, for a drawer. */
export function useProviderRead(): ReadOnDemand<ProviderInfo> {
	return useReadOnDemand(mailingPath('provider'))
}

/** The reads the editor makes when it asks: what publishing would change, and the template's figures. */
export interface EditorReads {
	changes: ReadOnDemand<ChangesResponse>
	performance: ReadOnDemand<TemplatePerformance>
}

export function useEditorReads(id: MaybeRefOrGetter<string>): EditorReads {
	return {
		changes: useTemplateChangesRead(id),
		performance: useTemplatePerformanceRead(id),
	}
}
