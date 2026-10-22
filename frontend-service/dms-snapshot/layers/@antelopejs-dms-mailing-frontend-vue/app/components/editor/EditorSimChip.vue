<script setup lang="ts">
interface Props {
	value: boolean
	/** Evaluated from the test data (Data mode): shown, not clickable. */
	isLocked?: boolean
}

interface ChipOption {
	value: boolean
	label: string
}

defineProps<Props>()
const emit = defineEmits<{ update: [boolean] }>()

const { t } = useI18n()

const options: ChipOption[] = [
	{ value: true, label: t('dms_mailing.editor.condition.simulate_true') },
	{ value: false, label: t('dms_mailing.editor.condition.simulate_false') },
]
</script>

<template>
	<span
		class="inline-flex rounded-[5px] border border-amber-600/35 bg-white p-px"
		:title="
			isLocked
				? t('dms_mailing.editor.condition.sim_locked')
				: t('dms_mailing.editor.condition.sim_hint')
		"
		@click.stop
	>
		<button
			v-for="option in options"
			:key="String(option.value)"
			type="button"
			class="rounded px-1.5 leading-4"
			:class="[
				option.value === value
					? 'bg-amber-600 text-white'
					: 'text-amber-800/70',
				isLocked ? 'cursor-default' : 'cursor-pointer',
			]"
			:disabled="isLocked"
			@click="emit('update', option.value)"
		>
			{{ option.label }}
		</button>
	</span>
</template>
