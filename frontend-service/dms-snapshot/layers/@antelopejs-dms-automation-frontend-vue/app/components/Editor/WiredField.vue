<script setup lang="ts">
interface Source {
	node: string
	port: string
}

defineProps<{
	source: Source
	sourceLabel?: string
}>()

const emit = defineEmits<{
	(e: 'unwire'): void
}>()

function onUnwire() {
	emit('unwire')
}
</script>

<template>
	<div
		class="flex items-center gap-2 rounded-lg border border-default bg-elevated px-2 py-1.5"
	>
		<UIcon name="i-ph-plugs-connected" class="size-4 text-success" />
		<span class="min-w-0 flex-1 truncate text-xs text-toned">
			{{ $t('dms_automation.editor.wiredField.from') }}
			<span class="font-medium text-highlighted">{{ sourceLabel ?? source.node }}</span>
			<span class="font-mono text-muted"> · {{ source.port }}</span>
		</span>
		<UButton
			size="xs"
			variant="ghost"
			color="error"
			icon="i-ph-x"
			:aria-label="$t('dms_automation.editor.wiredField.unwire')"
			@click="onUnwire"
		>
			{{ $t('dms_automation.editor.wiredField.unwire') }}
		</UButton>
	</div>
</template>
