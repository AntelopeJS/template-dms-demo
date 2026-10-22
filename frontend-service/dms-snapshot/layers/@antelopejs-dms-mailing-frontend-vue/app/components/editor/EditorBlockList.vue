<script setup lang="ts">
import { ref } from 'vue'
import type { Block } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import {
	useSortableList,
	type SortableListChange,
} from '../../composables/useSortableList'
import { DRAG_GROUP, DRAG_HANDLE, DRAG_ITEM } from '../../utils/blocks'
import EditorBlock from './EditorBlock.vue'
import EditorInsertPoint from './EditorInsertPoint.vue'

interface Props {
	list: Block[]
}

const props = defineProps<Props>()

const { editor } = useEditorContext()

function onChange(change: SortableListChange<Block>): void {
	editor.touch()
	if (change.added) editor.select(change.added.element.id)
}

const root = ref<HTMLElement | null>(null)

// The list is the editor's: a drop changes it in place, as a click does.
useSortableList(root, () => props.list, {
	group: DRAG_GROUP,
	handle: DRAG_HANDLE,
	draggable: DRAG_ITEM,
	ghostClass: 'opacity-30',
	onChange,
})
</script>

<template>
	<div ref="root" class="flex flex-col">
		<div
			v-for="(element, index) in props.list"
			:key="element.id"
			data-drag-item
		>
			<EditorInsertPoint :list="props.list" :index="index" />
			<EditorBlock :block="element" :index="index" :list="props.list" />
		</div>
		<EditorInsertPoint
			:list="props.list"
			:index="props.list.length"
			:is-empty="props.list.length === 0"
		/>
	</div>
</template>
