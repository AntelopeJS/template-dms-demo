<script setup lang="ts">
import { computed } from 'vue'
import type { Block } from '../../types/mailing'
import { useEditorContext } from '../../composables/useEditorContext'
import {
	BLOCK_ICONS,
	blockLabelKey,
	blockPosition,
	branchCounts,
} from '../../utils/blocks'

interface Props {
	block: Block
}

const props = defineProps<Props>()

const KEY = 'dms_mailing.editor.inspector'
const LOGIC_TYPE = 'if'

const { t } = useI18n()
const { editor } = useEditorContext()

const isLogic = computed(() => props.block.type === LOGIC_TYPE)

const position = computed(() => {
	const found = blockPosition(editor.current?.blocks ?? [], props.block.id)
	if (!found) return ''
	const base = t(`${KEY}.position`, { index: found.index, total: found.total })
	if (props.block.type !== 'if') return base
	const counts = branchCounts(props.block)
	return t(`${KEY}.position_branches`, {
		position: base,
		then: counts.then,
		else: counts.else ?? 0,
	})
})
</script>

<template>
	<div class="flex flex-col gap-4">
		<div class="flex items-center gap-2.5">
			<DmsIconWell
				:icon="BLOCK_ICONS[block.type]"
				:tone="isLogic ? 'warning' : 'primary'"
				size="sm"
			/>
			<div class="min-w-0">
				<p class="text-highlighted text-sm font-semibold">
					{{ t(blockLabelKey(block.type)) }}
				</p>
				<p class="text-dimmed font-mono text-[11px]">{{ position }}</p>
			</div>
		</div>

		<MailingEditorConditionInspector
			v-if="block.type === 'if'"
			:block="block"
		/>
		<MailingEditorBlockFields v-else :block="block" />

		<USeparator />
		<MailingEditorVisibility :block="block" />
		<USeparator />

		<div class="flex items-center gap-1.5">
			<UButton
				size="sm"
				color="neutral"
				variant="outline"
				icon="i-ph-copy"
				@click="editor.duplicateBlockById(block.id)"
			>
				{{ t(`${KEY}.duplicate`) }}
			</UButton>
			<UButton
				size="sm"
				color="error"
				variant="ghost"
				icon="i-ph-trash"
				@click="editor.removeBlockById(block.id)"
			>
				{{ t(`${KEY}.delete`) }}
			</UButton>
			<span class="text-dimmed ml-auto flex items-center gap-1 text-[11px]">
				<MailingEditorShortcutHint :keys="['delete']" />
				·
				<MailingEditorShortcutHint :keys="['meta', 'd']" />
			</span>
		</div>
	</div>
</template>
