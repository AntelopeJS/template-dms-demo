<script setup lang="ts">
import { ref } from 'vue'
import { useSortableList } from '../../composables/useSortableList'
import {
	PALETTE_GROUP,
	cloneFromPalette,
	paletteLabelKey,
} from '../../utils/blocks'
import type { BlockContext, PaletteEntry } from '../../utils/blocks'

interface Props {
	title: string
	entries: PaletteEntry[]
	disabled?: boolean
	/** What a tile dropped on the canvas borrows from the template. */
	blockContext?: () => BlockContext
}

const props = withDefaults(defineProps<Props>(), {
	disabled: false,
	blockContext: () => ({}),
})
const emit = defineEmits<{ add: [PaletteEntry] }>()

const { t } = useI18n()

const root = ref<HTMLElement | null>(null)

// A tile stays in the palette: the canvas receives the block it stands for.
useSortableList(root, () => props.entries, {
	group: PALETTE_GROUP,
	sort: false,
	disabled: () => props.disabled,
	clone: (entry) => cloneFromPalette(entry, props.blockContext()),
})
</script>

<template>
	<section>
		<DmsEyebrow :label="title" class="mb-2 block" />
		<div ref="root" class="grid grid-cols-2 gap-1.5">
			<template v-for="element in entries" :key="element.type">
				<button
					type="button"
					class="border-default bg-default text-toned hover:border-primary/60 hover:text-highlighted group flex min-h-9 cursor-grab items-center gap-2 rounded-md border px-2.5 py-1 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-50"
					:class="{ 'col-span-2': element.isWide }"
					:disabled="disabled"
					@click="emit('add', element)"
				>
					<UIcon
						:name="element.icon"
						class="size-4 shrink-0"
						:class="
							element.type === 'if'
								? 'text-warning'
								: 'text-dimmed group-hover:text-primary'
						"
					/>
					<span class="line-clamp-2 min-w-0 leading-tight">
						{{ t(paletteLabelKey(element.type)) }}
					</span>
				</button>
			</template>
		</div>
	</section>
</template>
