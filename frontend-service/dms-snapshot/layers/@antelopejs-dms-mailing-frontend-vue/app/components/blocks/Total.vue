<script setup lang="ts">
import type { TotalBlock } from '../../types/mailing'

interface Props {
	block: TotalBlock
}

defineProps<Props>()
</script>

<template>
	<div
		class="mb-4 flex items-center justify-between gap-3 border-t border-gray-200 pt-3 text-sm font-semibold text-gray-900"
	>
		<MailingTokenText class="min-w-0" :text="block.label" />
		<MailingTokenText class="min-w-0 text-right" :text="block.value" />
	</div>
</template>
