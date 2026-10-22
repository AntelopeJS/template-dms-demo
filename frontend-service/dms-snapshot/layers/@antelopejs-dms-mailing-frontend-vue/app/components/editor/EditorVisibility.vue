<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Block, Condition } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'

interface Props {
	block: Block
}

const props = defineProps<Props>()

const KEY = 'dms_mailing.editor.visibility'
const ALWAYS = 'always'
const ONLY_IF = 'only_if'

const { t } = useI18n()
const { editor, session } = useEditorContext()

const items = computed(() => [
	{ value: ALWAYS, label: t(`${KEY}.always`) },
	{ value: ONLY_IF, label: t(`${KEY}.only_if`) },
])

const isPickingPath = ref(false)

watch(
	() => props.block.id,
	() => (isPickingPath.value = false),
)

function firstPath(): string {
	return editor.variables[0]?.path ?? session.detected[0] ?? ''
}

function setRule(rule: Condition | null): void {
	editor.updateBlock(props.block.id, { visibleIf: rule })
}

function ruleOn(path: string): Condition {
	return { path, operator: 'truthy', value: '' }
}

function startRule(): void {
	const path = firstPath()
	isPickingPath.value = !path
	if (path) setRule(ruleOn(path))
}

function pickPath(value: unknown): void {
	const path = String(value ?? '').trim()
	if (!path) return
	isPickingPath.value = false
	setRule(ruleOn(path))
}

const mode = computed({
	get: () => (props.block.visibleIf || isPickingPath.value ? ONLY_IF : ALWAYS),
	set: (value: string | number | undefined) => {
		if (value === ONLY_IF) return startRule()
		isPickingPath.value = false
		setRule(null)
	},
})
</script>

<template>
	<div class="flex flex-col gap-2">
		<p class="text-highlighted text-sm font-medium">{{ t(`${KEY}.label`) }}</p>
		<DmsSegmented
			v-model="mode"
			size="xs"
			:items="items"
			:aria-label="t(`${KEY}.label`)"
			class="w-full"
		/>
		<UFormField
			v-if="isPickingPath && !block.visibleIf"
			:help="t(`${KEY}.pick_path_help`)"
			size="sm"
		>
			<USelectMenu
				:items="[]"
				create-item
				icon="i-ph-brackets-curly"
				class="w-full font-mono"
				size="sm"
				:placeholder="t(`${KEY}.pick_path`)"
				:aria-label="t(`${KEY}.pick_path`)"
				@update:model-value="pickPath"
				@create="pickPath"
			/>
		</UFormField>
		<MailingEditorConditionFields
			v-if="block.visibleIf"
			:condition="block.visibleIf"
			outcome="visibility"
			@update="setRule"
		/>
		<p class="text-muted text-xs">{{ t(`${KEY}.help`) }}</p>
	</div>
</template>
