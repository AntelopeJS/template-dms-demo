<script setup lang="ts">
import { computed } from 'vue'

interface Props {
	text: string
}

const LINE_BREAK = /\r?\n/

const props = defineProps<Props>()

const lines = computed(() => props.text.split(LINE_BREAK))
</script>

<template>
	<template v-for="(line, index) in lines" :key="index">
		<br v-if="index > 0" />
		{{ line }}
	</template>
</template>
