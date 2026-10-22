<script setup lang="ts">
// Keeps a live page in step with its realtime topics: each event refreshes
// every block of the page, through the page's Live / Pause like any refresh
// nobody asked for. Draws nothing.

const props = defineProps<{
	realtimeTopic: string[]
}>()

for (const topic of props.realtimeTopic) {
	useRealtimeTopic(topic, (event) => {
		// A presence snapshot names no `type`: nothing changed.
		if ('type' in event) refreshLivePageBlocks()
	})
}
</script>

<template>
	<span hidden />
</template>
