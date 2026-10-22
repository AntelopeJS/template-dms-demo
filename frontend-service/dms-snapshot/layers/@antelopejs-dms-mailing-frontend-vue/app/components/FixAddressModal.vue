<script setup lang="ts">
import FormFieldRow from '../build/components/FormFieldRow.vue'
import FormRows from '../build/components/FormRows.vue'
import { useMailingApi } from '../composables/useMailingApi'
import { useReplayToast } from '../composables/useReplayToast'
import { correctedAddressError } from '../utils/send-actions'
import type { SendRow } from '../types/mailing'

interface FixAddressModalProps {
	rowData?: SendRow
	sendId?: string
	/** Template version the send used; 0 for a draft test. */
	version?: number
}

const props = withDefaults(defineProps<FixAddressModalProps>(), {
	rowData: undefined,
	sendId: undefined,
	version: 0,
})

const emit = defineEmits<{ success: [sent?: boolean] }>()

const KEY_PREFIX = 'dms_mailing.sends.fix_address.'

const api = useMailingApi()
const reportReplay = useReplayToast()
const { t } = useI18n()

const previous = computed(() => props.rowData?.recipientEmail ?? '')
const address = ref(previous.value)
const isTouched = ref(false)
const sending = ref(false)

const key = (path: string, params: Record<string, unknown> = {}): string =>
	t(`${KEY_PREFIX}${path}`, params)

const errorKey = computed(() =>
	correctedAddressError(address.value, previous.value),
)
const visibleError = computed(() =>
	isTouched.value && errorKey.value ? t(errorKey.value) : undefined,
)

const versionLabel = computed(() =>
	props.version
		? key('version', { version: props.version })
		: key('draft_version'),
)

const sendIdValue = computed(() => props.rowData?._id ?? props.sendId ?? '')

/** A test sent to another address stays a test: the text says so. */
const descriptionKey = computed(() =>
	props.rowData?.isTest ? 'description_test' : 'description',
)

async function submit(): Promise<void> {
	if (sending.value) return
	isTouched.value = true
	if (errorKey.value || !sendIdValue.value) return
	sending.value = true
	try {
		const email = address.value.trim()
		const result = await api.replay(sendIdValue.value, email)
		reportReplay(result, email, key('sent', { email }))
		emit('success', true)
	} catch (error) {
		useApiError(error)
	} finally {
		sending.value = false
	}
}
</script>

<template>
	<form class="flex flex-col gap-4" @submit.prevent="submit">
		<p class="text-muted text-[13px] leading-relaxed">
			{{ key(descriptionKey, { email: previous }) }}
			{{ key('app_reminder') }}
		</p>

		<FormRows has-required>
			<FormFieldRow :label="key('label')" :error="visibleError" required>
				<template #default="{ id }">
					<DmsInputEmail
						:id="id"
						v-model="address"
						class="w-full"
						autofocus
						:placeholder="previous"
						@blur="isTouched = true"
					/>
				</template>
			</FormFieldRow>
		</FormRows>

		<DmsKeyValueList
			dense
			:items="[
				{
					id: 'previous',
					label: key('previous'),
					value: previous,
					tone: 'error',
				},
				{
					id: 'template',
					label: key('template'),
					value: `${rowData?.templateSlug ?? ''} · ${versionLabel}`,
				},
			]"
		/>

		<div
			class="border-default flex items-center justify-end gap-2 border-t pt-4"
		>
			<UButton
				color="neutral"
				variant="outline"
				:label="key('cancel')"
				@click="emit('success', false)"
			/>
			<UButton
				type="submit"
				icon="i-ph-paper-plane-tilt"
				:label="key('submit')"
				:loading="sending"
				:disabled="isTouched && !!errorKey"
			/>
		</div>
	</form>
</template>
