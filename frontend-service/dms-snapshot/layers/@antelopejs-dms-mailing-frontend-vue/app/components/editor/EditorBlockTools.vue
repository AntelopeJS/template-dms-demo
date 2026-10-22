<script setup lang="ts">
import { useEditorContext } from '../../composables/useEditorContext'

interface Props {
	blockId: string
	isFirst: boolean
	isLast: boolean
}

const props = defineProps<Props>()

const KEY = 'dms_mailing.editor.actions'

const { t } = useI18n()
const { editor } = useEditorContext()
</script>

<template>
	<div
		class="border-accented bg-elevated absolute -right-14 top-0 z-20 flex flex-col gap-px rounded-md border p-0.5 shadow-lg"
		@click.stop
	>
		<UButton
			class="mailing-drag-handle cursor-grab"
			icon="i-ph-dots-six-vertical"
			size="xs"
			color="neutral"
			variant="ghost"
			square
			:aria-label="t(`${KEY}.drag`)"
		/>
		<UButton
			icon="i-ph-arrow-up"
			size="xs"
			color="neutral"
			variant="ghost"
			square
			:disabled="isFirst"
			:aria-label="t(`${KEY}.move_up`)"
			@click="editor.moveBlockById(props.blockId, -1)"
		/>
		<UButton
			icon="i-ph-arrow-down"
			size="xs"
			color="neutral"
			variant="ghost"
			square
			:disabled="isLast"
			:aria-label="t(`${KEY}.move_down`)"
			@click="editor.moveBlockById(props.blockId, 1)"
		/>
		<UButton
			icon="i-ph-copy"
			size="xs"
			color="neutral"
			variant="ghost"
			square
			:aria-label="t(`${KEY}.duplicate`)"
			@click="editor.duplicateBlockById(props.blockId)"
		/>
		<UButton
			icon="i-ph-trash"
			size="xs"
			color="error"
			variant="ghost"
			square
			:aria-label="t(`${KEY}.delete`)"
			@click="editor.removeBlockById(props.blockId)"
		/>
	</div>
</template>
