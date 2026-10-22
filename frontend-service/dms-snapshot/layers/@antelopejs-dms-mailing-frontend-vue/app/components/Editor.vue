<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { TemplateContentResponse } from '../types/mailing'
import { useTemplateContentRead } from '../composables/useMailingReads'
import { useRecordLabel } from '../composables/useEditorContext'
import { templateIdFrom } from '../utils/editor-route'
import { TEMPLATES_PATH } from '../utils/pages'
import type { EditorRouteParams } from '../utils/editor-route'

interface Props {
	routeParams?: EditorRouteParams
}

const props = defineProps<Props>()

const { t } = useI18n()
const route = useDmsRoute()
const setRecordLabel = useRecordLabel()

const templateId = computed(() => templateIdFrom(props.routeParams, route.path))
const readContent = useTemplateContentRead(templateId)
const locale = ref<string | null>(
	route.query.locale ? String(route.query.locale) : null,
)

const loaded = ref<TemplateContentResponse | null>(null)
const loading = ref(true)
const failed = ref(false)
const generation = ref(0)

async function load(): Promise<void> {
	failed.value = false
	try {
		loaded.value = await readContent()
		setRecordLabel(loaded.value.template.name)
		generation.value += 1
	} catch {
		failed.value = true
	} finally {
		loading.value = false
	}
}

async function retry(): Promise<void> {
	loading.value = true
	await load()
}

const errorActions = computed(() => [
	{
		label: t('dms_mailing.editor.states.back'),
		icon: 'i-ph-arrow-left',
		color: 'neutral' as const,
		variant: 'outline' as const,
		onClick: () => navigateDms(TEMPLATES_PATH),
	},
	{
		label: t('dms_mailing.editor.states.retry'),
		icon: 'i-ph-arrows-clockwise',
		onClick: () => retry(),
	},
])

onMounted(load)
</script>

<template>
	<div class="flex h-full min-h-0 flex-1 flex-col">
		<MailingEditorLoading v-if="loading" />

		<div
			v-else-if="failed || !loaded"
			class="flex flex-1 items-center justify-center p-8"
		>
			<DmsEmptyState
				variant="error"
				hatched
				:title="t('dms_mailing.editor.states.error_title')"
				:actions="errorActions"
			>
				<p>{{ t('dms_mailing.editor.states.error_description') }}</p>
				<p class="text-dimmed mt-2 font-mono text-[11px]">
					GET /api/mailing/templates/{{ templateId }}/content
				</p>
			</DmsEmptyState>
		</div>

		<MailingEditorWorkspace
			v-else
			:key="`${templateId}-${generation}`"
			v-model:locale="locale"
			:loaded="loaded"
			:template-id="templateId"
			:reload="load"
			@renamed="setRecordLabel"
		/>
	</div>
</template>
