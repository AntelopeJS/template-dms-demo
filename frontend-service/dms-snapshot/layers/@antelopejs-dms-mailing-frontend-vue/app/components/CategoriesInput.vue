<script setup lang="ts">
import { useSortableList } from '../composables/useSortableList'
import { useLocalizedDefaults } from '../composables/useLocalizedDefaults'
import { useCategoryUsage } from '../composables/useMailingReads'
import { isMarketingCategory } from '../utils/system-variables'
import {
	CATEGORY_ICONS,
	DEFAULT_CATEGORY_ICON,
	fromCategoryOption,
	iconName,
	keptCategories,
	moveRow,
	newCategoryIcon,
	NO_CATEGORY,
	redirectMoves,
	serializeCategories,
	toStoredCategories,
	withMoves,
	type CategoryEntry,
	type EditableCategory,
} from '../utils/categories'
import type { TemplateCategory } from '../types/mailing'

interface CategoriesInputProps {
	modelValue?: CategoryEntry[] | null
	initialValue?: CategoryEntry[] | null
	disabled?: boolean
}

interface MoveOption {
	value: string
	label: string
}

const props = withDefaults(defineProps<CategoriesInputProps>(), {
	modelValue: null,
	initialValue: null,
	disabled: false,
})

const emit = defineEmits<{
	'update:modelValue': [value: CategoryEntry[]]
}>()

const KEY_PREFIX = 'dms_mailing.settings.categories.'
const HANDLE_SELECTOR = '[data-drag-handle]'
const MOVE_UP = -1
const MOVE_DOWN = 1
const FIELD_NAME = 'categories'
const MOVE_FIELD_ID = 'moveTo'
const MOVE_FIELD_TYPE = 'string'
const MOVE_FIELD_COMPONENT = 'DmsSelect'
const LABEL_PART = 'label'
const ROW_FIELD_UI = { error: 'mt-1 ps-9 text-[12px]' }

const { t } = useI18n()
const localized = useLocalizedDefaults()
const { confirm } = useConfirm()

let nextKey = 0
const keyOf = (): string => `category-${nextKey++}`

const root = ref<HTMLElement | null>(null)
const source = computed(() => props.modelValue ?? props.initialValue ?? [])
const rows = ref<EditableCategory[]>(toRows(source.value))
const removed = ref<CategoryEntry[]>(movesOf(source.value))
const usageRead = useCategoryUsage()
/** Templates per category; none known while the read is missing or failed. */
const usage = computed<Record<string, number>>(() =>
	usageRead.error.value ? {} : (usageRead.data.value?.counts ?? {}),
)
const pickerOpen = ref<string | null>(null)
let lastEmitted = serializeCategories(currentEntries())

const key = (
	path: string,
	params: Record<string, unknown> = {},
	plural = 1,
): string => t(`${KEY_PREFIX}${path}`, params, plural)

/**
 * The form field of a row's label: the server names a refused row by its
 * place in the list, and only that row shows the error, whatever part of
 * the row it names.
 */
const labelFieldName = (index: number): string =>
	`${FIELD_NAME}.${index}.${LABEL_PART}`

const rowErrorPattern = (index: number): RegExp =>
	new RegExp(`^${FIELD_NAME}\\.${index}\\.`)

function toRows(value: CategoryEntry[]): EditableCategory[] {
	return localized.categories(keptCategories(value)).map((category) => ({
		...category,
		key: keyOf(),
		isNew: false,
	}))
}

function movesOf(value: CategoryEntry[]): CategoryEntry[] {
	return value.filter((entry) => entry.moveTo)
}

function currentEntries(): CategoryEntry[] {
	return withMoves(toStoredCategories(rows.value), removed.value)
}

function onEdit(): void {
	const stored = toStoredCategories(rows.value)
	stored.forEach((category, index) => {
		const row = rows.value[index]
		if (row) row.id = category.id
	})
	const entries = withMoves(stored, removed.value)
	lastEmitted = serializeCategories(entries)
	emit('update:modelValue', entries)
}

function addCategory(): void {
	rows.value.push({
		key: keyOf(),
		id: '',
		label: '',
		icon: newCategoryIcon(rows.value),
		isNew: true,
	})
}

/** Templates a row holds once saved: its own, and those moving into it. */
function pendingCount(row: EditableCategory): number {
	if (row.isNew) return 0
	const incoming = removed.value
		.filter((entry) => entry.moveTo === row.id)
		.reduce((total, entry) => total + (usage.value[entry.id] ?? 0), 0)
	return (usage.value[row.id] ?? 0) + incoming
}

function dropRow(row: EditableCategory, target: string): void {
	rows.value = rows.value.filter((entry) => entry.key !== row.key)
	removed.value = redirectMoves(removed.value, row.id, target)
	if (target) removed.value.push({ ...categoryOf(row), moveTo: target })
	onEdit()
}

/** The marketing category carries the campaign rules: it is never removed. */
function isRemovable(row: EditableCategory): boolean {
	return row.isNew || !isMarketingCategory(row.id)
}

function categoryOf(row: EditableCategory): TemplateCategory {
	return { id: row.id, label: row.label, icon: row.icon }
}

function moveOptions(row: EditableCategory): MoveOption[] {
	const targets = rows.value
		.filter((entry) => !entry.isNew && entry.key !== row.key)
		.map((entry) => ({ value: entry.id, label: entry.label }))
	return [{ value: NO_CATEGORY, label: key('move_none') }, ...targets]
}

/** The confirmation field naming where the removed row's templates go. */
function moveField(row: EditableCategory, count: number) {
	return {
		id: MOVE_FIELD_ID,
		label: key('move_to', {}, count),
		type: MOVE_FIELD_TYPE,
		component: {
			componentName: MOVE_FIELD_COMPONENT,
			options: {
				items: moveOptions(row),
				valueKey: 'value',
				deselectable: false,
				icon: 'i-ph-arrow-bend-down-right',
			},
		},
		defaultValue: NO_CATEGORY,
	}
}

async function removeCategory(row: EditableCategory): Promise<void> {
	const count = pendingCount(row)
	if (!count) return dropRow(row, '')
	let target = NO_CATEGORY
	const isConfirmed = await confirm({
		title: key('remove_used_title', { label: row.label }),
		description: key('remove_used_description', { count }, count),
		color: 'warning',
		icon: 'i-ph-tag',
		confirmLabel: key('remove'),
		cancelLabel: t('dms_mailing.common.cancel'),
		initialFocus: 'cancel',
		fields: [moveField(row, count)],
		onConfirm: async (values) => {
			target = String(values[MOVE_FIELD_ID] ?? NO_CATEGORY)
		},
	})
	if (isConfirmed) dropRow(row, fromCategoryOption(target))
}

function pickIcon(row: EditableCategory, icon: string): void {
	row.icon = icon
	pickerOpen.value = null
	onEdit()
}

function usageLabel(row: EditableCategory): string {
	const count = row.isNew ? 0 : (usage.value[row.id] ?? 0)
	return key('usage', { count }, count)
}

/** Moves a row with the arrow keys on its handle, keeping the focus on it. */
async function moveBy(index: number, offset: number): Promise<void> {
	const moved = moveRow(rows.value, index, offset)
	if (moved.index === index) return
	rows.value = moved.rows
	onEdit()
	await nextTick()
	const handles = root.value?.querySelectorAll<HTMLElement>(HANDLE_SELECTOR)
	handles?.[moved.index]?.focus()
}

const rowList = ref<HTMLElement | null>(null)

useSortableList(rowList, () => rows.value, {
	handle: HANDLE_SELECTOR,
	disabled: () => props.disabled,
	onEnd: onEdit,
})

watch(source, (value) => {
	if (serializeCategories(value) === lastEmitted) return
	rows.value = toRows(value)
	removed.value = movesOf(value)
	lastEmitted = serializeCategories(currentEntries())
})

watch(
	() => props.initialValue,
	(value) => {
		const saved = new Set((value ?? []).map((category) => category.id))
		rows.value
			.filter((row) => row.isNew && saved.has(row.id))
			.forEach((row) => (row.isNew = false))
		void usageRead.refresh()
	},
)
</script>

<template>
	<div
		ref="root"
		class="border-default flex flex-col overflow-hidden rounded-lg border"
	>
		<div ref="rowList" class="divide-default flex flex-col divide-y">
			<template v-for="(element, index) in rows" :key="element.key">
				<UFormField
					:name="labelFieldName(index)"
					:error-pattern="rowErrorPattern(index)"
					:ui="ROW_FIELD_UI"
					class="px-3 py-2"
				>
					<div class="flex items-center gap-2.5">
						<UButton
							v-if="!disabled"
							data-drag-handle
							icon="i-ph-dots-six-vertical"
							color="neutral"
							variant="ghost"
							size="xs"
							square
							class="text-dimmed shrink-0 cursor-grab"
							:aria-label="key('drag')"
							aria-keyshortcuts="ArrowUp ArrowDown"
							@keydown.up.prevent="moveBy(index, MOVE_UP)"
							@keydown.down.prevent="moveBy(index, MOVE_DOWN)"
						/>
						<UPopover
							:open="pickerOpen === element.key"
							@update:open="
								(open: boolean) => (pickerOpen = open ? element.key : null)
							"
						>
							<UButton
								color="neutral"
								variant="outline"
								size="sm"
								square
								:icon="element.icon || DEFAULT_CATEGORY_ICON"
								:disabled="disabled"
								:aria-label="key('change_icon')"
							/>
							<template #content>
								<div class="flex flex-col gap-2 p-2.5">
									<DmsEyebrow :label="key('pick_icon')" />
									<div class="grid grid-cols-8 gap-1">
										<UButton
											v-for="icon in CATEGORY_ICONS"
											:key="icon"
											:icon="icon"
											size="sm"
											square
											:color="icon === element.icon ? 'primary' : 'neutral'"
											:variant="icon === element.icon ? 'soft' : 'ghost'"
											:aria-label="key(`icons.${iconName(icon)}`)"
											:title="key(`icons.${iconName(icon)}`)"
											:aria-pressed="icon === element.icon"
											@click="pickIcon(element, icon)"
										/>
									</div>
								</div>
							</template>
						</UPopover>
						<DmsInputText
							v-model="element.label"
							:placeholder="key('label')"
							:disabled="disabled"
							size="sm"
							class="min-w-0 flex-1"
							@update:model-value="onEdit"
						/>
						<span
							class="text-dimmed w-24 shrink-0 text-right font-mono text-[11px]"
						>
							{{ usageLabel(element) }}
						</span>
						<template v-if="!disabled">
							<UButton
								v-if="isRemovable(element)"
								icon="i-ph-x"
								color="neutral"
								variant="ghost"
								size="xs"
								square
								:aria-label="key('remove')"
								@click="removeCategory(element)"
							/>
							<span v-else class="size-6 shrink-0" aria-hidden="true" />
						</template>
					</div>
					<template #error="{ error }">
						<span v-if="error" role="alert">
							{{ error }}
						</span>
					</template>
				</UFormField>
			</template>
		</div>

		<p v-if="!rows.length" class="text-muted px-4 py-3 text-[12.5px]">
			{{ key('empty') }}
		</p>

		<div
			v-if="!disabled"
			class="border-default flex items-center gap-2 border-t px-3 py-2"
		>
			<UButton
				icon="i-ph-plus"
				variant="ghost"
				size="sm"
				:label="key('add')"
				@click="addCategory"
			/>
		</div>
	</div>
</template>
