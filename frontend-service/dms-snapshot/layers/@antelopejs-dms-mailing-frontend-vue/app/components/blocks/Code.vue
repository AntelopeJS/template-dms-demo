<script setup lang="ts">
import type { CodeBlock } from '../../types/mailing'

interface Props {
	block: CodeBlock
}

defineProps<Props>()
</script>

<template>
	<div
		class="mb-4 rounded-lg border border-dashed border-gray-300 py-5 text-center font-mono text-[27px] tracking-[0.25em] text-gray-900"
	>
		<MailingTokenText :text="block.text" />
	</div>
</template>
