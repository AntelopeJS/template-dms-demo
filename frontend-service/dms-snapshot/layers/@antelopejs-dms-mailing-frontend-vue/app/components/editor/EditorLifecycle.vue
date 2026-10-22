<script setup lang="ts">
import { computed } from 'vue'
import { useEditorContext } from '../../composables/useEditorContext'
import type { StatusKey } from '../../utils/lifecycle'
import { lifecycleActions } from '../../utils/lifecycle'

const KEY = 'dms_mailing.editor.lifecycle'
const STATUS_TONES: Record<StatusKey, 'success' | 'neutral' | 'warning'> = {
	live: 'success',
	draft: 'neutral',
	unpublished: 'warning',
	archived: 'warning',
}
const NO_VALUE = '—'

const { t, locale } = useI18n()
const { session, actions } = useEditorContext()

const status = computed(() => session.state.template.status)

const stats = computed(() => {
	const sends = session.state.performance?.sends
	return [
		{
			eyebrow: t(`${KEY}.status`),
			value: t(`dms_mailing.templates.status.${session.statusKey}`),
			detailTone: STATUS_TONES[session.statusKey],
		},
		{
			eyebrow: t(`${KEY}.version`),
			value: session.state.version > 0 ? `v${session.state.version}` : NO_VALUE,
		},
		{
			eyebrow: t(`${KEY}.sends`),
			value:
				sends === undefined
					? NO_VALUE
					: sends.toLocaleString(String(locale.value)),
		},
	]
})

const buttons = computed(() => lifecycleActions(status.value))
</script>

<template>
	<div class="flex flex-col gap-3">
		<DmsEyebrow :label="t(`${KEY}.title`)" />
		<DmsStatGroup :items="stats" layout="joined" :columns="3" />
		<div class="flex flex-wrap items-center gap-1.5">
			<UButton
				v-for="button in buttons"
				:key="button.action"
				size="sm"
				:color="button.action === 'archive' ? 'warning' : 'neutral'"
				:variant="button.action === 'archive' ? 'ghost' : 'outline'"
				:icon="button.icon"
				@click="actions.runLifecycle(button.action)"
			>
				{{ t(`${KEY}.${button.action}`) }}
			</UButton>
		</div>
		<p class="text-muted text-xs">
			{{ t(`${KEY}.refuse_warning`, { slug: session.state.template.slug }) }}
		</p>
	</div>
</template>
