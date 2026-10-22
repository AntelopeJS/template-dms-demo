<script setup lang="ts">
import { useMailingApi } from '../composables/useMailingApi'
import { useWebhookStatus } from '../composables/useMailingReads'
import { CARD_DATE_FORMAT, formatCardDate } from '../utils/gallery'
import {
	type WebhookLineTone,
	type WebhookStatus,
	type WebhookStatusLine,
	webhookStatusLines,
	webhookTestMessage,
} from '../utils/webhook-status'

/**
 * A settings field that shows, never edits: the form hands it a value it
 * ignores, and it reads the webhook's status from its own route.
 */
interface WebhookStatusProps {
	modelValue?: unknown
	initialValue?: unknown
	disabled?: boolean
}

defineProps<WebhookStatusProps>()

const KEY_PREFIX = 'dms_mailing.settings.webhook_status.'

const TONE_CLASSES: Record<WebhookLineTone, string> = {
	success: 'text-success',
	warning: 'text-warning',
	error: 'text-error',
	neutral: 'text-dimmed',
}

const api = useMailingApi()
const toast = useToast()
const { t, locale } = useI18n()
const { dateTimeFormat } = useRegionalFormat()

const read = useWebhookStatus()
/** The status read, `null` when the read failed. */
const status = computed<WebhookStatus | null>(() =>
	read.error.value ? null : read.data.value,
)
const isLoading = computed(() => !read.data.value && !read.error.value)
const isTesting = ref(false)

const lines = computed(() =>
	status.value ? webhookStatusLines(status.value) : [],
)

const key = (path: string, params: Record<string, unknown> = {}): string =>
	t(`${KEY_PREFIX}${path}`, params)

function lineText(line: WebhookStatusLine): string {
	const reason = line.reasonKey ? t(line.reasonKey) : ''
	return t(line.labelKey, { ...line.params, reason })
}

function lineTime(line: WebhookStatusLine): string {
	return line.at
		? formatCardDate(
				line.at,
				new Date(),
				locale.value,
				undefined,
				dateTimeFormat(CARD_DATE_FORMAT),
			)
		: ''
}

async function sendTest(): Promise<void> {
	if (isTesting.value) return
	isTesting.value = true
	try {
		const result = await api.webhookTest()
		read.data.value = result.status
		read.error.value = null
		const message = webhookTestMessage(result)
		toast.add({
			color: message.color,
			title: t(message.titleKey, message.params),
			description: message.descriptionKey
				? t(message.descriptionKey, message.params)
				: undefined,
		})
	} catch (error) {
		useApiError(error)
	} finally {
		isTesting.value = false
	}
}
</script>

<template>
	<div class="flex flex-col gap-3">
		<USkeleton v-if="isLoading" class="h-10 w-full" />
		<p v-else-if="!status" class="text-muted text-[13px]">
			{{ key('unavailable') }}
		</p>
		<ul v-else class="flex flex-col gap-1.5" :aria-label="key('label')">
			<li
				v-for="line in lines"
				:key="line.id"
				class="flex items-start gap-2 text-[13px]"
			>
				<UIcon
					:name="line.icon"
					class="mt-0.5 size-4 shrink-0"
					:class="TONE_CLASSES[line.tone]"
					aria-hidden="true"
				/>
				<span class="text-toned min-w-0 flex-1">{{ lineText(line) }}</span>
				<span v-if="line.at" class="text-muted shrink-0 tabular-nums">
					{{ lineTime(line) }}
				</span>
			</li>
		</ul>
		<div class="flex flex-wrap items-center gap-2">
			<UButton
				type="button"
				size="sm"
				color="neutral"
				variant="outline"
				icon="i-ph-paper-plane-tilt"
				:loading="isTesting"
				:disabled="disabled"
				:label="key('send_test')"
				@click="sendTest"
			/>
			<span class="text-dimmed text-[12px]">{{ key('send_test_hint') }}</span>
		</div>
	</div>
</template>
