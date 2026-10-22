<script setup lang="ts">
import { SENDS_PATH } from '../utils/pages'
import { useElementSize } from '@vueuse/core'
import {
	useMailingApi,
	type TemplateDetails,
} from '../composables/useMailingApi'
import {
	useTemplateContentRead,
	useTemplatePerformanceRead,
} from '../composables/useMailingReads'
import { useTemplateDrawer } from '../composables/useTemplateDrawer'
import { apiErrorMessage } from '../utils/api-error'
import { formatCardDate } from '../utils/gallery'
import { localeCoverage } from '../utils/locales'
import { sendSnippet } from '../utils/send-snippet'
import { variableTypeLabelKey } from '../utils/variable-types'
import { validateName } from '../utils/slug'
import {
	validTransitions,
	type LifecycleAction,
} from '../utils/template-attention'
import { editorRoute } from '../utils/editor-route'
import {
	isDeclarationChange,
	mergeVariables,
	publishedContract,
	workingContract,
} from '../utils/variables'
import { systemVariables } from '../utils/system-variables'
import type {
	PreviewResponse,
	TemplateContentResponse,
	TemplatePerformance,
	TemplateRow,
	TemplateStatus,
	VariableDefinition,
	VariableType,
} from '../types/mailing'

/** What the DMS hands a row drawer to step through the rows shown. */
interface DrawerNavigation {
	hasPrev: boolean
	hasNext: boolean
	prev: () => void
	next: () => void
}

interface TemplateDrawerProps {
	rowData?: TemplateRow
	templateId?: string
	onSuccessCallback?: () => void
	navigation?: DrawerNavigation
	/** Called after a change made in place (our own opener refreshes its list). */
	onChanged?: () => void
}

type DrawerTab = 'preview' | 'variables' | 'performance' | 'history'

type ConfirmTone = 'primary' | 'warning'

interface LifecycleSpec {
	icon: string
	run: (id: string) => Promise<unknown>
	/** Absent: the move is harmless and runs at once. */
	confirmColor?: ConfirmTone
}

/** The send log reads these: `?template=` narrows it, `?view=` opens a tab. */
const SENDS_TEMPLATE_KEY = 'template'
const SENDS_VIEW_KEY = 'view'
const PROBLEMS_VIEW = 'problems'
const PREVIEW_WIDTH = 600
const PREVIEW_FALLBACK_SCALE = 0.72
const OPEN_RATE_DIGITS = 1
const PERCENT = 100
const DEFAULT_VARIABLE_TYPE: VariableType = 'string'

const STATUS_TONES: Record<TemplateStatus, string> = {
	live: 'success',
	draft: 'neutral',
	archived: 'warning',
}
const DRAFT_CHANGES_TONE = 'info'

const props = defineProps<TemplateDrawerProps>()
defineEmits<{ success: [changed?: boolean] }>()

const api = useMailingApi()
const toast = useToast()
const { confirm } = useConfirm()
const { t, locale: uiLocale } = useI18n()
const { processApiMessage } = useTranslation()
const { uniqueLocales } = useUniqueLocales()
const overlays = useTemplateDrawer()

const LIFECYCLE: Record<LifecycleAction, LifecycleSpec> = {
	publish: {
		icon: 'i-ph-rocket-launch',
		run: api.publish,
		confirmColor: 'primary',
	},
	unpublish: {
		icon: 'i-ph-arrow-u-up-left',
		run: api.unpublish,
		confirmColor: 'warning',
	},
	archive: { icon: 'i-ph-archive', run: api.archive, confirmColor: 'warning' },
	restore: { icon: 'i-ph-arrow-counter-clockwise', run: api.restore },
}

const templateId = computed(() => props.rowData?._id ?? props.templateId ?? '')
const readContent = useTemplateContentRead(templateId)
const readPerformance = useTemplatePerformanceRead(templateId)
const detail = ref<TemplateContentResponse | null>(null)
const performance = ref<TemplatePerformance | null>(null)
const loading = ref(true)
const tab = ref<DrawerTab>('preview')
const locale = ref('')
const subject = ref('')
const isRenaming = ref(false)
const draftName = ref('')
const previewBox = ref<HTMLElement | null>(null)
const { width: previewBoxWidth } = useElementSize(previewBox)

/** The preview fills the drawer's width, whatever it is. */
const previewScale = computed(() =>
	previewBoxWidth.value
		? Math.min(1, previewBoxWidth.value / PREVIEW_WIDTH)
		: PREVIEW_FALLBACK_SCALE,
)

async function load(): Promise<void> {
	if (!templateId.value) return
	loading.value = true
	try {
		const [content, stats] = await Promise.all([
			readContent(),
			readPerformance().catch(() => null),
		])
		detail.value = content
		performance.value = stats
		locale.value ||= content.fallbackLocale
	} catch (error) {
		toast.add({
			color: 'error',
			title: processApiMessage(apiErrorMessage(error)),
		})
	} finally {
		loading.value = false
	}
}

onMounted(load)

const template = computed(() => detail.value?.template ?? props.rowData ?? null)
const isLive = computed(() => template.value?.status === 'live')
const previewVersion = computed(() => (isLive.value ? 'published' : 'draft'))
const shownContent = computed(() =>
	isLive.value
		? (detail.value?.publishedContent ?? detail.value?.content)
		: detail.value?.content,
)

const coverage = computed(() =>
	localeCoverage(
		Object.keys(shownContent.value?.locales ?? {}),
		uniqueLocales.value.map((entry) => entry.code),
	),
)

const localeItems = computed(() =>
	coverage.value.map((entry) => ({
		label: entry.code.toUpperCase(),
		value: entry.code,
		icon: entry.present ? 'i-ph-check-circle' : 'i-ph-warning-circle',
	})),
)

const isLocaleMissing = computed(() =>
	coverage.value.some((entry) => entry.code === locale.value && !entry.present),
)

/**
 * The contract the tab shows: the published one on a live template (what
 * callers send against), the draft's otherwise.
 */
const contract = computed(() => {
	if (!detail.value) return { variables: [], detected: [] }
	return isLive.value
		? publishedContract(detail.value)
		: workingContract(detail.value)
})

const variables = computed(() =>
	mergeVariables(contract.value.detected, contract.value.variables),
)

/** A live template whose draft changes the declarations, not shown yet. */
const hasDraftDeclarations = computed(
	() =>
		isLive.value && Boolean(detail.value?.changes.some(isDeclarationChange)),
)

/** The footer links' URLs the contract asks of every send. */
const systemVars = computed(() =>
	shownContent.value
		? systemVariables(shownContent.value, template.value?.category)
		: [],
)

const tabs = computed(() => [
	{ label: t('dms_mailing.templates.drawer.tab_preview'), value: 'preview' },
	{
		label: t('dms_mailing.templates.drawer.variables'),
		value: 'variables',
		badge: {
			label: String(variables.value.length + systemVars.value.length),
			color: 'neutral',
			variant: 'soft',
		},
	},
	{
		label: t('dms_mailing.templates.drawer.tab_performance'),
		value: 'performance',
	},
	{ label: t('dms_mailing.history.tab'), value: 'history' },
])

const hasDraftChanges = computed(
	() => isLive.value && Boolean(template.value?.isDraftPending),
)

const statusLabel = computed(() =>
	hasDraftChanges.value
		? t('dms_mailing.templates.card.draft_changes')
		: t(`dms_mailing.templates.status.${template.value?.status ?? 'draft'}`),
)

const statusTone = computed(() =>
	hasDraftChanges.value
		? DRAFT_CHANGES_TONE
		: STATUS_TONES[template.value?.status ?? 'draft'],
)

const editedLine = computed(() => {
	const row = detail.value?.template
	const at = row?.draftUpdatedAt || template.value?.updatedAt
	const by = row?.draftUpdatedBy || template.value?.updatedBy || ''
	return t('dms_mailing.templates.drawer.edited', {
		date: formatCardDate(at, new Date(), uiLocale.value, (date) =>
			t('dms_mailing.common.on_date', { date }),
		),
		name: by,
	})
})

const versionLabel = computed(() =>
	detail.value?.version
		? `v${detail.value.version}`
		: t('dms_mailing.templates.drawer.never_published'),
)

const formatNumber = (value: number) =>
	new Intl.NumberFormat(uiLocale.value, {
		maximumFractionDigits: OPEN_RATE_DIGITS,
	}).format(value)

/** A rate in percent, written the reader's way ("20.8%", "20,8 %"). */
const formatPercent = (value: number) =>
	new Intl.NumberFormat(uiLocale.value, {
		style: 'percent',
		maximumFractionDigits: OPEN_RATE_DIGITS,
	}).format(value / PERCENT)

/** The send log narrowed to this template, on one of its tabs if given. */
function sendLogRoute(view?: string) {
	return {
		path: SENDS_PATH,
		query: {
			[SENDS_TEMPLATE_KEY]: template.value?.slug ?? '',
			...(view ? { [SENDS_VIEW_KEY]: view } : {}),
		},
	}
}

function sendLogUrl(view?: string): string {
	const { path, query } = sendLogRoute(view)
	return `${path}?${new URLSearchParams(query).toString()}`
}

const hasSends = computed(() => Boolean(performance.value?.sends))

const stats = computed(() => [
	{
		id: 'sends',
		eyebrow: t('dms_mailing.templates.drawer.stats_sends'),
		value: formatNumber(performance.value?.sends ?? 0),
	},
	{
		id: 'open',
		eyebrow: t('dms_mailing.templates.drawer.stats_open'),
		value: performance.value?.sends
			? formatPercent(performance.value.openRate)
			: '—',
	},
	{
		id: 'problems',
		eyebrow: t('dms_mailing.templates.drawer.stats_problems'),
		value: formatNumber(performance.value?.problems ?? 0),
		detail: performance.value?.problems
			? t('dms_mailing.templates.drawer.problems_detail')
			: undefined,
		detailTone: 'error' as const,
		to: performance.value?.problems ? sendLogUrl(PROBLEMS_VIEW) : undefined,
	},
])

const snippet = computed(() =>
	sendSnippet({
		slug: template.value?.slug ?? '',
		locale: locale.value || detail.value?.fallbackLocale || '',
		variables: [
			...variables.value.filter((variable) => variable.usage !== 'unused'),
			...systemVars.value,
		],
		testData: detail.value?.testData ?? {},
	}),
)

function reloadInPlace(): void {
	void load()
	props.onChanged?.()
}

function settle(): void {
	if (props.onSuccessCallback) {
		props.onSuccessCallback()
		return
	}
	reloadInPlace()
}

function openSendLog(): void {
	void navigateDms(sendLogRoute())
}

const nameError = computed(() => {
	const issue = isRenaming.value ? validateName(draftName.value) : null
	return issue ? t(`dms_mailing.templates.name_errors.${issue}`) : null
})

/** Writes the name or the category, the other details kept as they are. */
async function saveDetails(changes: Partial<TemplateDetails>): Promise<void> {
	const row = template.value
	if (!row) return
	try {
		await api.saveTemplateDetails(templateId.value, {
			name: row.name,
			slug: row.slug,
			category: row.category || null,
			...changes,
		})
		reloadInPlace()
	} catch (error) {
		toast.add({
			color: 'error',
			title: processApiMessage(apiErrorMessage(error)),
		})
	}
}

function startRename(): void {
	draftName.value = template.value?.name ?? ''
	isRenaming.value = true
}

async function submitRename(): Promise<void> {
	if (nameError.value) return
	const name = draftName.value.trim()
	isRenaming.value = false
	if (name !== template.value?.name) await saveDetails({ name })
}

function onCategoryChange(value: string | null | undefined): void {
	const category = value || null
	if (category !== (template.value?.category || null)) {
		void saveDetails({ category })
	}
}

function openEditor(targetLocale?: string): void {
	void navigateDms(editorRoute(templateId.value, targetLocale))
}

async function confirmed(action: LifecycleAction): Promise<boolean> {
	const spec = LIFECYCLE[action]
	const run = async () => {
		await spec.run(templateId.value)
	}
	if (!spec.confirmColor) {
		await run()
		return true
	}
	return confirm({
		title: t(`dms_mailing.templates.lifecycle.${action}_title`, {
			name: template.value?.name ?? '',
		}),
		description: t(`dms_mailing.templates.lifecycle.${action}_description`),
		color: spec.confirmColor,
		icon: spec.icon,
		confirmLabel: t(`dms_mailing.templates.lifecycle.${action}_confirm`),
		cancelLabel: t('dms_mailing.common.cancel'),
		onConfirm: run,
	})
}

async function runLifecycle(action: LifecycleAction): Promise<void> {
	try {
		if (!(await confirmed(action))) return
		toast.add({
			color: 'success',
			title: t(`dms_mailing.templates.lifecycle.${action}_done`),
		})
		settle()
	} catch (error) {
		toast.add({
			color: 'error',
			title: processApiMessage(apiErrorMessage(error)),
		})
	}
}

const menuItems = computed(() => {
	const row = template.value
	if (!row) return []
	const moves = validTransitions(row).map((action) => ({
		label: t(`dms_mailing.templates.lifecycle.${action}`),
		icon: LIFECYCLE[action].icon,
		onSelect: () => void runLifecycle(action),
	}))
	const send = isLive.value
		? [
				{
					label: t('dms_mailing.templates.actions.real_send'),
					icon: 'i-ph-paper-plane-right',
					color: 'error' as const,
					onSelect: () =>
						overlays.openRealSend(templateId.value, {
							rowData: row,
							onDone: reloadInPlace,
						}),
				},
			]
		: []
	return [moves, send].filter((group) => group.length)
})

/** Declares a path in the draft, which the tab shows on a template not live. */
async function declareVariable(path: string): Promise<void> {
	if (!detail.value) return
	const next: VariableDefinition[] = [
		...detail.value.variables,
		{ path, type: DEFAULT_VARIABLE_TYPE, required: false },
	]
	try {
		const response = await api.saveVariables(
			templateId.value,
			next,
			detail.value.revision,
		)
		detail.value.variables = response.variables
		detail.value.revision = response.revision
	} catch (error) {
		toast.add({
			color: 'error',
			title: processApiMessage(apiErrorMessage(error)),
		})
		reloadInPlace()
	}
}

/**
 * Copies a version into the draft. Customers keep the live version: the
 * editor's review publishes the restored draft.
 */
async function restoreVersion(version: number): Promise<void> {
	try {
		await api.restoreVersion(templateId.value, version, detail.value?.revision)
		toast.add({
			color: 'success',
			title: t('dms_mailing.history.restored', { version }),
			description: t('dms_mailing.history.restored_description'),
			actions: [
				{
					label: t('dms_mailing.templates.actions.open_editor'),
					onClick: () => openEditor(),
				},
			],
		})
	} catch (error) {
		toast.add({
			color: 'error',
			title: processApiMessage(apiErrorMessage(error)),
		})
	}
	reloadInPlace()
}

function onResolved(preview: PreviewResponse): void {
	subject.value = preview.subject
}
</script>

<template>
	<div class="flex w-[30rem] max-w-full flex-col">
		<USkeleton v-if="loading && !template" class="h-64 w-full" />

		<template v-else-if="template">
			<div class="flex flex-col gap-1.5 pb-3">
				<div class="flex items-center gap-1">
					<DmsEyebrow :label="t('dms_mailing.templates.drawer.eyebrow')" />
					<div class="ml-auto flex items-center gap-0.5">
						<template v-if="navigation">
							<UButton
								icon="i-ph-caret-up"
								color="neutral"
								variant="ghost"
								size="sm"
								square
								:disabled="!navigation.hasPrev"
								:aria-label="t('dms_mailing.templates.drawer.previous')"
								@click="navigation.prev()"
							/>
							<UButton
								icon="i-ph-caret-down"
								color="neutral"
								variant="ghost"
								size="sm"
								square
								:disabled="!navigation.hasNext"
								:aria-label="t('dms_mailing.templates.drawer.next')"
								@click="navigation.next()"
							/>
						</template>
						<UDropdownMenu
							v-if="menuItems.length"
							:items="menuItems"
							:content="{ align: 'end' }"
						>
							<UButton
								icon="i-ph-dots-three"
								color="neutral"
								variant="ghost"
								size="sm"
								square
								:aria-label="t('dms_mailing.templates.drawer.more')"
							/>
						</UDropdownMenu>
					</div>
				</div>
				<form
					v-if="isRenaming"
					class="flex items-start gap-1.5"
					@submit.prevent="submitRename"
					@keydown.esc.stop="isRenaming = false"
				>
					<UFormField class="min-w-0 flex-1" :error="nameError ?? undefined">
						<DmsInputText
							v-model="draftName"
							class="w-full"
							autofocus
							:aria-label="t('dms_mailing.templates.cols.name')"
						/>
					</UFormField>
					<UButton
						type="submit"
						icon="i-ph-check"
						size="sm"
						square
						:aria-label="t('dms_mailing.templates.drawer.rename')"
					/>
					<UButton
						icon="i-ph-x"
						color="neutral"
						variant="ghost"
						size="sm"
						square
						:aria-label="t('dms_mailing.common.cancel')"
						@click="isRenaming = false"
					/>
				</form>
				<h3
					v-else
					class="text-highlighted flex min-w-0 flex-wrap items-center gap-2 text-[17px] font-[650] tracking-[-0.02em] [overflow-wrap:anywhere]"
				>
					{{ template.name }}
					<DmsStatusPill
						:tone="statusTone"
						:label="statusLabel"
						:dot="isLive ? 'live' : 'static'"
					/>
					<UButton
						icon="i-ph-pencil-simple"
						color="neutral"
						variant="ghost"
						size="xs"
						square
						:aria-label="t('dms_mailing.templates.drawer.rename')"
						@click="startRename"
					/>
				</h3>
				<p class="text-muted text-[12.5px] [overflow-wrap:anywhere]">
					<span class="font-mono">{{ template.slug }}</span>
					· {{ versionLabel }} · {{ editedLine }}
				</p>
				<div class="flex items-center gap-2 pt-1">
					<span class="text-muted shrink-0 text-[12.5px]">
						{{ t('dms_mailing.templates.drawer.category') }}
					</span>
					<MailingCategoryInput
						class="min-w-0 flex-1"
						:model-value="template.category ?? null"
						@update:model-value="onCategoryChange"
					/>
				</div>
			</div>

			<UTabs
				v-model="tab"
				:items="tabs"
				:content="false"
				variant="link"
				size="sm"
				class="border-default -mx-1 border-b"
			/>

			<div v-show="tab === 'preview'" class="flex flex-col gap-3 py-4">
				<div class="flex items-center justify-between gap-2">
					<DmsSegmented
						v-if="localeItems.length > 1"
						v-model="locale"
						:items="localeItems"
						size="xs"
						:aria-label="t('dms_mailing.test_send.locale')"
					/>
					<span
						v-if="subject"
						class="text-muted min-w-0 truncate text-[12.5px]"
						:title="subject"
					>
						{{ t('dms_mailing.templates.drawer.subject', { subject }) }}
					</span>
				</div>
				<div
					class="border-default bg-elevated/40 overflow-hidden rounded-lg border p-3"
				>
					<div ref="previewBox" class="flex justify-center">
						<MailingTemplatePreviewFrame
							:template-id="templateId"
							:locale="locale"
							:version="previewVersion"
							:width="PREVIEW_WIDTH"
							:scale="previewScale"
							:label="template.name"
							@resolved="onResolved"
						/>
					</div>
				</div>
				<DmsBanner
					v-if="isLocaleMissing"
					tone="warning"
					size="sm"
					icon="i-ph-translate"
					:title="
						t('dms_mailing.templates.drawer.missing_title', {
							locale: locale.toUpperCase(),
						})
					"
					:description="
						t('dms_mailing.templates.drawer.missing_description', {
							locale: locale.toUpperCase(),
							fallback: (detail?.fallbackLocale ?? '').toUpperCase(),
						})
					"
				>
					<template #actions>
						<UButton
							color="neutral"
							variant="outline"
							size="xs"
							:label="
								t('dms_mailing.templates.drawer.create_short', {
									locale: locale.toUpperCase(),
								})
							"
							@click="openEditor(locale)"
						/>
					</template>
				</DmsBanner>
			</div>

			<div v-show="tab === 'variables'" class="flex flex-col gap-4 py-4">
				<div class="flex flex-col gap-1">
					<DmsEyebrow
						:label="t('dms_mailing.templates.drawer.declared_detected')"
					/>
					<p v-if="!variables.length" class="text-muted text-[12.5px]">
						{{ t('dms_mailing.templates.drawer.no_variables') }}
					</p>
					<div
						v-for="variable in variables"
						:key="variable.path"
						class="border-default flex min-h-9 items-center gap-2 border-b last:border-b-0"
					>
						<code
							class="truncate font-mono text-[12px]"
							:class="
								variable.usage === 'unused' ? 'text-dimmed' : 'text-toned'
							"
						>
							{{ variable.path }}
						</code>
						<span
							v-if="variable.required && variable.usage !== 'detected'"
							class="text-error"
							:title="t('dms_mailing.templates.drawer.required')"
						>
							*
						</span>
						<DmsStatusPill
							v-if="variable.usage === 'detected'"
							tone="warning"
							size="sm"
							dot="none"
							:label="t('dms_mailing.templates.drawer.not_declared')"
						/>
						<DmsStatusPill
							v-if="variable.usage === 'unused'"
							tone="neutral"
							size="sm"
							dot="none"
							:label="t('dms_mailing.templates.drawer.unused')"
						/>
						<UButton
							v-if="variable.usage === 'detected' && !isLive"
							class="ml-auto"
							color="neutral"
							variant="ghost"
							size="xs"
							:label="t('dms_mailing.templates.drawer.declare')"
							@click="declareVariable(variable.path)"
						/>
						<span
							v-else-if="variable.usage !== 'detected'"
							class="text-dimmed ml-auto font-mono text-[11px]"
						>
							{{ t(variableTypeLabelKey(variable.type)) }}
						</span>
					</div>
				</div>
				<DmsBanner
					v-if="hasDraftDeclarations"
					tone="info"
					size="sm"
					icon="i-ph-brackets-curly"
					:title="t('dms_mailing.templates.drawer.draft_declarations')"
					:description="
						t('dms_mailing.templates.drawer.draft_declarations_description')
					"
				>
					<template #actions>
						<UButton
							color="neutral"
							variant="outline"
							size="xs"
							:label="t('dms_mailing.templates.actions.open_editor')"
							@click="openEditor()"
						/>
					</template>
				</DmsBanner>
				<MailingSystemVariables :variables="systemVars" />
				<div class="flex flex-col gap-1.5">
					<div class="flex items-center justify-between">
						<DmsEyebrow
							:label="t('dms_mailing.templates.drawer.call_from_code')"
						/>
						<DmsCopyButton :value="snippet" />
					</div>
					<pre
						class="bg-elevated text-toned overflow-x-auto rounded-md p-3 font-mono text-[11.5px] leading-relaxed"
						>{{ snippet }}</pre>
				</div>
			</div>

			<div v-show="tab === 'performance'" class="flex flex-col gap-4 py-4">
				<div class="flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<DmsEyebrow
							:label="t('dms_mailing.templates.drawer.last_30_days')"
						/>
						<UButton
							variant="link"
							size="xs"
							class="p-0"
							:label="t('dms_mailing.templates.drawer.open_send_log')"
							@click="openSendLog"
						/>
					</div>
					<DmsStatGroup
						layout="joined"
						:columns="3"
						:items="stats"
						:loading="loading"
					/>
				</div>
				<div class="flex flex-col gap-1">
					<DmsEyebrow :label="t('dms_mailing.templates.drawer.called_from')" />
					<p
						v-if="!hasSends || !performance?.sources.length"
						class="text-muted text-[12.5px]"
					>
						{{ t('dms_mailing.templates.drawer.no_sources') }}
					</p>
					<DmsListRow
						v-for="source in performance?.sources ?? []"
						:key="source.source"
						icon="i-ph-code"
						size="sm"
						mono
						:title="
							source.source || t('dms_mailing.templates.drawer.unknown_source')
						"
						:trailing="
							t(
								'dms_mailing.templates.drawer.sends_count',
								{ count: formatNumber(source.count) },
								source.count,
							)
						"
					/>
				</div>
				<div class="flex flex-col gap-1">
					<DmsEyebrow :label="t('dms_mailing.templates.drawer.fallbacks')" />
					<p v-if="!hasSends" class="text-muted text-[12.5px]">
						{{ t('dms_mailing.templates.drawer.no_sources') }}
					</p>
					<p
						v-else-if="!performance?.fallbacks.length"
						class="text-muted text-[12.5px]"
					>
						{{ t('dms_mailing.templates.drawer.no_fallbacks') }}
					</p>
					<DmsListRow
						v-for="fallback in performance?.fallbacks ?? []"
						:key="`${fallback.requested}-${fallback.used}`"
						icon="i-ph-translate"
						tone="warning"
						size="sm"
						:title="`${fallback.requested.toUpperCase()} → ${fallback.used.toUpperCase()}`"
						:trailing="
							t(
								'dms_mailing.templates.drawer.sends_count',
								{ count: formatNumber(fallback.count) },
								fallback.count,
							)
						"
					/>
				</div>
			</div>

			<div v-if="tab === 'history'" class="flex flex-col gap-2 py-4">
				<p class="text-muted text-[12.5px]">
					{{ t('dms_mailing.history.intro') }}
				</p>
				<MailingVersionHistory
					:template-id="templateId"
					:current-version="detail?.version ?? 0"
					:status="template.status"
					:locale="locale"
					:restore="restoreVersion"
				/>
			</div>

			<div
				class="border-default bg-default sticky bottom-0 -mx-1 mt-auto flex items-center gap-2 border-t px-1 py-3"
			>
				<UButton
					icon="i-ph-flask"
					color="neutral"
					variant="ghost"
					:label="t('dms_mailing.templates.card.test')"
					@click="overlays.openTestSend(templateId, { locale })"
				/>
				<UButton
					class="ml-auto"
					icon="i-ph-copy"
					color="neutral"
					variant="outline"
					:label="t('dms_mailing.templates.actions.duplicate')"
					@click="overlays.openDuplicate(templateId, { rowData: template })"
				/>
				<UButton
					icon="i-ph-pencil-simple"
					:label="t('dms_mailing.templates.actions.open_editor')"
					@click="openEditor(locale)"
				/>
			</div>
		</template>
	</div>
</template>
