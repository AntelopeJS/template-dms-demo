<script setup lang="ts">
import FormFieldRow from '../build/components/FormFieldRow.vue'
import FormRows from '../build/components/FormRows.vue'
import { useMailingApi } from '../composables/useMailingApi'
import { useTemplateContentRead } from '../composables/useMailingReads'
import type { SendResult, TestSendInput } from '../composables/useMailingApi'
import { apiErrorMessage } from '../utils/api-error'
import { sendLogRoute } from '../utils/send-link'
import { reasonKey, type SuppressionSummary } from '../utils/suppression'
import {
	isSendableRecipients,
	localeOptions,
	type NamedLocale,
} from '../utils/recipients'
import type {
	TemplateContent,
	TemplateContentResponse,
	TemplateRow,
} from '../types/mailing'

interface TestSendModalProps {
	rowData?: TemplateRow
	templateId?: string
	/** Locale preselected; the tenant fallback otherwise. */
	locale?: string
	/** The editor's unsaved draft, sent instead of the saved one. */
	content?: TemplateContent
	/** The editor's data set, sent instead of the saved test data. */
	data?: Record<string, unknown>
	onSuccessCallback?: () => void
}

type DataChoice = 'test' | 'none'

/** Which saved content a test sends when a draft sits on a live template. */
type VersionChoice = 'draft' | 'published'

/** The part of the session user the dialog reads. */
interface SignedInUser {
	email?: string
}

const DATA_CHOICES: DataChoice[] = ['test', 'none']
const VERSION_CHOICES: VersionChoice[] = ['draft', 'published']
const TEST_PREFIX = '[TEST]'

const props = defineProps<TestSendModalProps>()
const emit = defineEmits<{ success: [sent?: boolean] }>()

const api = useMailingApi()
const toast = useToast()
const { t, locale: uiLocale } = useI18n()
const { processApiMessage } = useTranslation()
const { user } = useCurrentUser()
const { uniqueLocales } = useUniqueLocales()

const templateId = computed(() => props.rowData?._id ?? props.templateId ?? '')
const readContent = useTemplateContentRead(templateId)
const detail = ref<TemplateContentResponse | null>(null)
const ownEmail = (user.value as SignedInUser | null)?.email
const recipients = ref<string[]>(ownEmail ? [ownEmail] : [])
const locale = ref(props.locale ?? '')
const dataChoice = ref<DataChoice>('test')
const versionChoice = ref<VersionChoice>('draft')
const sending = ref(false)

onMounted(async () => {
	if (!templateId.value) return
	try {
		detail.value = await readContent()
		locale.value ||= detail.value.fallbackLocale
	} catch (error) {
		toast.add({
			color: 'error',
			title: processApiMessage(apiErrorMessage(error)),
		})
	}
})

const template = computed(() => detail.value?.template ?? props.rowData ?? null)
const publishedVersion = computed(() => detail.value?.version ?? 0)
const isPublished = computed(() => publishedVersion.value > 0)
/** A saved draft beside a published version: the test can try either. */
const canChooseVersion = computed(
	() => !props.content && isPublished.value && Boolean(detail.value?.hasDraft),
)
const testsPublished = computed(
	() =>
		!props.content &&
		isPublished.value &&
		(!detail.value?.hasDraft || versionChoice.value === 'published'),
)
const content = computed(() => {
	if (props.content) return props.content
	return testsPublished.value
		? (detail.value?.publishedContent ?? undefined)
		: detail.value?.content
})

const versionItems = computed(() =>
	VERSION_CHOICES.map((choice) => ({
		label: t(`dms_mailing.test_send.choose_${choice}`, {
			version: publishedVersion.value,
		}),
		value: choice,
	})),
)

const localeItems = computed(() =>
	localeOptions(
		Object.keys(content.value?.locales ?? {}),
		uniqueLocales.value as NamedLocale[],
		uiLocale.value,
	),
)

const dataItems = computed(() =>
	DATA_CHOICES.map((choice) => ({
		label: t(`dms_mailing.test_send.data_${choice}`),
		value: choice,
	})),
)

const DATA_SETS: Record<DataChoice, () => Record<string, unknown>> = {
	test: () => props.data ?? detail.value?.testData ?? {},
	none: () => ({}),
}

const canSend = computed(
	() =>
		isSendableRecipients(recipients.value) &&
		Boolean(content.value) &&
		!sending.value,
)

const draftLabel = computed(() => {
	if (props.content) return t('dms_mailing.test_send.unsaved_draft')
	return testsPublished.value
		? t('dms_mailing.test_send.published_version', {
				version: publishedVersion.value,
			})
		: t('dms_mailing.test_send.current_draft')
})

/**
 * The content override of the request. Only the editor's unsaved draft and a
 * chosen published version travel; otherwise the server picks the saved
 * content and records the version it belongs to.
 */
function contentOverride(): Pick<TestSendInput, 'content' | 'version'> {
	if (props.content) return { content: props.content }
	if (canChooseVersion.value && versionChoice.value === 'published')
		return { content: content.value, version: publishedVersion.value }
	return {}
}

function reportFailures(results: SendResult[], to: string[]): void {
	results.forEach((result, index) => {
		if (!result.error) return
		toast.add({
			color: 'error',
			title: to[index] ?? result.sendId,
			description: processApiMessage(result.error),
		})
	})
	const sent = results.filter((result) => !result.error).length
	if (sent) {
		toast.add({
			color: 'success',
			icon: 'i-ph-flask',
			title: t('dms_mailing.test_send.sent', { count: sent }, sent),
			actions: [
				{
					label: t('dms_mailing.sends.open_in_log'),
					onClick: () => void navigateDms(sendLogRoute(results)),
				},
			],
		})
	}
}

/** Warns that the editor's own address receives nothing but tests. */
function warnOwnSuppression(entry: SuppressionSummary | undefined): void {
	if (!entry) return
	toast.add({
		color: 'warning',
		icon: 'i-ph-prohibit',
		title: t('dms_mailing.test_send.own_suppressed.title', {
			email: entry.email,
		}),
		description: t('dms_mailing.test_send.own_suppressed.description', {
			reason: t(reasonKey(entry.reason)),
		}),
	})
}

function close(sent: boolean): void {
	if (sent && props.onSuccessCallback) {
		props.onSuccessCallback()
		return
	}
	emit('success', sent)
}

async function submit(): Promise<void> {
	if (!canSend.value) return
	sending.value = true
	const to = [...recipients.value]
	try {
		const response = await api.testSend(templateId.value, {
			to,
			locale: locale.value || undefined,
			...contentOverride(),
			data: DATA_SETS[dataChoice.value](),
		})
		reportFailures(response.results, to)
		warnOwnSuppression(response.ownAddressSuppressed)
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
	<form
		class="flex flex-col gap-4"
		novalidate
		@submit.prevent="submit"
		@keydown.meta.enter.prevent="submit"
		@keydown.ctrl.enter.prevent="submit"
	>
		<p v-if="template" class="text-muted text-[13px]">
			{{ template.name }} ·
			<span class="font-mono">{{ template.slug }}</span>
			· {{ draftLabel }}
		</p>
		<USkeleton v-else class="h-4 w-2/3" />

		<FormRows has-required>
			<MailingRecipientsField
				v-model="recipients"
				:hint="t('dms_mailing.test_send.recipients_hint')"
			/>

			<FormFieldRow
				v-if="canChooseVersion"
				:label="t('dms_mailing.real_send.version')"
			>
				<template #default="{ id }">
					<DmsSelect
						:id="id"
						v-model="versionChoice"
						:items="versionItems"
						value-key="value"
						:deselectable="false"
						icon="i-ph-git-commit"
						class="w-full"
						data-version-choice
					/>
				</template>
			</FormFieldRow>

			<FormFieldRow :label="t('dms_mailing.test_send.locale')">
				<template #default="{ id }">
					<DmsSelect
						:id="id"
						v-model="locale"
						:items="localeItems"
						value-key="value"
						:deselectable="false"
						class="w-full"
						:disabled="!localeItems.length"
					/>
				</template>
			</FormFieldRow>

			<FormFieldRow :label="t('dms_mailing.test_send.data')">
				<template #default="{ id }">
					<DmsSelect
						:id="id"
						v-model="dataChoice"
						:items="dataItems"
						value-key="value"
						:deselectable="false"
						icon="i-ph-database"
						class="w-full"
					/>
				</template>
			</FormFieldRow>
		</FormRows>

		<DmsBanner
			tone="info"
			icon="i-ph-info"
			:title="t('dms_mailing.test_send.info_title')"
			:description="
				t('dms_mailing.test_send.info_description', { prefix: TEST_PREFIX })
			"
		/>

		<div class="border-default flex items-center gap-2 border-t pt-4">
			<span class="text-dimmed hidden items-center gap-1 text-xs sm:flex">
				<UKbd value="meta" size="sm" />
				<UKbd value="enter" size="sm" />
				{{ t('dms_mailing.test_send.shortcut') }}
			</span>
			<UButton
				class="ml-auto"
				color="neutral"
				variant="outline"
				:label="t('dms_mailing.common.cancel')"
				@click="close(false)"
			/>
			<UButton
				type="submit"
				icon="i-ph-paper-plane-tilt"
				:label="
					t(
						'dms_mailing.test_send.submit',
						{ count: recipients.length },
						recipients.length,
					)
				"
				:loading="sending"
				:disabled="!canSend"
			/>
		</div>
	</form>
</template>
