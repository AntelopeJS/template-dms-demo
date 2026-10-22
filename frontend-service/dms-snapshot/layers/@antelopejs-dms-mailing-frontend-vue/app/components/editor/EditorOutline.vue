<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import { blockLabelKey, buildOutline } from '../../utils/blocks'
import type { OutlineRow } from '../../utils/blocks'

const INDENT_PX = 14
const BASE_PADDING_PX = 8
const LOGIC_TYPE = 'if'

const { t } = useI18n()
const { editor } = useEditorContext()

const rows = computed(() => buildOutline(editor.current?.blocks ?? []))

function labelOf(row: OutlineRow): string {
	return row.kind === 'else'
		? t('dms_mailing.editor.condition.else')
		: t(blockLabelKey(row.type))
}

function isActive(row: OutlineRow): boolean {
	return row.kind === 'block' && editor.selectedId === row.blockId
}
</script>

<template>
	<div v-if="rows.length" class="flex flex-col gap-px">
		<button
			v-for="row in rows"
			:key="row.key"
			type="button"
			class="flex h-8 items-center gap-2 rounded-md pr-2 text-left text-[12.5px] transition-colors"
			:class="
				isActive(row)
					? 'bg-primary/10 text-highlighted'
					: 'text-toned hover:bg-elevated'
			"
			:style="{ paddingLeft: `${BASE_PADDING_PX + row.depth * INDENT_PX}px` }"
			@click="editor.select(row.blockId)"
		>
			<UIcon
				:name="row.icon"
				class="size-3.5 shrink-0"
				:class="
					row.type === LOGIC_TYPE
						? 'text-warning'
						: isActive(row)
							? 'text-primary'
							: 'text-dimmed'
				"
			/>
			<span class="shrink-0">{{ labelOf(row) }}</span>
			<code
				v-if="row.summary"
				class="text-dimmed min-w-0 truncate font-mono text-[11px]"
			>
				{{ row.summary }}
			</code>
		</button>
	</div>
	<p v-else class="text-muted text-xs">
		{{ t('dms_mailing.editor.outline.empty') }}
	</p>
</template>
