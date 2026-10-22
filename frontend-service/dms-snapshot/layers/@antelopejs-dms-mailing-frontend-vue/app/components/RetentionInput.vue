<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import { useRetentionPreview } from '../composables/useMailingReads'
import {
	clampRetention,
	CLOCK_FORMAT,
	isWithinADay,
	MAX_RETENTION_DAYS,
	MIN_RETENTION_DAYS,
	RETENTION_CUSTOM,
	RETENTION_PRESETS,
	retentionChoice,
} from '../utils/period'
import type { RetentionPreview } from '../types/mailing'

interface RetentionInputProps {
	modelValue?: number | string | null
	initialValue?: number | string | null
	disabled?: boolean
}

const props = withDefaults(defineProps<RetentionInputProps>(), {
	modelValue: null,
	initialValue: null,
	disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const KEY_PREFIX = 'dms_mailing.settings.retention.'
const PREVIEW_DEBOUNCE_MS = 300
const DAYS_PER_YEAR = 365
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	month: 'short',
	day: 'numeric',
}

const { t, locale } = useI18n()
const { dateTimeFormat } = useRegionalFormat()
const { confirm } = useConfirm()
const form = useEnclosingForm()

function toDays(value: number | string | null | undefined): number | null {
	const raw = Number(value)
	return Number.isFinite(raw) && raw > 0 ? raw : null
}

const days = computed(() => toDays(props.modelValue ?? props.initialValue))
const savedDays = computed(() => toDays(props.initialValue))

const isCustomPicked = ref(false)
let lastEmitted: number | null = null
let confirmedDays: number | null = null
const isCustom = computed(
	() =>
		isCustomPicked.value ||
		(days.value !== null && retentionChoice(days.value) === RETENTION_CUSTOM),
)
/** The days the preview reads, once the choice holds still. */
const previewDays = refDebounced(days, PREVIEW_DEBOUNCE_MS)
const previewRead = useRetentionPreview(previewDays)
/** A failed read shows no preview. */
const preview = computed<RetentionPreview | null>(() =>
	previewRead.error.value ? null : previewRead.data.value,
)

const key = (
	path: string,
	params: Record<string, unknown> = {},
	plural = 1,
): string => t(`${KEY_PREFIX}${path}`, params, plural)

const presetLabel = (preset: number): string =>
	preset === DAYS_PER_YEAR
		? key('one_year')
		: key('days', { count: preset }, preset)

const items = computed(() => [
	...RETENTION_PRESETS.map((preset) => ({
		value: String(preset),
		label: presetLabel(preset),
	})),
	{ value: RETENTION_CUSTOM, label: key('custom') },
])

const choice = computed<string>({
	get: () => (isCustom.value ? RETENTION_CUSTOM : String(days.value ?? '')),
	set: (value) => {
		isCustomPicked.value = value === RETENTION_CUSTOM
		if (!isCustomPicked.value) emitDays(Number(value))
	},
})

function emitDays(value: number): void {
	lastEmitted = value
	emit('update:modelValue', value)
}

function onCustomInput(value: number | null | undefined): void {
	if (value === null || value === undefined) return
	emitDays(clampRetention(value))
}

function previewParams(value: RetentionPreview): Record<string, unknown> {
	return {
		when: isWithinADay(value.nextRunAt, new Date())
			? key('tonight')
			: dateTimeFormat(DATE_FORMAT).format(new Date(value.nextRunAt)),
		time: dateTimeFormat(CLOCK_FORMAT).format(new Date(value.nextRunAt)),
		count: new Intl.NumberFormat(locale.value).format(value.count),
		duration: key('days', { count: value.days }, value.days),
	}
}

const previewText = computed(() => {
	const value = preview.value
	if (!value) return ''
	const params = previewParams(value)
	return value.count
		? key('preview', params, value.count)
		: key('preview_none', params)
})

/** The preview of the days now picked, when it deletes sends kept so far. */
const deletion = computed<RetentionPreview | null>(() => {
	const value = preview.value
	const isShorter =
		days.value !== null &&
		savedDays.value !== null &&
		days.value < savedDays.value
	return isShorter && value?.days === days.value && value.count ? value : null
})

async function confirmDeletion(value: RetentionPreview): Promise<void> {
	const isConfirmed = await confirm({
		title: key('confirm_title'),
		description: key('confirm_description', previewParams(value), value.count),
		color: 'warning',
		icon: 'i-ph-trash',
		confirmLabel: key('confirm_action'),
		cancelLabel: t('dms_mailing.common.cancel'),
		initialFocus: 'cancel',
	})
	if (!isConfirmed) return
	confirmedDays = value.days
	await form?.submit()
}

/** Holds a save that deletes sends until it is confirmed. */
function guardSubmit(): boolean {
	const value = deletion.value
	if (!value || confirmedDays === value.days) return true
	void confirmDeletion(value)
	return false
}

watch(
	() => props.modelValue,
	(value) => {
		if (toDays(value) !== lastEmitted) isCustomPicked.value = false
	},
)

form?.addValidator(guardSubmit)
</script>

<template>
	<div class="flex flex-col gap-2">
		<div class="flex flex-wrap items-center gap-2">
			<DmsSegmented
				v-model="choice"
				:items="items"
				:disabled="disabled"
				overflow="wrap"
				:aria-label="key('label')"
			/>
			<UInputNumber
				v-if="isCustom"
				:model-value="days ?? undefined"
				:min="MIN_RETENTION_DAYS"
				:max="MAX_RETENTION_DAYS"
				:disabled="disabled"
				size="sm"
				class="w-36"
				@update:model-value="onCustomInput"
			/>
			<span v-if="isCustom" class="text-muted text-[12.5px]">
				{{ key('days_unit') }}
			</span>
		</div>
		<UAlert
			v-if="deletion"
			color="warning"
			variant="soft"
			icon="i-ph-warning"
			:description="previewText"
		/>
		<p v-else-if="previewText" class="text-dimmed text-[12px]">
			{{ previewText }}
		</p>
	</div>
</template>
