<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BlockType } from '../../types/mailing'
import {
	BLOCK_PALETTE,
	LOGIC_PALETTE,
	filterPalette,
	paletteLabelKey,
} from '../../utils/blocks'
import type { PaletteEntry } from '../../utils/blocks'

const emit = defineEmits<{ pick: [BlockType] }>()

const { t } = useI18n()

const query = ref('')
const labelOf = (entry: PaletteEntry): string => t(paletteLabelKey(entry.type))
const entries = computed(() =>
	filterPalette([...BLOCK_PALETTE, ...LOGIC_PALETTE], query.value, labelOf),
)

function pickFirst(): void {
	const first = entries.value[0]
	if (first) emit('pick', first.type)
}
</script>

<template>
	<div class="flex w-56 flex-col gap-1 p-1.5" @click.stop>
		<UInput
			v-model="query"
			size="sm"
			icon="i-ph-magnifying-glass"
			autofocus
			:placeholder="t('dms_mailing.editor.palette.search')"
			@keydown.enter.prevent="pickFirst()"
		/>
		<div class="flex max-h-64 flex-col overflow-y-auto">
			<button
				v-for="entry in entries"
				:key="entry.type"
				type="button"
				class="text-toned hover:bg-elevated hover:text-highlighted flex h-8 items-center gap-2 rounded-md px-2 text-left text-xs"
				@click="emit('pick', entry.type)"
			>
				<UIcon
					:name="entry.icon"
					class="size-4"
					:class="entry.type === 'if' ? 'text-warning' : 'text-dimmed'"
				/>
				{{ labelOf(entry) }}
			</button>
			<p v-if="entries.length === 0" class="text-muted px-2 py-1.5 text-xs">
				{{ t('dms_mailing.editor.palette.no_match', { query }) }}
			</p>
		</div>
	</div>
</template>
