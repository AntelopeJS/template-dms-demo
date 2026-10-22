<script setup lang="ts">
import type { GroupPort } from '../../../composables/useGraphConnect'
import GroupSentinel from './GroupSentinel.vue'

const props = defineProps<{
	id: string
	data: { ports?: GroupPort[] }
	selected?: boolean
}>()
</script>

<template>
	<GroupSentinel
		:id="props.id"
		side="in"
		:data="props.data"
		:selected="props.selected"
	/>
</template>
