<script setup lang="ts">
import { SETTINGS_PATH } from '../utils/pages'
import { onBeforeUnmount } from 'vue'
import FormFieldRow from '../build/components/FormFieldRow.vue'
import FormRows from '../build/components/FormRows.vue'
import { useMailingApi } from '../composables/useMailingApi'
import { useTemplateContentRead } from '../composables/useMailingReads'
import type { SendResult } from '../composables/useMailingApi'
import { useTemplateDrawer } from '../composables/useTemplateDrawer'
import { apiErrorMessage } from '../utils/api-error'
import { firstName, formatCardDate } from '../utils/gallery'
import { localeChipClass, missingLocales } from '../utils/locales'
import {
	isSendableRecipients,
	localeOptions,
	type NamedLocale,
} from '../utils/recipients'
import { sendLogRoute } from '../utils/send-link'
import {
	buildSendData,
	initialSendValues,
	missingRequiredPaths,
	sendFields,
	type SendField,
	type SendValues,
} from '../utils/send-values'
import { systemVariables } from '../utils/system-variables'
import { interpolateText } from '../utils/tokens'
import { variablesCovered } from '../utils/template-attention'
import { publishedContract } from '../utils/variables'
import { editorRoute } from '../utils/editor-route'
import type {
	TemplateContentResponse,
	TemplateRow,
	TemplateStatus,
} from '../types/mailing'

interface RealSendModalProps {
	rowData?: TemplateRow
	templateId?: string
	onSuccessCallback?: () => void
}

type CheckState = 'ok' | 'warn'

interface ReadinessCheck {
	id: string
	label: string
	state: CheckState
}

const SUBJECT_DELAY_MS = 300
const PATH_LIST_SEPARATOR = ', '

const props = defineProps<RealSendModalProps>()
const emit = defineEmits<{ success: [sent?: boolean] }>()

const api = useMailingApi()
const toast = useToast()
const { t, locale: uiLocale } = useI18n()
const onDate = (date: string): string =>
	t('dms_mailing.common.on_date', { date })
const { processApiMessage } = useTranslation()
const { uniqueLocales } = useUniqueLocales()
const overlays = useTemplateDrawer()

const templateId = computed(() => props.rowData?._id ?? props.templateId ?? '')
const readContent = useTemplateContentRead(templateId)
const detail = ref<TemplateContentResponse | null>(null)
const loading = ref(true)
const recipients = ref<string[]>([])
const locale = ref('')
const values = ref<SendValues>({})
const subject = ref('')
const isSubjectLoading = ref(false)
const isAcknowledged = ref(false)
const sending = ref(false)

/** The footer links' URLs a real send carries, from the published content. */
const systemVars = computed(() => {
	const content = detail.value?.publishedContent ?? detail.value?.content
	return content
		? systemVariables(content, detail.value?.template.category)
		: []
})

/** A real send goes out against the published declarations, not the draft's. */
const contract = computed(() =>
	detail.value
		? publishedContract(detail.value)
		: { variables: [], detected: [] },
)

const fields = computed<SendField[]>(() =>
	sendFields(
		[...contract.value.variables, ...systemVars.value],
		contract.value.detected,
		detail.value?.testData ?? {},
	),
)
const sendData = computed(() => buildSendData(fields.value, values.value))
const missingRequired = computed(() =>
	missingRequiredPaths(fields.value, values.value),
)

onMounted(async () => {
	if (!templateId.value) return
	try {
		detail.value = await readContent()
		values.value = initialSendValues(fields.value, detail.value.testData)
		locale.value = detail.value.fallbackLocale
	} catch (error) {
		toast.add({
			color: 'error',
			title: processApiMessage(apiErrorMessage(error)),
		})
	} finally {
		loading.value = false
	}
})

const template = computed(() => detail.value?.template ?? props.rowData ?? null)
const status = computed<TemplateStatus | undefined>(
	() => template.value?.status,
)
const isLive = computed(() => status.value === 'live')
const sentContent = computed(
	() => detail.value?.publishedContent ?? detail.value?.content,
)
const sentLocales = computed(() =>
	Object.keys(sentContent.value?.locales ?? {}),
)
const workspaceCodes = computed(() =>
	uniqueLocales.value.map((entry) => entry.code),
)
const absentLocales = computed(() =>
	missingLocales(sentLocales.value, workspaceCodes.value),
)

/**
 * The subject as the recipient reads it: resolved with the values of this
 * send, a variable left without one printed blank as a real send does.
 */
async function loadSubject(): Promise<void> {
	if (!isLive.value || !locale.value) return
	isSubjectLoading.value = true
	try {
		const preview = await api.preview(templateId.value, {
			locale: locale.value,
			version: 'published',
			data: sendData.value,
		})
		subject.value = interpolateText(preview.subject, {}, 'send')
	} catch {
		subject.value = ''
	} finally {
		isSubjectLoading.value = false
	}
}

let subjectTimer: ReturnType<typeof setTimeout> | undefined

function scheduleSubject(): void {
	clearTimeout(subjectTimer)
	subjectTimer = setTimeout(() => void loadSubject(), SUBJECT_DELAY_MS)
}

watch([locale, isLive], () => void loadSubject())
watch(sendData, scheduleSubject, { deep: true })
onBeforeUnmount(() => clearTimeout(subjectTimer))
watch(
	() => recipients.value.length,
	() => (isAcknowledged.value = false),
)

const localeItems = computed(() =>
	localeOptions(
		sentLocales.value,
		uniqueLocales.value as NamedLocale[],
		uiLocale.value,
	),
)

const hasSender = computed(() => Boolean(detail.value?.sender?.email))
const sender = computed(() => {
	const from = detail.value?.sender
	if (!from?.email) return ''
	return from.name ? `${from.name} <${from.email}>` : from.email
})

const missingRequiredText = computed(() =>
	missingRequired.value.length
		? t('dms_mailing.real_send.missing_required', {
				paths: missingRequired.value.join(PATH_LIST_SEPARATOR),
			})
		: '',
)

const publishedOn = computed(() =>
	formatCardDate(
		template.value?.publishedAt,
		new Date(),
		uiLocale.value,
		onDate,
	),
)

const canSend = computed(
	() =>
		isLive.value &&
		isAcknowledged.value &&
		isSendableRecipients(recipients.value) &&
		!missingRequired.value.length &&
		!sending.value,
)

const refusal = computed(() =>
	t(`dms_mailing.real_send.refused_${status.value ?? 'draft'}`),
)

const checks = computed<ReadinessCheck[]>(() => {
	const row = template.value
	const response = detail.value
	if (!row || !response) return []
	const covered = variablesCovered(
		contract.value.variables,
		contract.value.detected,
		response.testData,
	)
	return [
		{
			id: 'status',
			state: 'warn',
			label: t('dms_mailing.real_send.check_status', {
				status: t(`dms_mailing.templates.status.${row.status}`),
				date: formatCardDate(row.updatedAt, new Date(), uiLocale.value, onDate),
				name: firstName(row.updatedBy) || row.updatedBy,
			}),
		},
		{
			id: 'variables',
			state: covered ? 'ok' : 'warn',
			label: t(
				`dms_mailing.real_send.check_variables_${covered ? 'ok' : 'warn'}`,
			),
		},
		{
			id: 'locales',
			state: absentLocales.value.length ? 'warn' : 'ok',
			label: absentLocales.value.length
				? t('dms_mailing.real_send.check_locales_warn', {
						missing: absentLocales.value
							.map((code) => code.toUpperCase())
							.join(', '),
						fallback: response.fallbackLocale.toUpperCase(),
					})
				: t('dms_mailing.real_send.check_locales_ok'),
		},
	]
})

function listLabel(field: SendField, value: unknown): string {
	if (field.kind === 'object') return t('dms_mailing.real_send.object_value')
	if (!Array.isArray(value)) return t('dms_mailing.real_send.list_missing')
	return t(
		'dms_mailing.real_send.list_value',
		{ count: value.length },
		value.length,
	)
}

function setValue(path: string, value: unknown): void {
	values.value = { ...values.value, [path]: value }
}

function close(sent: boolean): void {
	if (sent && props.onSuccessCallback) {
		props.onSuccessCallback()
		return
	}
	emit('success', sent)
}

function sendTestInstead(): void {
	close(false)
	overlays.openTestSend(templateId.value)
}

function reviewAndPublish(): void {
	close(false)
	void navigateDms(editorRoute(templateId.value))
}

function openSettings(): void {
	close(false)
	void navigateDms({ path: SETTINGS_PATH })
}

function report(results: SendResult[], to: string[]): void {
	results
		.filter((result) => result.error)
		.forEach((result) =>
			toast.add({
				color: 'error',
				title: to[results.indexOf(result)] ?? result.sendId,
				description: processApiMessage(result.error),
			}),
		)
	const sent = results.filter((result) => !result.error).length
	if (!sent) return
	toast.add({
		color: 'success',
		icon: 'i-ph-paper-plane-right',
		title: t('dms_mailing.real_send.sent', { count: sent }, sent),
		actions: [
			{
				label: t('dms_mailing.sends.open_in_log'),
				onClick: () => void navigateDms(sendLogRoute(results)),
			},
		],
	})
}

async function submit(): Promise<void> {
	if (!canSend.value) return
	sending.value = true
	const to = [...recipients.value]
	try {
		const response = await api.realSend(templateId.value, {
			to,
			locale: locale.value || undefined,
			data: sendData.value,
		})
		report(response.results, to)
		close(true)
	} catch (error) {
		toast.add({
			color: 'error',
			title: processApiMessage(apiErrorMessage(error)),
		})
	} finally {
		sending.value = false
	}
}
</script>

<template>
	<div v-if="loading && !template" class="flex flex-col gap-3">
		<USkeleton class="h-16 w-full" />
		<USkeleton class="h-24 w-full" />
	</div>

	<form
		v-else-if="isLive"
		class="flex flex-col gap-4"
		novalidate
		@submit.prevent="submit"
	>
		<DmsBanner
			tone="error"
			icon="i-ph-paper-plane-right"
			:title="
				t('dms_mailing.real_send.heading', { name: template?.name ?? '' })
			"
			:description="t('dms_mailing.real_send.warning')"
		/>

		<FormRows has-required>
			<MailingRecipientsField
				v-model="recipients"
				:hint="t('dms_mailing.real_send.recipients_hint')"
			/>

			<FormFieldRow :label="t('dms_mailing.test_send.locale')">
				<template #default="{ id }">
					<DmsSelect
						:id="id"
						v-model="locale"
						:items="localeItems"
						value-key="value"
						:deselectable="false"
						class="w-full"
					/>
				</template>
			</FormFieldRow>
		</FormRows>

		<section v-if="fields.length" class="flex flex-col gap-1" data-send-values>
			<h3 class="text-highlighted text-sm font-semibold">
				{{ t('dms_mailing.real_send.values_title') }}
			</h3>
			<FormRows>
				<FormFieldRow
					v-for="field in fields"
					:key="field.path"
					:label="field.path"
					:required="field.required"
				>
					<template #default="{ id }">
						<USwitch
							v-if="field.kind === 'boolean'"
							:id="id"
							:model-value="Boolean(values[field.path])"
							@update:model-value="setValue(field.path, Boolean($event))"
						/>
						<span
							v-else-if="field.kind === 'list' || field.kind === 'object'"
							:id="id"
							class="text-muted text-sm"
						>
							{{ listLabel(field, values[field.path]) }}
						</span>
						<DmsInputText
							v-else
							:id="id"
							:model-value="String(values[field.path] ?? '')"
							:data-path="field.path"
							class="w-full"
							@update:model-value="setValue(field.path, String($event ?? ''))"
						/>
					</template>
				</FormFieldRow>
			</FormRows>
			<p
				v-if="missingRequiredText"
				class="text-error text-xs"
				role="alert"
				data-missing-required
			>
				{{ missingRequiredText }}
			</p>
		</section>

		<DmsBanner
			v-if="detail && !hasSender"
			tone="warning"
			icon="i-ph-at"
			size="sm"
			:description="t('dms_mailing.real_send.no_sender')"
			data-no-sender
		>
			<template #actions>
				<UButton
					size="xs"
					color="neutral"
					variant="outline"
					:label="t('dms_mailing.real_send.settings_link')"
					@click="openSettings"
				/>
			</template>
		</DmsBanner>

		<div class="border-default rounded-lg border px-3">
			<DmsKeyValueList
				dense
				:items="[
					{ id: 'from', label: t('dms_mailing.real_send.from'), value: sender },
					{
						id: 'subject',
						label: t('dms_mailing.real_send.subject'),
						value: subject,
						loading: isSubjectLoading,
					},
					{ id: 'version', label: t('dms_mailing.real_send.version') },
				]"
			>
				<template #value="{ item, formatted }">
					<span
						v-if="item.id === 'version'"
						class="flex flex-wrap items-center gap-1.5"
					>
						<span class="font-mono">v{{ detail?.version ?? 0 }}</span>
						<span v-if="publishedOn">
							·
							{{
								t('dms_mailing.real_send.published_on', { date: publishedOn })
							}}
						</span>
						<span
							v-for="code in sentLocales"
							:key="code"
							:class="localeChipClass(true)"
						>
							{{ code }}
						</span>
					</span>
					<span v-else>{{ formatted }}</span>
				</template>
			</DmsKeyValueList>
		</div>

		<DmsCheckbox
			v-model="isAcknowledged"
			:disabled="!recipients.length"
			:label="
				t(
					'dms_mailing.real_send.acknowledge',
					{ count: recipients.length },
					recipients.length,
				)
			"
		/>

		<div
			class="border-default flex items-center justify-end gap-2 border-t pt-4"
		>
			<UButton
				color="neutral"
				variant="outline"
				:label="t('dms_mailing.common.cancel')"
				@click="close(false)"
			/>
			<UButton
				type="submit"
				color="error"
				icon="i-ph-paper-plane-right"
				:label="
					t(
						'dms_mailing.real_send.submit',
						{ count: recipients.length },
						recipients.length,
					)
				"
				:loading="sending"
				:disabled="!canSend"
			/>
		</div>
	</form>

	<div v-else class="flex flex-col gap-4">
		<DmsBanner
			tone="warning"
			icon="i-ph-paper-plane-right"
			:title="
				t('dms_mailing.real_send.refused_title', { name: template?.name ?? '' })
			"
			:description="refusal"
		/>
		<DmsCheckList :items="checks" />
		<div
			class="border-default flex items-center justify-end gap-2 border-t pt-4"
		>
			<UButton
				color="neutral"
				variant="outline"
				icon="i-ph-flask"
				:label="t('dms_mailing.real_send.test_instead')"
				@click="sendTestInstead"
			/>
			<UButton
				icon="i-ph-rocket-launch"
				:label="t('dms_mailing.real_send.review_publish')"
				@click="reviewAndPublish"
			/>
		</div>
	</div>
</template>
