<script setup lang="ts">
import type { PathSuggestion } from '../../utils/autocomplete'

interface Props {
	items: PathSuggestion[]
	highlighted: number
}

defineProps<Props>()
const emit = defineEmits<{ choose: [PathSuggestion]; hover: [number] }>()

const KEY = 'dms_mailing.editor.autocomplete'

const { t } = useI18n()

function trailOf(item: PathSuggestion): string {
	if (item.status === 'declared') return item.type ?? ''
	return t(`${KEY}.${item.status}`)
}
</script>

<template>
	<div
		role="listbox"
		class="border-default bg-default absolute inset-x-0 top-full z-30 mt-1 flex flex-col rounded-md border p-1 shadow-lg"
	>
		<button
			v-for="(item, index) in items"
			:key="item.path"
			type="button"
			role="option"
			:aria-selected="index === highlighted"
			class="flex h-7 items-center gap-2 rounded px-2 text-left"
			:class="index === highlighted ? 'bg-elevated' : ''"
			@mousedown.prevent="emit('choose', item)"
			@mouseenter="emit('hover', index)"
		>
			<UIcon name="i-ph-brackets-curly" class="text-dimmed size-3.5 shrink-0" />
			<code class="text-highlighted min-w-0 flex-1 truncate font-mono text-xs">
				{{ item.path }}
			</code>
			<span
				class="font-mono text-[10.5px]"
				:class="item.status === 'undeclared' ? 'text-warning' : 'text-dimmed'"
			>
				{{ trailOf(item) }}
			</span>
		</button>
	</div>
</template>
