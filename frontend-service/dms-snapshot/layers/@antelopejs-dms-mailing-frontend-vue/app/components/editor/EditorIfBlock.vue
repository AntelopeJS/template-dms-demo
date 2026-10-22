<script setup lang="ts">
import { computed, inject } from 'vue'
import type { IfBlock } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import { describeCondition, evaluateCondition } from '../../utils/conditions'
import { TOKEN_DATA_KEY } from '../../utils/tokens'

interface Props {
	block: IfBlock
}

const props = defineProps<Props>()

const { t } = useI18n()
const { editor } = useEditorContext()
const data = inject(TOKEN_DATA_KEY, null)

const description = computed(() =>
	describeCondition(props.block.condition, (key: string) => t(key)),
)

const evaluated = computed<boolean | null>(() =>
	data?.value ? evaluateCondition(props.block.condition, data.value) : null,
)

const takesThen = computed(
	() => evaluated.value ?? editor.simulation[props.block.id] !== false,
)

function simulate(value: boolean): void {
	editor.simulation[props.block.id] = value
}
</script>

<template>
	<div
		class="relative my-1 rounded-lg border-[1.5px] border-dashed border-amber-600/55 bg-amber-100/35 px-2.5 pb-2 pt-7"
	>
		<div
			class="absolute inset-x-2 top-1.5 flex items-center gap-1.5 font-mono text-[10.5px] font-semibold text-amber-800"
		>
			<span class="rounded bg-amber-600 px-1.5 py-px tracking-wider text-white">
				{{ t('dms_mailing.editor.condition.if') }}
			</span>
			<span class="min-w-0 truncate">{{ description }}</span>
			<MailingEditorSimChip
				class="ml-auto"
				:value="takesThen"
				:is-locked="evaluated !== null"
				@update="simulate"
			/>
		</div>

		<div :class="{ 'opacity-40': !takesThen }">
			<MailingEditorBlockList :list="block.children" />
		</div>

		<template v-if="block.elseChildren">
			<div
				class="my-2.5 flex items-center gap-2 font-mono text-[10.5px] font-semibold text-amber-800/80"
			>
				{{ t('dms_mailing.editor.condition.else') }}
				<span class="h-px flex-1 border-t border-dashed border-amber-600/45" />
			</div>
			<div :class="{ 'opacity-40': takesThen }">
				<MailingEditorBlockList :list="block.elseChildren" />
			</div>
		</template>
	</div>
</template>
