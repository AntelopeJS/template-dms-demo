<script setup lang="ts">
import { computed, inject, resolveComponent } from 'vue'
import type { Block } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import { BLOCK_COMPONENT_NAMES, blockLabelKey } from '../../utils/blocks'
import { evaluateCondition } from '../../utils/conditions'
import { TOKEN_DATA_KEY } from '../../utils/tokens'

interface Props {
	block: Block
	index: number
	list: Block[]
}

const props = defineProps<Props>()

const { t } = useI18n()
const { editor } = useEditorContext()
const data = inject(TOKEN_DATA_KEY, null)

const isSelected = computed(() => editor.selectedId === props.block.id)
const label = computed(() => t(blockLabelKey(props.block.type)))
const renderer = computed(() =>
	resolveComponent(BLOCK_COMPONENT_NAMES[props.block.type]),
)
const isHidden = computed(() => {
	const rule = props.block.visibleIf
	return Boolean(rule && data?.value && !evaluateCondition(rule, data.value))
})
</script>

<template>
	<div
		class="group relative -mx-2 cursor-pointer rounded-md px-2 py-1.5 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-cyan-700"
		:class="
			isSelected ? 'ring-2 ring-cyan-500' : 'hover:ring-1 hover:ring-cyan-300'
		"
		:data-block-id="block.id"
		tabindex="0"
		role="group"
		:aria-label="label"
		:aria-current="isSelected || undefined"
		@click.stop="editor.select(block.id)"
		@focus="editor.select(block.id)"
	>
		<span
			class="mailing-drag-handle absolute -top-2.5 left-2 z-10 inline-flex h-[18px] cursor-grab items-center gap-1 rounded bg-cyan-500 px-1.5 font-mono text-[10px] font-semibold tracking-wide text-gray-950 transition-opacity group-hover:opacity-100"
			:class="isSelected ? 'opacity-100' : 'opacity-0'"
		>
			{{ label }}
			<template v-if="block.visibleIf">
				· if {{ block.visibleIf.path }}
			</template>
		</span>
		<MailingEditorBlockTools
			v-if="isSelected"
			:block-id="block.id"
			:is-first="index === 0"
			:is-last="index === list.length - 1"
		/>
		<div
			:class="{ 'opacity-40': isHidden }"
			:title="isHidden ? t('dms_mailing.editor.condition.hidden') : undefined"
		>
			<component :is="renderer" :block="block" />
		</div>
	</div>
</template>
