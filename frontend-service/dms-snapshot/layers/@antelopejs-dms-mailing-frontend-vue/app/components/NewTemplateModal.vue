<script setup lang="ts">
import { useTemplateCategories } from '../composables/useTemplateCategories'
import FormFieldRow from '../build/components/FormFieldRow.vue'
import FormRows from '../build/components/FormRows.vue'
import NewTemplateSourceTile from './NewTemplateSourceTile.vue'
import { useLocalizedDefaults } from '../composables/useLocalizedDefaults'
import { useMailingApi } from '../composables/useMailingApi'
import {
	useStartersRead,
	useTemplateListRead,
} from '../composables/useMailingReads'
import {
	HTTP_CONFLICT,
	apiErrorMessage,
	apiErrorStatus,
} from '../utils/api-error'
import { NO_CATEGORY, fromCategoryOption } from '../utils/categories'
import { groupByCategory, matchesSearch } from '../utils/gallery'
import { slugify, validateName, validateSlug } from '../utils/slug'
import { editorRoute } from '../utils/editor-route'
import type { StarterSummary, TemplateRow } from '../types/mailing'
import type { CreateTemplateInput } from '../composables/useMailingApi'

interface NewTemplateModalProps {
	initialName?: string
	/** A starter preselected in "Start from". */
	initialStarterId?: string
	onSuccessCallback?: () => void
}

type SourceKind = 'blank' | 'starter' | 'template'

interface SourceChoice {
	kind: SourceKind
	id?: string
}

interface TilePreview {
	starterId?: string
	templateId?: string
}

interface SourceTile {
	key: string
	choice: SourceChoice
	title: string
	subtitle: string
	preview: TilePreview
	pick: () => void
}

interface TileGroup {
	key: string
	label: string
	icon: string
	tiles: SourceTile[]
}

const BLANK_SOURCE: SourceChoice = { kind: 'blank' }
const ARCHIVED_STATUS = 'archived'
const SEARCH_FIELDS = ['name', 'slug']

const SOURCE_FIELDS: Record<
	SourceKind,
	(id?: string) => Partial<CreateTemplateInput>
> = {
	blank: () => ({}),
	starter: (id) => ({ starterId: id }),
	template: (id) => ({ sourceTemplateId: id }),
}

const props = defineProps<NewTemplateModalProps>()
const emit = defineEmits<{ success: [created?: boolean] }>()

const api = useMailingApi()
const toast = useToast()
const { t } = useI18n()
const { processApiMessage } = useTranslation()

const name = ref(props.initialName ?? '')
const slug = ref(slugify(name.value))
const isSlugEdited = ref(false)
const category = ref(NO_CATEGORY)
const source = ref<SourceChoice>(
	props.initialStarterId
		? { kind: 'starter', id: props.initialStarterId }
		: BLANK_SOURCE,
)
const isSubmitted = ref(false)
const saving = ref(false)
const templates = ref<TemplateRow[]>([])
const readTemplates = useTemplateListRead()
const readStarters = useStartersRead()
const localized = useLocalizedDefaults()
const storedStarters = ref<StarterSummary[]>([])
const starters = computed(() => localized.starters(storedStarters.value))
const { categories } = useTemplateCategories()
const refusedSlugs = ref(new Set<string>())
const templateSearch = ref('')

onMounted(async () => {
	const [templateList, starterList] = await Promise.all([
		readTemplates().catch(() => ({ results: [] as TemplateRow[] })),
		readStarters().catch(() => ({ starters: [] as StarterSummary[] })),
	])
	templates.value = templateList.results
	storedStarters.value = starterList.starters
})

watch(name, (value) => {
	if (!isSlugEdited.value) slug.value = slugify(value)
})

const takenSlugs = computed(
	() =>
		new Set([
			...templates.value.map((template) => template.slug),
			...refusedSlugs.value,
		]),
)

const slugIssue = computed(() => validateSlug(slug.value, takenSlugs.value))
const nameIssue = computed(() => validateName(name.value))

/** A name that gives no slug (non-Latin script): the slug must be typed. */
const isSlugUnderivable = computed(
	() => !isSlugEdited.value && Boolean(name.value.trim()) && !slug.value,
)

const slugError = computed(() => {
	if (isSlugUnderivable.value) {
		return t('dms_mailing.new_template.slug_from_name_empty')
	}
	return slugIssue.value && (slug.value || isSubmitted.value)
		? t(`dms_mailing.templates.slug_errors.${slugIssue.value}`)
		: null
})

const nameError = computed(() =>
	nameIssue.value && isSubmitted.value
		? t(`dms_mailing.templates.name_errors.${nameIssue.value}`)
		: null,
)

const canSubmit = computed(
	() => !slugIssue.value && !nameIssue.value && !saving.value,
)

const categoryItems = computed(() => [
	{ label: t('dms_mailing.templates.uncategorised'), value: NO_CATEGORY },
	...categories.value.map((entry) => ({
		label: entry.label,
		value: entry.id,
		icon: entry.icon,
	})),
])

function isKnownCategory(id: string | null | undefined): id is string {
	return Boolean(id) && categories.value.some((entry) => entry.id === id)
}

function adoptCategory(id: string | null | undefined): void {
	if (category.value === NO_CATEGORY && isKnownCategory(id)) category.value = id
}

function isPicked(choice: SourceChoice): boolean {
	return source.value.kind === choice.kind && source.value.id === choice.id
}

function pickStarter(starter: StarterSummary): void {
	source.value = { kind: 'starter', id: starter.id }
	if (!name.value.trim()) name.value = starter.name
	adoptCategory(starter.category)
}

function pickTemplate(template: TemplateRow): void {
	source.value = { kind: 'template', id: template._id }
	adoptCategory(template.category)
}

const starterTiles = computed<SourceTile[]>(() => [
	{
		key: 'blank',
		choice: BLANK_SOURCE,
		title: t('dms_mailing.templates.start_from.blank'),
		subtitle: t('dms_mailing.templates.start_from.blank_hint'),
		preview: {},
		pick: () => (source.value = BLANK_SOURCE),
	},
	...starters.value.map((starter) => ({
		key: `starter-${starter.id}`,
		choice: { kind: 'starter' as const, id: starter.id },
		title: starter.name,
		subtitle: t('dms_mailing.templates.start_from.starter'),
		preview: { starterId: starter.id },
		pick: () => pickStarter(starter),
	})),
])

const copyableTemplates = computed(() =>
	templates.value.filter((template) => template.status !== ARCHIVED_STATUS),
)

const templateTile = (template: TemplateRow): SourceTile => ({
	key: `template-${template._id}`,
	choice: { kind: 'template', id: template._id },
	title: template.name,
	subtitle: template.slug,
	preview: { templateId: template._id },
	pick: () => pickTemplate(template),
})

/** The templates to copy from, matching the search, by category. */
const templateGroups = computed<TileGroup[]>(() =>
	groupByCategory(
		copyableTemplates.value.filter((template) =>
			matchesSearch(template, templateSearch.value, SEARCH_FIELDS),
		),
		categories.value,
		t('dms_mailing.templates.uncategorised'),
	).map((group) => ({
		key: group.category.id,
		label: group.category.label,
		icon: group.category.icon,
		tiles: group.items.map(templateTile),
	})),
)

/** A cleared slug follows the name again. */
function onSlugInput(value: string): void {
	const typed = value.trim().toLowerCase()
	isSlugEdited.value = typed !== ''
	slug.value = typed || slugify(name.value)
}

function close(created: boolean): void {
	if (created && props.onSuccessCallback) {
		props.onSuccessCallback()
		return
	}
	emit('success', created)
}

function creationInput(): CreateTemplateInput {
	const chosenCategory = fromCategoryOption(category.value)
	return {
		name: name.value.trim(),
		slug: slug.value,
		...(chosenCategory ? { category: chosenCategory } : {}),
		...SOURCE_FIELDS[source.value.kind](source.value.id),
	}
}

function reportFailure(error: unknown): void {
	if (apiErrorStatus(error) === HTTP_CONFLICT) {
		refusedSlugs.value = new Set([...refusedSlugs.value, slug.value])
		return
	}
	toast.add({
		color: 'error',
		title: processApiMessage(apiErrorMessage(error)),
	})
}

async function submit(): Promise<void> {
	isSubmitted.value = true
	if (!canSubmit.value) return
	saving.value = true
	try {
		const [id] = await api.createTemplate(creationInput())
		close(true)
		if (id) await navigateDms(editorRoute(id))
	} catch (error) {
		reportFailure(error)
	} finally {
		saving.value = false
	}
}
</script>

<template>
	<form
		class="flex flex-col gap-5"
		novalidate
		@submit.prevent="submit"
		@keydown.meta.enter.prevent="submit"
		@keydown.ctrl.enter.prevent="submit"
	>
		<FormRows has-required>
			<FormFieldRow
				:label="t('dms_mailing.templates.cols.name')"
				:error="nameError"
				required
			>
				<template #default="{ id }">
					<DmsInputText
						:id="id"
						v-model="name"
						class="w-full"
						autofocus
						:placeholder="t('dms_mailing.new_template.name_placeholder')"
					/>
				</template>
			</FormFieldRow>

			<FormFieldRow
				:label="t('dms_mailing.templates.cols.slug')"
				:help="slugError ? undefined : t('dms_mailing.new_template.slug_help')"
				:error="slugError"
				required
			>
				<template #label-extra>
					<span class="text-dimmed text-xs font-normal">
						{{ t('dms_mailing.new_template.slug_auto') }}
					</span>
				</template>
				<template #default="{ id }">
					<UFieldGroup class="w-full">
						<UBadge
							color="neutral"
							variant="outline"
							size="lg"
							class="text-dimmed font-mono"
							label="SendTemplate("
						/>
						<UInput
							:id="id"
							:model-value="slug"
							class="w-full"
							:ui="{ base: 'font-mono' }"
							:trailing-icon="slugIssue ? undefined : 'i-ph-check-circle'"
							:aria-invalid="Boolean(slugError)"
							@update:model-value="(value: unknown) => onSlugInput(String(value))"
						/>
						<UBadge
							color="neutral"
							variant="outline"
							size="lg"
							class="text-dimmed font-mono"
							label=")"
						/>
					</UFieldGroup>
				</template>
			</FormFieldRow>

			<FormFieldRow :label="t('dms_mailing.templates.cols.category')">
				<template #default="{ id }">
					<DmsSelect
						:id="id"
						v-model="category"
						:items="categoryItems"
						value-key="value"
						:deselectable="false"
						class="w-full"
					/>
				</template>
			</FormFieldRow>

			<FormFieldRow
				:label="t('dms_mailing.templates.start_from.label')"
				:labels-control="false"
			>
				<div
					role="radiogroup"
					:aria-label="t('dms_mailing.templates.start_from.label')"
					class="flex max-h-[360px] flex-col gap-4 overflow-y-auto p-0.5"
				>
					<section class="flex flex-col gap-2">
						<h3 class="text-muted text-xs font-semibold">
							{{ t('dms_mailing.new_template.starters') }}
						</h3>
						<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
							<NewTemplateSourceTile
								v-for="tile in starterTiles"
								:key="tile.key"
								v-bind="tile.preview"
								:title="tile.title"
								:subtitle="tile.subtitle"
								:is-picked="isPicked(tile.choice)"
								:is-blank="tile.choice.kind === 'blank'"
								@pick="tile.pick()"
							/>
						</div>
					</section>
					<section v-if="copyableTemplates.length" class="flex flex-col gap-2">
						<div class="flex items-center gap-2">
							<h3 class="text-muted text-xs font-semibold">
								{{ t('dms_mailing.new_template.existing') }}
							</h3>
							<UInput
								v-model="templateSearch"
								class="ml-auto w-44"
								size="xs"
								icon="i-ph-magnifying-glass"
								:placeholder="t('dms_mailing.new_template.search')"
								:aria-label="t('dms_mailing.new_template.search')"
							/>
						</div>
						<template v-for="group in templateGroups" :key="group.key">
							<span class="text-dimmed flex items-center gap-1.5 text-[11.5px]">
								<UIcon :name="group.icon" class="size-3.5" />
								{{ group.label }}
							</span>
							<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
								<NewTemplateSourceTile
									v-for="tile in group.tiles"
									:key="tile.key"
									v-bind="tile.preview"
									:title="tile.title"
									:subtitle="tile.subtitle"
									:is-picked="isPicked(tile.choice)"
									@pick="tile.pick()"
								/>
							</div>
						</template>
						<p v-if="!templateGroups.length" class="text-dimmed text-xs">
							{{
								t('dms_mailing.templates.empty.no_match_title', {
									search: templateSearch.trim(),
								})
							}}
						</p>
					</section>
				</div>
			</FormFieldRow>
		</FormRows>

		<div class="border-default -mx-1 flex items-center gap-2 border-t pt-4">
			<span class="text-dimmed hidden items-center gap-1 text-xs sm:flex">
				<UKbd value="meta" size="sm" />
				<UKbd value="enter" size="sm" />
				{{ t('dms_mailing.new_template.shortcut') }}
			</span>
			<UButton
				class="ml-auto"
				color="neutral"
				variant="outline"
				:label="t('dms_mailing.common.cancel')"
				@click="close(false)"
			/>
			<UButton
				type="submit"
				icon="i-ph-arrow-right"
				:label="t('dms_mailing.new_template.submit')"
				:loading="saving"
				:disabled="saving"
			/>
		</div>
	</form>
</template>
