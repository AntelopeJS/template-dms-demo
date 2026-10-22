<script setup lang="ts">
import { pathBreakSegments } from '../utils/paths'

interface Props {
	path: string
}

const props = defineProps<Props>()

const segments = computed(() => pathBreakSegments(props.path))
</script>

<template>
	<code class="min-w-0 font-mono [overflow-wrap:break-word]">
		<template v-for="(segment, index) in segments" :key="index">
			<span>{{ segment }}</span>
			<wbr />
		</template>
	</code>
</template>
