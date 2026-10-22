<script setup lang="ts">
import { computed } from 'vue'
import type { Condition, ConditionOperator } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import {
	OPERATORS,
	OPERATORS_WITH_VALUE,
	evaluateCondition,
} from '../../utils/conditions'

type ConditionOutcome = 'branch' | 'visibility'

interface Props {
	condition: Condition
	outcome: ConditionOutcome
}

const props = defineProps<Props>()
const emit = defineEmits<{ update: [Condition] }>()

const KEY = 'dms_mailing.editor.condition'

const { t } = useI18n()
const { editor, session } = useEditorContext()

const pathItems = computed(() =>
	[
		...new Set([
			...editor.variables.map((variable) => variable.path),
			...session.detected,
			props.condition.path,
		]),
	]
		.filter(Boolean)
		.sort(),
)

const operatorItems = computed(() =>
	OPERATORS.map((value) => ({
		value,
		label: t(`dms_mailing.editor.operators.${value}`),
	})),
)

const needsValue = computed(() =>
	OPERATORS_WITH_VALUE.includes(props.condition.operator),
)

const evaluation = computed(() => {
	if (!session.testData) return null
	const result = evaluateCondition(props.condition, session.testData)
	return t(`${KEY}.eval_${props.outcome}_${result}`)
})

function update(patch: Partial<Condition>): void {
	emit('update', { ...props.condition, ...patch })
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<USelectMenu
			:model-value="condition.path"
			:items="pathItems"
			create-item
			icon="i-ph-brackets-curly"
			class="w-full font-mono"
			size="sm"
			:aria-label="t(`${KEY}.field`)"
			@update:model-value="update({ path: String($event) })"
			@create="update({ path: String($event) })"
		/>
		<div class="grid grid-cols-2 gap-2">
			<USelect
				:model-value="condition.operator"
				:items="operatorItems"
				size="sm"
				:aria-label="t(`${KEY}.operator`)"
				@update:model-value="update({ operator: $event as ConditionOperator })"
			/>
			<UInput
				:model-value="needsValue ? condition.value : ''"
				size="sm"
				:disabled="!needsValue"
				:placeholder="needsValue ? t(`${KEY}.value`) : t(`${KEY}.no_value`)"
				:aria-label="t(`${KEY}.value`)"
				@update:model-value="update({ value: String($event) })"
			/>
		</div>
		<p
			v-if="evaluation"
			class="text-muted flex items-center gap-1.5 font-mono text-[11px]"
		>
			<UIcon name="i-ph-database" class="size-3.5 shrink-0" />
			{{ evaluation }}
		</p>
	</div>
</template>
