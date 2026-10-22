<script setup lang="ts">
import { languageLabel } from '../utils/locales'

interface LocaleSelectProps {
	modelValue?: string | null
	initialValue?: string | null
	disabled?: boolean
}

interface LocaleDefinition {
	code: string
	name?: string
}

interface LocaleOption {
	label: string
	value: string
}

const props = withDefaults(defineProps<LocaleSelectProps>(), {
	modelValue: null,
	initialValue: null,
	disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const LIST_SEPARATOR = ', '

const { t, locale } = useI18n()
const { uniqueLocales } = useUniqueLocales()
const { report } = useControlError()

const selected = computed(() => props.modelValue ?? props.initialValue ?? '')

const workspaceLocales = computed<LocaleDefinition[]>(
	() => uniqueLocales.value as LocaleDefinition[],
)

function optionOf(entry: LocaleDefinition): LocaleOption {
	return {
		value: entry.code,
		label: languageLabel(entry.code, locale.value, entry.name),
	}
}

const items = computed<LocaleOption[]>(() => {
	const options = workspaceLocales.value.map(optionOf)
	const isKnown = options.some((option) => option.value === selected.value)
	return isKnown || !selected.value
		? options
		: [...options, optionOf({ code: selected.value })]
})

/** A stored locale the workspace does not write in: it cannot be saved. */
const isForeign = computed(
	() =>
		!!selected.value &&
		workspaceLocales.value.length > 0 &&
		!workspaceLocales.value.some((entry) => entry.code === selected.value),
)

watch(
	isForeign,
	(value) =>
		report(
			value ? t('dms_mailing.settings.locale.not_in_workspace') : undefined,
		),
	{ immediate: true },
)

const hint = computed(() =>
	t('dms_mailing.settings.locale.workspace', {
		locales: workspaceLocales.value
			.map((entry) => entry.code.toUpperCase())
			.join(LIST_SEPARATOR),
	}),
)
</script>

<template>
	<div class="flex flex-col gap-1.5">
		<DmsSelect
			:model-value="selected || undefined"
			:items="items"
			value-key="value"
			:deselectable="false"
			icon="i-ph-translate"
			:disabled="disabled"
			:placeholder="t('dms_mailing.settings.locale.placeholder')"
			class="w-full max-w-[260px]"
			@update:model-value="(value: string) => emit('update:modelValue', value)"
		/>
		<p v-if="workspaceLocales.length" class="text-dimmed text-[12px]">
			{{ hint }}
		</p>
	</div>
</template>
