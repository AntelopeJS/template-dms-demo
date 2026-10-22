<script setup lang="ts">
import type { ParagraphBlock } from '../../types/mailing'

interface Props {
	block: ParagraphBlock
}

defineProps<Props>()
</script>

<template>
	<p
		class="mb-4 text-sm leading-relaxed text-gray-600"
		:style="{ textAlign: block.align }"
	>
		<MailingTokenText :text="block.text" />
	</p>
</template>
