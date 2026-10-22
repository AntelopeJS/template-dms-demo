<script setup lang="ts">
import { useTemplateCategories } from '../composables/useTemplateCategories'
import { useEventListener } from '@vueuse/core'
import {
	useTemplatesOverview,
	useTemplateTotal,
} from '../composables/useMailingReads'
import { useTemplateDrawer } from '../composables/useTemplateDrawer'
import {
	groupByCategory,
	isAttentionView,
	isNarrowed,
	searchTermOf,
	sortKeyOf,
	userFilterKeys,
	type CategoryGroup,
	type GalleryContext,
} from '../utils/gallery'
import { attentionReasons } from '../utils/template-attention'
import { editorRoute } from '../utils/editor-route'
import { TEMPLATES_PATH } from '../utils/pages'
import type {
	TemplateCategory,
	TemplateRow,
	TemplateStats,
} from '../types/mailing'

interface TemplateGalleryProps {
	context: GalleryContext<TemplateRow>
}

type GalleryState = 'loading' | 'first_run' | 'empty' | 'no_attention' | 'grid'

type StateRule = [GalleryState, () => boolean]

const FIRST_PAGE = 1
const PAGES_MODE = 'pages'
const SKELETON_CARDS = 3
const NEW_TEMPLATE_KEY = 'n'
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
const OPEN_OVERLAY_SELECTOR = '[role="dialog"], [role="menu"]'
/** The table's default sort: the only one the category groups keep. */
const DEFAULT_SORT_KEY = 'updatedAt'
const FLAT_GROUP: TemplateCategory = { id: 'all', label: '', icon: '' }
/** The tab "Show all templates" leaves the attention tab for. */
const ALL_TAB = 'all'

const props = defineProps<TemplateGalleryProps>()

const { t } = useI18n()
const overlays = useTemplateDrawer()

const { categories } = useTemplateCategories()
const overview = useTemplatesOverview()
const total = useTemplateTotal()

/** Each template's figures; none for a failed read. */
const statsById = computed(
	() =>
		new Map<string, TemplateStats>(
			(overview.error.value ? [] : (overview.data.value?.items ?? [])).map(
				(entry) => [entry.id, entry],
			),
		),
)
/** How many templates the tenant has; unknown while read or once failed. */
const templateCount = computed<number | null>(() =>
	total.error.value ? null : (total.data.value?.total ?? null),
)

/** The template count and the figures, read again with the rows. */
function refreshFigures(): void {
	void overview.refresh()
	void total.refresh()
}

/** The page of the table on screen: its query and its page index. */
const viewKeyOf = (): string =>
	JSON.stringify([props.context.query, props.context.pagination.pageIndex])

/** The view whose rows are on screen; none while the first rows load. */
let shownViewKey = props.context.loading ? null : viewKeyOf()

/**
 * New rows for the same page and query come from a refresh (the table's
 * button, a realtime change): the template count and the figures are reloaded
 * with them.
 */
watch(
	() => props.context.items,
	() => {
		const viewKey = viewKeyOf()
		const isRefresh = viewKey === shownViewKey
		shownViewKey = viewKey
		if (!isRefresh) return
		refreshFigures()
	},
)

const isAttentionTab = computed(() => isAttentionView(props.context.query))

const isGrouped = computed(
	() =>
		(sortKeyOf(props.context.query) ?? DEFAULT_SORT_KEY) === DEFAULT_SORT_KEY,
)

const groups = computed<CategoryGroup<TemplateRow>[]>(() =>
	isGrouped.value
		? groupByCategory(
				props.context.items,
				categories.value,
				t('dms_mailing.templates.uncategorised'),
			)
		: [{ category: FLAT_GROUP, items: props.context.items }],
)

/** The cards in the order drawn, for the drawer's previous / next. */
const drawnItems = computed(() => groups.value.flatMap((group) => group.items))

const search = computed(() => searchTermOf(props.context.query))
const narrowed = computed(() => isNarrowed(props.context.query))
const hasNoItems = computed(() => !props.context.items.length)

const STATE_RULES: StateRule[] = [
	['loading', () => props.context.loading && hasNoItems.value],
	[
		'loading',
		() => hasNoItems.value && !narrowed.value && templateCount.value === null,
	],
	[
		'first_run',
		() => hasNoItems.value && !narrowed.value && templateCount.value === 0,
	],
	[
		'no_attention',
		() => isAttentionTab.value && hasNoItems.value && !narrowed.value,
	],
	['empty', () => hasNoItems.value],
]

const state = computed<GalleryState>(
	() => STATE_RULES.find(([, matches]) => matches())?.[0] ?? 'grid',
)

const page = computed({
	get: () => props.context.pagination.pageIndex + FIRST_PAGE,
	set: (value: number) => props.context.pagination.setPage(value - FIRST_PAGE),
})

const isPaged = computed(
	() => (props.context.pagination.mode ?? PAGES_MODE) === PAGES_MODE,
)

const emptyTitle = computed(() =>
	search.value
		? t('dms_mailing.templates.empty.no_match_title', { search: search.value })
		: t('dms_mailing.templates.empty.view_title'),
)

const emptyDescription = computed(() =>
	search.value
		? t('dms_mailing.templates.empty.no_match_description')
		: t('dms_mailing.templates.empty.view_description'),
)

/** The rows, and with them the template count and the figures. */
function refreshAll(): void {
	void props.context.refresh()
}

function openRow(row: TemplateRow): void {
	if (props.context.actions) {
		props.context.actions.open(row)
		return
	}
	void navigateDms(editorRoute(row._id))
}

function openLocale(row: TemplateRow, code: string): void {
	void navigateDms(editorRoute(row._id, code))
}

function openNewTemplate(initialName?: string): void {
	overlays.openNewTemplate({ initialName, onDone: refreshAll })
}

function showAllTemplates(): void {
	void navigateDms({ path: TEMPLATES_PATH, query: { tab: ALL_TAB } })
}

function resetFilters(): void {
	const table = props.context.table
	table?.setGlobalFilter('')
	if (!table || userFilterKeys(props.context.query).length) {
		void navigateDms({ path: TEMPLATES_PATH })
	}
}

function isTypingTarget(target: EventTarget | null): boolean {
	const element = target as HTMLElement | null
	if (!element) return false
	return element.isContentEditable || TYPING_TAGS.has(element.tagName)
}

useEventListener(
	typeof document === 'undefined' ? undefined : document,
	'keydown',
	(event: KeyboardEvent) => {
		if (event.key.toLowerCase() !== NEW_TEMPLATE_KEY) return
		if (event.metaKey || event.ctrlKey || event.altKey) return
		if (isTypingTarget(event.target)) return
		if (document.querySelector(OPEN_OVERLAY_SELECTOR)) return
		event.preventDefault()
		openNewTemplate()
	},
)
</script>

<template>
	<div class="flex flex-col gap-6 p-4">
		<div
			v-if="state === 'loading'"
			class="grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-4"
			aria-busy="true"
		>
			<DmsCard
				v-for="index in SKELETON_CARDS"
				:key="index"
				:padded="false"
				class="overflow-hidden"
			>
				<USkeleton class="h-[172px] w-full rounded-none" />
				<div class="flex flex-col gap-2 p-3.5">
					<USkeleton class="h-3 w-3/5" />
					<USkeleton class="h-2.5 w-2/5" />
				</div>
			</DmsCard>
		</div>

		<MailingStarterGallery
			v-else-if="state === 'first_run'"
			@created="refreshAll"
		/>

		<DmsEmptyState
			v-else-if="state === 'empty'"
			:title="emptyTitle"
			:description="emptyDescription"
			variant="no-result"
			icon="i-ph-magnifying-glass"
			size="lg"
			hatched
		>
			<template #actions>
				<UButton
					v-if="narrowed"
					icon="i-ph-x"
					color="neutral"
					variant="outline"
					size="sm"
					:label="t('dms_mailing.templates.empty.reset')"
					@click="resetFilters"
				/>
				<UButton
					icon="i-ph-plus"
					size="sm"
					:label="
						search
							? t('dms_mailing.templates.empty.create_named', { name: search })
							: t('dms_mailing.templates.actions.create')
					"
					@click="openNewTemplate(search || undefined)"
				/>
			</template>
		</DmsEmptyState>

		<DmsEmptyState
			v-else-if="state === 'no_attention'"
			:title="t('dms_mailing.templates.attention.none_title')"
			:description="t('dms_mailing.templates.attention.none_description')"
			icon="i-ph-check-circle"
			tone="success"
			size="md"
			:actions="[
				{
					label: t('dms_mailing.templates.attention.show_all'),
					color: 'neutral',
					variant: 'outline',
					onClick: showAllTemplates,
				},
			]"
		/>

		<template v-else>
			<section
				v-for="(group, index) in groups"
				:key="group.category.id"
				class="flex flex-col gap-3"
			>
				<div v-if="isGrouped" class="flex items-center gap-2">
					<UIcon :name="group.category.icon" class="text-dimmed size-4" />
					<h2 class="text-highlighted text-[13px] font-semibold">
						{{ group.category.label }}
					</h2>
					<span class="text-dimmed font-mono text-[11.5px]">
						{{ group.items.length }}
					</span>
					<span class="bg-(--ui-border) ml-2 h-px flex-1" />
				</div>
				<div class="grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-4">
					<MailingTemplateCard
						v-for="template in group.items"
						:key="template._id"
						:template="template"
						:stats="statsById.get(template._id)"
						:attention="attentionReasons(template)"
						@open="openRow(template)"
						@open-locale="(code: string) => openLocale(template, code)"
						@details="
							overlays.openDetails(template, {
								rows: drawnItems,
								onDone: refreshAll,
							})
						"
						@test-send="overlays.openTestSend(template._id)"
						@real-send="
							overlays.openRealSend(template._id, {
								rowData: template,
								onDone: refreshAll,
							})
						"
					/>
					<button
						v-if="index === groups.length - 1"
						type="button"
						class="border-default text-muted hover:border-primary/60 hover:text-highlighted focus-visible:outline-primary rounded-(--dms-radius-card) flex min-h-[260px] flex-col items-center justify-center gap-2 border border-dashed text-[13px] font-medium transition-colors focus-visible:outline-2"
						@click="openNewTemplate()"
					>
						<DmsIconWell icon="i-ph-plus" size="md" />
						{{ t('dms_mailing.templates.gallery.new_tile') }}
						<span class="text-dimmed text-[11.5px] font-normal">
							{{ t('dms_mailing.templates.gallery.new_tile_hint') }}
						</span>
					</button>
				</div>
			</section>
		</template>

		<div
			v-if="isPaged && context.pagination.total > context.pagination.pageSize"
			class="flex justify-end"
		>
			<UPagination
				v-model:page="page"
				:items-per-page="context.pagination.pageSize"
				:total="context.pagination.total"
			/>
		</div>
		<div
			v-else-if="!isPaged && context.pagination.hasMore"
			class="flex justify-center"
		>
			<UButton
				color="neutral"
				variant="outline"
				size="sm"
				:loading="context.loading"
				:label="t('dms_mailing.templates.gallery.load_more')"
				@click="context.pagination.loadMore?.()"
			/>
		</div>
	</div>
</template>
