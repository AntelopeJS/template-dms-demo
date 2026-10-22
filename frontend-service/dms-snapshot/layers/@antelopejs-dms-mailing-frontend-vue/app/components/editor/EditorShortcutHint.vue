<script setup lang="ts">
interface Props {
	keys: string[]
	label?: string
}

defineProps<Props>()
</script>

<template>
	<span class="inline-flex items-center gap-1">
		<span class="inline-flex items-center gap-0.5">
			<UKbd v-for="key in keys" :key="key" :value="key" size="sm" />
		</span>
		<span v-if="label">{{ label }}</span>
	</span>
</template>
