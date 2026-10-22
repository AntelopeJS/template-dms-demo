<script setup lang="ts">
import { useSendHtmlRead, useSendRead } from '../composables/useMailingReads'
import type { SendHtmlResponse, SendRow } from '../types/mailing'

type RenderingView = 'desktop' | 'mobile' | 'html'

/** The rendering as the API answers it now: a draft test is approximate. */
interface SendRendering extends SendHtmlResponse {
	approximate?: boolean
}

interface RenderingModalProps {
	rowData?: SendRow
	sendId?: string
}

const props = withDefaults(defineProps<RenderingModalProps>(), {
	rowData: undefined,
	sendId: undefined,
})

const KEY_PREFIX = 'dms_mailing.rendering.'
const FRAME_HEIGHT_PX = 560
const MOBILE_WIDTH_PX = 375
const FRAME_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox'
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23',
}

const VIEW_ICONS: Record<RenderingView, string> = {
	desktop: 'i-ph-desktop',
	mobile: 'i-ph-device-mobile',
	html: 'i-ph-code',
}

const FRAME_WIDTHS: Record<RenderingView, string> = {
	desktop: '100%',
	mobile: `${MOBILE_WIDTH_PX}px`,
	html: '100%',
}

const { t, locale } = useI18n()

const view = ref<RenderingView>('desktop')
const rendering = ref<SendRendering | null>(null)
const send = ref<SendRow | null>(props.rowData ?? null)
const loading = ref(false)
const failed = ref(false)

const sendIdValue = computed(() => props.rowData?._id ?? props.sendId ?? '')
const readSend = useSendRead(sendIdValue)
const readHtml = useSendHtmlRead(sendIdValue)
const key = (path: string, params: Record<string, unknown> = {}): string =>
	t(`${KEY_PREFIX}${path}`, params)

const viewItems = computed(() =>
	(Object.keys(VIEW_ICONS) as RenderingView[]).map((value) => ({
		value,
		icon: VIEW_ICONS[value],
		label: key(`views.${value}`),
	})),
)

const from = computed(() => {
	const value = rendering.value
	if (!value) return ''
	return value.fromName ? `${value.fromName} <${value.from}>` : value.from
})

const meta = computed(() => {
	const value = rendering.value
	if (!value) return ''
	const version = value.version
		? key('version', { version: value.version })
		: key('draft_version')
	const date = send.value
		? new Date(send.value.createdAt).toLocaleString(locale.value, DATE_FORMAT)
		: ''
	return [date, value.locale.toUpperCase(), version].filter(Boolean).join(' · ')
})

async function loadSend(): Promise<void> {
	if (send.value) return
	const detail = await readSend()
	send.value = detail.send
}

async function load(): Promise<void> {
	if (!sendIdValue.value) return
	loading.value = true
	failed.value = false
	try {
		const [html] = await Promise.all([readHtml(), loadSend()])
		rendering.value = html
	} catch (error) {
		failed.value = true
		useApiError(error)
	} finally {
		loading.value = false
	}
}

onMounted(load)
</script>

<template>
	<div class="flex flex-col gap-4">
		<div class="flex flex-wrap items-center gap-3">
			<p class="text-muted min-w-0 flex-1 text-[13px]">
				{{ key('description') }}
				<span class="font-mono text-[12px]">{{ sendIdValue }}</span>
			</p>
			<DmsSegmented
				v-model="view"
				size="xs"
				:items="viewItems"
				:aria-label="key('view_label')"
			/>
		</div>

		<USkeleton
			v-if="loading"
			class="w-full"
			:style="{ height: `${FRAME_HEIGHT_PX}px` }"
		/>

		<DmsEmptyState
			v-else-if="failed || !rendering"
			variant="error"
			:title="key('error_title')"
			:description="key('error_description')"
		/>

		<template v-else>
			<DmsBanner
				v-if="rendering.approximate"
				tone="warning"
				size="sm"
				icon="i-ph-warning"
				:title="key('approximate')"
			/>

			<div class="border-default overflow-hidden rounded-lg border">
				<div class="border-default flex flex-col gap-0.5 border-b px-4 py-3">
					<b class="text-highlighted text-sm">{{ rendering.subject }}</b>
					<span class="text-muted truncate text-[12.5px]">
						{{ from }}
						→ {{ send?.recipientEmail }}
					</span>
					<span class="text-dimmed text-[11px]">
						{{ key('current_sender') }}
					</span>
					<span class="text-dimmed font-mono text-[11px]">{{ meta }}</span>
				</div>

				<div v-if="view === 'html'" class="bg-elevated/40 relative">
					<pre
						class="text-toned overflow-auto p-4 font-mono text-[11.5px] leading-relaxed"
						:style="{ maxHeight: `${FRAME_HEIGHT_PX}px` }"
						>{{ rendering.html }}</pre>
					<DmsCopyButton
						:value="rendering.html"
						class="absolute right-2 top-2"
					/>
				</div>

				<div v-else class="bg-elevated/40 flex justify-center p-4">
					<iframe
						:srcdoc="rendering.html"
						:sandbox="FRAME_SANDBOX"
						:title="key('frame_title')"
						class="block rounded-md border-0 bg-white shadow-sm transition-[width]"
						:style="{
							width: FRAME_WIDTHS[view],
							height: `${FRAME_HEIGHT_PX}px`,
						}"
					/>
				</div>
			</div>
		</template>
	</div>
</template>
