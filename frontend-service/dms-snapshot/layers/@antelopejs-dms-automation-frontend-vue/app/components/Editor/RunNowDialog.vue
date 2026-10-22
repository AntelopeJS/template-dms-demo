<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WordedTrigger } from '../../utils/describe'
import { redactedHeadersOf } from '../../utils/redactedHeaders'

// "Run now": the saved procedure, run for real with a payload the user can
// edit, prefilled with the last real one (AU-01, AU-05).

const props = defineProps<{
	apiUrl: string
	procedureId: string
	procedureName: string
	triggers: WordedTrigger[]
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'started', runId: string): void }>()

const { $authFetch } = useAuthFetch()
const { processText } = useComposedText()
const { t } = useI18n()

const triggerNodeId = ref<string | undefined>(undefined)
const payload = ref('{}')
const source = ref<string | null>(null)
const submitting = ref(false)
const PAYLOAD_ID = 'run-now-payload'
const ROW = { layout: 'stack', spacing: 'list', inset: false } as const
// A payload that is not JSON shows under it; a refused run is a toast.
const fieldErrors = useFieldErrors({ fields: { payload: PAYLOAD_ID } })

// A payload prefilled from a stored run says which secret headers it lacks.
const redactedHeaders = computed(() => redactedHeadersOf(payload.value))

const triggerItems = computed(() =>
	props.triggers.map((trigger) => ({ label: processText(trigger.text), value: trigger.nodeId ?? '' })),
)

interface LastPayload {
	last: { runId: string; payload: unknown } | null
}

// The last real payload of the trigger picked, read once the dialog opens and
// again when another trigger is picked. Under a key of its own, apart from the
// builder dock's read of the same URL: each copies its answers into its own
// editable field. The page's refreshes leave the draft payload alone.
const lastPayloadRead = useApiData<LastPayload>(
	() => `dms-automation-run-now-payload:${props.procedureId}:${triggerNodeId.value ?? ''}`,
	({ $authFetch, signal }) =>
		$authFetch<LastPayload>(`${props.apiUrl}/procedures/${props.procedureId}/last-payload`, {
			query: triggerNodeId.value ? { triggerNodeId: triggerNodeId.value } : {},
			signal,
		}),
	{ immediate: false, refreshOnPageRefresh: false },
)
const loadingPayload = computed(() => lastPayloadRead.pending.value)

// Each answer, or failure, fills the payload in.
watch(
	() => lastPayloadRead.status.value,
	(status) => {
		if (status !== 'success' && status !== 'error') return
		const last = status === 'error' ? null : (lastPayloadRead.data.value?.last ?? null)
		payload.value = JSON.stringify(last?.payload ?? {}, null, 2)
		source.value = last?.runId ?? null
	},
)

watch(open, (isOpen) => {
	if (!isOpen) return
	fieldErrors.clear()
	triggerNodeId.value = props.triggers.find((tr) => tr.typeId === 'manual')?.nodeId ?? props.triggers[0]?.nodeId
	void lastPayloadRead.execute()
})
watch(payload, () => fieldErrors.clear('payload'))

async function submit() {
	let body: unknown
	try {
		body = JSON.parse(payload.value || 'null')
	} catch (e) {
		await fieldErrors.setError('payload', t('dms_automation.editor.runNow.invalidJson', { error: (e as Error).message }))
		return
	}
	submitting.value = true
	try {
		const res = await $authFetch<{ runId: string }>(`${props.apiUrl}/procedures/${props.procedureId}/run-now`, {
			method: 'POST',
			body: { payload: body, triggerNodeId: triggerNodeId.value },
		})
		open.value = false
		emit('started', res.runId)
	} catch (e) {
		fieldErrors.toastError(e, { toastTitle: 'dms_automation.common.actionFailed' })
	} finally {
		submitting.value = false
	}
}
</script>

<template>
	<UModal
		v-model:open="open"
		:title="$t('dms_automation.editor.runNow.title', { name: procedureName })"
		:description="$t('dms_automation.editor.runNow.description')"
		:ui="{ content: 'max-w-xl' }"
	>
		<template #body>
			<div class="flex flex-col gap-4">
				<DmsFieldRow
					v-if="triggers.length > 1"
					v-bind="ROW"
					:label="$t('dms_automation.editor.runNow.trigger')"
					label-for="run-now-trigger"
				>
					<DmsSelect id="run-now-trigger" v-model="triggerNodeId" :items="triggerItems" class="w-full" />
				</DmsFieldRow>
				<DmsFieldRow
					v-bind="ROW"
					:label="$t('dms_automation.editor.runNow.payload')"
					:description="source ? $t('dms_automation.editor.dock.payloadFrom', { run: source.slice(-6) }) : $t('dms_automation.editor.runNow.noPastPayload')"
					:label-for="PAYLOAD_ID"
				>
					<div class="grid gap-1.5">
						<DmsInputCode
							:id="PAYLOAD_ID"
							v-model="payload"
							language="json"
							:min-lines="8"
							:max-lines="16"
							:disabled="loadingPayload"
							v-bind="fieldErrors.aria('payload')"
						/>
						<DmsFieldError :id="fieldErrors.errorId('payload')" :message="fieldErrors.errors.payload" />
					</div>
				</DmsFieldRow>
				<DmsBanner
					v-if="redactedHeaders.length"
					size="sm"
					tone="warning"
					icon="i-ph-key"
					:title="$t('dms_automation.editor.runNow.redactedHeaders', { headers: redactedHeaders.join(', ') })"
				/>
				<DmsBanner size="sm" tone="warning" icon="i-ph-warning" :title="$t('dms_automation.editor.runNow.sideEffects')" />
			</div>
		</template>
		<template #footer>
			<div class="flex w-full justify-end gap-2">
				<UButton variant="outline" color="neutral" @click="open = false">{{ $t('dms_automation.common.cancel') }}</UButton>
				<UButton color="primary" icon="i-ph-play" :loading="submitting" @click="submit">{{ $t('dms_automation.editor.runNow.submit') }}</UButton>
			</div>
		</template>
	</UModal>
</template>
