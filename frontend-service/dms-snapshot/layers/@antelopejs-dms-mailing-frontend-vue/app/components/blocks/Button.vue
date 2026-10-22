<script setup lang="ts">
import type { ButtonBlock } from '../../types/mailing'

interface Props {
	block: ButtonBlock
}

defineProps<Props>()
</script>

<template>
	<div class="mb-4" :style="{ textAlign: block.align }">
		<span
			class="inline-flex h-10 items-center rounded-md bg-gray-900 px-5 text-sm font-semibold text-white"
		>
			<MailingTokenText :text="block.text" />
		</span>
	</div>
</template>
