<script setup lang="ts">
import { computed } from 'vue'
import type { Condition, IfBlock } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'

interface Props {
	block: IfBlock
}

const props = defineProps<Props>()

const KEY = 'dms_mailing.editor.condition'

const { t } = useI18n()
const { editor } = useEditorContext()

const elseCount = computed(() => props.block.elseChildren?.length ?? 0)

const hasElse = computed({
	get: () => Boolean(props.block.elseChildren),
	set: (value: boolean) => editor.setElse(props.block.id, value),
})

function update(condition: Condition): void {
	editor.updateBlock(props.block.id, { condition } as Partial<IfBlock>)
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<div
			class="border-warning/40 bg-warning/10 flex flex-col gap-2 rounded-lg border p-3"
		>
			<p class="text-highlighted text-[13px] font-medium">
				{{ t(`${KEY}.first_branch_if`) }}
			</p>
			<MailingEditorConditionFields
				:condition="block.condition"
				outcome="branch"
				@update="update"
			/>
		</div>

		<USwitch
			v-model="hasElse"
			:label="t(`${KEY}.else_branch`)"
			:description="
				hasElse
					? t(`${KEY}.else_count`, { count: elseCount }, elseCount)
					: t(`${KEY}.else_off`)
			"
		/>
	</div>
</template>
