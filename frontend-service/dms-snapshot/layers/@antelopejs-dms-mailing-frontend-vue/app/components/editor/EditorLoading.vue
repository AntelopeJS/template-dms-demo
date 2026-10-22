<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
	<div class="flex flex-1 items-start justify-center p-10" aria-busy="true">
		<div
			class="border-default bg-default grid w-full max-w-md gap-3 rounded-lg border p-5"
		>
			<div class="flex items-center gap-3">
				<USkeleton class="size-8 rounded-lg" />
				<USkeleton class="h-3 w-40" />
			</div>
			<USkeleton class="h-9 rounded-lg" />
			<USkeleton class="h-24 rounded-lg" />
			<USkeleton class="h-3 w-4/5" />
			<USkeleton class="h-3 w-3/5" />
			<span class="text-dimmed font-mono text-[11px]">
				{{ t('dms_mailing.editor.loading') }}
			</span>
		</div>
	</div>
</template>
