<script setup lang="ts">
import { computed } from 'vue'
import type {
	EditorDevice,
	PreviewMode,
} from '../../composables/useTemplateEditor'
import { useEditorContext } from '../../composables/useEditorContext'

const { t } = useI18n()
const { editor } = useEditorContext()

const deviceItems = computed(() => [
	{
		value: 'desktop',
		label: t('dms_mailing.editor.desktop'),
		icon: 'i-ph-desktop',
	},
	{
		value: 'mobile',
		label: t('dms_mailing.editor.mobile'),
		icon: 'i-ph-device-mobile',
	},
])

const modeItems = computed(() => [
	{
		value: 'variables',
		label: t('dms_mailing.editor.toolbar.mode_variables'),
		icon: 'i-ph-brackets-curly',
	},
	{
		value: 'data',
		label: t('dms_mailing.editor.toolbar.mode_data'),
		icon: 'i-ph-database',
	},
])

const device = computed({
	get: () => editor.device,
	set: (value: string | number | undefined) =>
		(editor.device = value as EditorDevice),
})

const mode = computed({
	get: () => editor.previewMode,
	set: (value: string | number | undefined) =>
		(editor.previewMode = value as PreviewMode),
})
</script>

<template>
	<div class="flex items-center gap-2">
		<UTooltip
			:text="
				editor.device === 'desktop'
					? t('dms_mailing.editor.toolbar.desktop')
					: t('dms_mailing.editor.toolbar.mobile')
			"
		>
			<span class="inline-flex">
				<DmsSegmented
					v-model="device"
					size="xs"
					:items="deviceItems"
					:aria-label="t('dms_mailing.editor.toolbar.device')"
				/>
			</span>
		</UTooltip>
		<DmsSegmented
			v-model="mode"
			size="xs"
			:items="modeItems"
			:aria-label="t('dms_mailing.editor.toolbar.mode')"
		/>
	</div>
</template>
