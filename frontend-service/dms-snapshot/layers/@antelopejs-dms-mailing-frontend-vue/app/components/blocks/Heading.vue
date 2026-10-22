<script setup lang="ts">
import type { HeadingBlock } from '../../types/mailing'

interface Props {
	block: HeadingBlock
}

defineProps<Props>()
</script>

<template>
	<h1
		class="mb-3 font-semibold text-gray-900"
		:style="{ textAlign: block.align, fontSize: `${block.size}px` }"
	>
		<MailingTokenText :text="block.text" />
	</h1>
</template>
