<script setup lang="ts">
import type { ChangeLine } from '../../utils/changes'
import type { PublishReviewChoice } from '../../composables/useEditorActions'

interface Props {
	lines: ChangeLine[]
	/** What refuses the publish (a blank subject); the button stays disabled. */
	blockers?: string[]
	warnings: string[]
	nextVersion: number
	currentVersion: number
	/** Puts the current version live again rather than a new one. */
	isRepublish?: boolean
}

withDefaults(defineProps<Props>(), { blockers: () => [], isRepublish: false })
const emit = defineEmits<{ success: [PublishReviewChoice] }>()

const KEY = 'dms_mailing.editor.publish_review'

const { t } = useI18n()
</script>

<template>
	<div class="flex flex-col gap-4">
		<ul v-if="lines.length" class="flex flex-col gap-2 text-[13px]">
			<li v-for="line in lines" :key="line.key" class="text-toned flex gap-2">
				<UIcon :name="line.icon" class="text-primary mt-0.5 size-4 shrink-0" />
				<div class="flex min-w-0 flex-col gap-0.5">
					<span>{{ line.text }}</span>
					<span
						v-if="line.before !== undefined"
						class="text-muted line-clamp-2 text-xs"
					>
						<span class="line-through">{{ line.before }}</span>
						→
						<span class="text-highlighted">{{ line.after }}</span>
					</span>
				</div>
			</li>
		</ul>
		<p v-else class="text-muted text-[13px]">
			{{ t(`${KEY}.no_changes`, { version: currentVersion }) }}
		</p>

		<DmsBanner
			v-if="blockers.length"
			tone="error"
			icon="i-ph-prohibit"
			:title="t(`${KEY}.blockers`, { count: blockers.length }, blockers.length)"
		>
			<template #description>
				<ul class="flex flex-col gap-1">
					<li v-for="blocker in blockers" :key="blocker">{{ blocker }}</li>
				</ul>
			</template>
		</DmsBanner>

		<DmsBanner
			v-if="warnings.length"
			tone="warning"
			icon="i-ph-warning"
			:title="t(`${KEY}.checks`, { count: warnings.length }, warnings.length)"
		>
			<template #description>
				<ul class="flex flex-col gap-1">
					<li v-for="warning in warnings" :key="warning">{{ warning }}</li>
				</ul>
			</template>
		</DmsBanner>

		<div class="border-default -mx-1 flex items-center gap-2 border-t pt-4">
			<UButton
				color="neutral"
				variant="ghost"
				icon="i-ph-flask"
				@click="emit('success', 'test')"
			>
				{{ t(`${KEY}.test_first`) }}
			</UButton>
			<UButton
				class="ml-auto"
				color="neutral"
				variant="outline"
				@click="emit('success', 'keep')"
			>
				{{ t(`${KEY}.keep_editing`) }}
			</UButton>
			<UButton
				icon="i-ph-rocket-launch"
				:disabled="blockers.length > 0"
				@click="emit('success', 'publish')"
			>
				{{
					t(isRepublish ? `${KEY}.republish` : `${KEY}.confirm`, {
						version: nextVersion,
					})
				}}
			</UButton>
		</div>
	</div>
</template>
