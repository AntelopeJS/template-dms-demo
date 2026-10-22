<script setup lang="ts">
interface NewTemplateSourceTileProps {
	title: string
	subtitle: string
	isPicked: boolean
	/** No preview: the blank page's dashed placeholder. */
	isBlank?: boolean
	starterId?: string
	templateId?: string
}

const PREVIEW_WIDTH = 600
const PREVIEW_SCALE = 0.24

withDefaults(defineProps<NewTemplateSourceTileProps>(), {
	isBlank: false,
	starterId: undefined,
	templateId: undefined,
})

const emit = defineEmits<{ pick: [] }>()
</script>

<template>
	<button
		type="button"
		role="radio"
		:aria-checked="isPicked"
		class="flex min-w-0 flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors"
		:class="
			isPicked
				? 'border-primary ring-primary/30 ring-2'
				: 'border-default hover:border-accented'
		"
		@click="emit('pick')"
	>
		<span
			v-if="isBlank"
			class="border-default text-dimmed flex h-[72px] items-center justify-center rounded border border-dashed"
		>
			<UIcon name="i-ph-plus" class="size-5" />
		</span>
		<span
			v-else
			class="bg-elevated/40 pointer-events-none flex h-[72px] justify-center overflow-hidden rounded"
		>
			<MailingTemplatePreviewFrame
				:starter-id="starterId"
				:template-id="templateId"
				:width="PREVIEW_WIDTH"
				:scale="PREVIEW_SCALE"
				:label="title"
				lazy
				decorative
			/>
		</span>
		<span
			class="text-highlighted line-clamp-2 text-[12.5px] font-medium leading-snug [overflow-wrap:anywhere]"
			:title="title"
		>
			{{ title }}
		</span>
		<span
			class="text-dimmed mt-auto truncate font-mono text-[11px]"
			:title="subtitle"
		>
			{{ subtitle }}
		</span>
	</button>
</template>
