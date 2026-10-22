<script setup lang="ts">
import { ref } from 'vue'
import type { Block, BlockType } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import { useBlockContext } from '../../composables/useBlockContext'

interface Props {
	list: Block[]
	index: number
	isEmpty?: boolean
}

const props = defineProps<Props>()

const KEY = 'dms_mailing.editor.canvas'

const { t } = useI18n()
const { editor } = useEditorContext()
const blockContext = useBlockContext()

const isOpen = ref(false)

function pick(type: BlockType): void {
	editor.insertInto(props.list, props.index, type, blockContext())
	isOpen.value = false
}
</script>

<template>
	<UPopover
		v-model:open="isOpen"
		:content="{ side: 'bottom', align: 'center' }"
	>
		<button
			v-if="isEmpty"
			type="button"
			class="my-1 w-full rounded-md border border-dashed border-gray-300 py-3 text-xs text-gray-400 transition hover:border-cyan-500 hover:text-cyan-700"
			@click.stop
		>
			+ {{ t(`${KEY}.add_here`) }}
		</button>
		<button
			v-else
			type="button"
			class="group relative -mx-2 block h-2.5 w-[calc(100%+1rem)] cursor-pointer outline-none"
			:aria-label="t(`${KEY}.insert`)"
			@click.stop
		>
			<span
				class="absolute inset-x-0 top-1 h-0.5 rounded bg-cyan-500 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
				:class="isOpen ? 'opacity-100' : 'opacity-0'"
			/>
			<span
				class="absolute -top-1.5 left-1/2 grid size-[22px] -translate-x-1/2 place-items-center rounded-full bg-cyan-500 text-white ring-4 ring-white transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-visible:ring-cyan-200"
				:class="isOpen ? 'opacity-100' : 'opacity-0'"
			>
				<UIcon name="i-ph-plus" class="size-3.5" />
			</span>
		</button>
		<template #content>
			<MailingEditorBlockPicker @pick="pick" />
		</template>
	</UPopover>
</template>
