<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import { useBlockContext } from '../../composables/useBlockContext'
import {
	BLOCK_PALETTE,
	LOGIC_PALETTE,
	filterPalette,
	paletteLabelKey,
} from '../../utils/blocks'
import type { BlockContext, PaletteEntry } from '../../utils/blocks'

interface PaletteGroup {
	id: string
	entries: PaletteEntry[]
}

interface FocusableInput {
	inputRef?: HTMLInputElement
}

const KEY = 'dms_mailing.editor.palette'

const { t } = useI18n()
const { editor } = useEditorContext()
const blockContext = useBlockContext()

const query = ref('')
const search = ref<(ComponentPublicInstance & FocusableInput) | null>(null)

const labelOf = (entry: PaletteEntry): string => t(paletteLabelKey(entry.type))

const groups = computed<PaletteGroup[]>(() =>
	[
		{
			id: 'content',
			entries: filterPalette(BLOCK_PALETTE, query.value, labelOf),
		},
		{
			id: 'logic',
			entries: filterPalette(LOGIC_PALETTE, query.value, labelOf),
		},
	].filter((group) => group.entries.length > 0),
)

/** A tile dropped on the canvas gets what a clicked one gets. */
const dropContext = (): BlockContext => ({
	...blockContext(),
	locale: editor.locale,
})

function add(entry: PaletteEntry): void {
	if (!editor.current) return
	editor.addBlockUnderSelected(entry.type, blockContext())
	query.value = ''
}

function addFirstMatch(): void {
	const first = groups.value[0]?.entries[0]
	if (first) add(first)
}

watch(
	() => editor.isSearchRequested,
	async (isRequested) => {
		if (!isRequested) return
		editor.isSearchRequested = false
		await nextTick()
		search.value?.inputRef?.focus()
	},
	{ immediate: true },
)
</script>

<template>
	<div class="flex flex-col gap-4">
		<UInput
			ref="search"
			v-model="query"
			size="sm"
			icon="i-ph-magnifying-glass"
			:placeholder="t(`${KEY}.search`)"
			:aria-label="t(`${KEY}.search`)"
			class="w-full"
			@keydown.enter.prevent="addFirstMatch()"
			@keydown.escape.stop="query = ''"
		>
			<template #trailing>
				<UKbd value="/" size="sm" />
			</template>
		</UInput>

		<MailingEditorPaletteGroup
			v-for="group in groups"
			:key="group.id"
			:title="t(`dms_mailing.editor.groups.${group.id}`)"
			:entries="group.entries"
			:disabled="!editor.current"
			:block-context="dropContext"
			@add="add"
		/>

		<p v-if="groups.length === 0" class="text-muted text-xs">
			{{ t(`${KEY}.no_match`, { query }) }}
		</p>

		<div
			class="border-default text-muted flex gap-2 rounded-lg border border-dashed p-3 text-xs leading-relaxed"
		>
			<UIcon name="i-ph-info" class="mt-0.5 size-3.5 shrink-0" />
			<span>{{ t(`${KEY}.help`) }}</span>
		</div>
	</div>
</template>
