<script setup lang="ts">
import { useTemplateCategories } from '../composables/useTemplateCategories'

interface CategoryLabelProps {
	/** A category id; empty when the template is uncategorised. */
	value?: string | null
}

const EMPTY_CELL = '—'
const UNKNOWN_ICON = 'i-ph-tag'

const props = withDefaults(defineProps<CategoryLabelProps>(), {
	value: null,
})

const { categories } = useTemplateCategories()

const category = computed(() =>
	categories.value.find((entry) => entry.id === props.value),
)
</script>

<template>
	<span v-if="!value" class="text-dimmed">{{ EMPTY_CELL }}</span>
	<span v-else class="inline-flex min-w-0 items-center gap-1.5">
		<UIcon
			:name="category?.icon || UNKNOWN_ICON"
			class="text-dimmed size-4 shrink-0"
		/>
		<span class="truncate" :class="category ? '' : 'text-dimmed font-mono'">
			{{ category?.label ?? value }}
		</span>
	</span>
</template>
