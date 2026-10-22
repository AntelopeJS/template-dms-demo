<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import { useLocalizedDefaults } from '../../composables/useLocalizedDefaults'
import { TEMPLATES_PATH } from '../../utils/pages'
import type { StatusKey } from '../../utils/lifecycle'

const STATUS_TONES: Record<StatusKey, string> = {
	live: 'success',
	draft: 'neutral',
	unpublished: 'warning',
	archived: 'warning',
}
const SEPARATOR = ' · '

const { t } = useI18n()
const localized = useLocalizedDefaults()
const { editor, session } = useEditorContext()

const template = computed(() => session.state.template)

function goBack(): void {
	void navigateDms(TEMPLATES_PATH)
}

/**
 * "Live · v3", "Draft" before a first publish, "Unpublished" once taken
 * offline: the version only reads on what customers receive.
 */
const statusLabel = computed(() => {
	const label = t(`dms_mailing.templates.status.${session.statusKey}`)
	const { version } = session.state
	return session.statusKey === 'live' && version > 0
		? `${label}${SEPARATOR}v${version}`
		: label
})

const categoryLabel = computed(() => {
	const id = template.value.category
	if (!id) return t('dms_mailing.editor.toolbar.uncategorised')
	return (
		localized
			.categories(session.state.categories)
			.find((entry) => entry.id === id)?.label ?? id
	)
})
</script>

<template>
	<div class="flex min-w-0 items-center gap-1">
		<UTooltip :text="t('dms_mailing.editor.back')" :kbds="['escape']">
			<UButton
				icon="i-ph-arrow-left"
				color="neutral"
				variant="ghost"
				square
				:aria-label="t('dms_mailing.editor.back')"
				@click="goBack()"
			/>
		</UTooltip>
		<button
			type="button"
			class="hover:bg-elevated min-w-0 rounded-md px-2 py-1 text-left transition-colors"
			:title="t('dms_mailing.editor.open_template_settings')"
			@click="editor.rightTab = 'template'"
		>
			<span class="flex items-center gap-2">
				<span class="text-highlighted truncate text-sm font-semibold">
					{{ template.name }}
				</span>
				<DmsStatusPill
					size="sm"
					:tone="STATUS_TONES[session.statusKey]"
					:label="statusLabel"
				/>
			</span>
			<span class="text-muted block truncate font-mono text-[11px]">
				{{ template.slug }}{{ SEPARATOR }}{{ categoryLabel }}
			</span>
		</button>
	</div>
</template>
