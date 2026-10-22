<script setup lang="ts">
import { TEMPLATES_PATH } from '../utils/pages'
import { useClipboard } from '@vueuse/core'
import { useMailingApi } from '../composables/useMailingApi'
import { useProviderRead, useSendRead } from '../composables/useMailingReads'
import { useReplayToast } from '../composables/useReplayToast'
import {
	describeProblem,
	problemEventReason,
	problemTone,
} from '../utils/problems'
import {
	type DrawerSend,
	formatPayload,
	SEND_STATUS_TONES,
	sendFooterActions,
	shortSendId,
	type SendAction,
	type SendActionId,
} from '../utils/send-actions'
import { renderingTitleKey } from '../utils/rendering-title'
import { formatLatency, isSlowLatency } from '../utils/send-stats'
import {
	isSuppressedStatus,
	reasonKey,
	suppressionNotice,
	suppressionRoute,
} from '../utils/suppression'
import {
	buildTimeline,
	type TimelineItem,
	type TimelineTracking,
} from '../utils/timeline'
import type { Component } from 'vue'
import type { SendDetailResponse, SendRow } from '../types/mailing'

interface SendDrawerProps {
	sendId?: string
	rowData?: SendRow
	onSuccessCallback?: () => void
	/** Shows another send of the table in this panel (DMS `showRow`). */
	showRow?: (row: object | string) => Promise<void>
}

interface StatTrioItem {
	id: string
	eyebrow: string
	value: string
	detail?: string
	detailTone?: 'warning' | 'error'
}

/** A send linked to this one: the send again of it, or the one it repeats. */
interface LinkedSend {
	id: string
	text: string
}

const RENDERING_MODAL = 'MailingRenderingModal'
const RENDERING_MODAL_SIZE = '3xl'
const FIX_ADDRESS_MODAL = 'MailingFixAddressModal'
const FIX_ADDRESS_MODAL_SIZE = 'md'
const KEY_PREFIX = 'dms_mailing.sends.drawer.'
const RESOLVED_STAGE = 'resolved'
const NO_VALUE = '—'
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23',
}
const TIME_FORMAT: Intl.DateTimeFormatOptions = {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23',
}

const props = defineProps<SendDrawerProps>()

const api = useMailingApi()
const toast = useToast()
const reportReplay = useReplayToast()
const { confirm } = useConfirm()
const { open: openModal } = useModal()
const { t, locale } = useI18n()
const { copy } = useClipboard()

const KeyValueList = resolveComponent('DmsKeyValueList') as Component

const sendId = computed(() => props.rowData?._id ?? props.sendId ?? '')
const readSend = useSendRead(sendId)
const readProvider = useProviderRead()
const detail = ref<SendDetailResponse | null>(null)
const tracking = ref<TimelineTracking | null>(null)
const loading = ref(false)
const sending = ref(false)

const send = computed<DrawerSend | null>(
	() => detail.value?.send ?? props.rowData ?? null,
)
const key = (path: string, params: Record<string, unknown> = {}): string =>
	t(`${KEY_PREFIX}${path}`, params)

const dateOf = (iso: string, format: Intl.DateTimeFormatOptions): string =>
	new Date(iso).toLocaleString(locale.value, format)

const problem = computed(() =>
	send.value
		? describeProblem(
				{
					...send.value,
					error:
						send.value.error || problemEventReason(detail.value?.events ?? []),
				},
				t('dms_mailing.sends.banner.the_provider'),
				!detail.value?.suppression,
			)
		: null,
)
const suppression = computed(() =>
	send.value
		? suppressionNotice(send.value, detail.value?.suppression, {
				date: (iso) => dateOf(iso, DATE_FORMAT),
				reason: (reason) => t(reasonKey(reason)),
			})
		: null,
)
const actions = computed<SendAction[]>(() =>
	send.value
		? sendFooterActions({
				...send.value,
				isAddressSuppressed: detail.value
					? !!detail.value.suppression
					: undefined,
			})
		: [],
)
const isDraftTest = computed(() => !send.value?.templateVersion)
/**
 * A problem someone already dealt with: its banner only recalls what went
 * wrong, the advice to send it again no longer applies.
 */
const isResolved = computed(
	() => send.value?.stage === RESOLVED_STAGE || !!send.value?.replayedBy,
)

const linkedSends = computed<LinkedSend[]>(() => {
	const row = send.value
	if (!row) return []
	const links: LinkedSend[] = []
	if (row.replayedBy)
		links.push({
			id: row.replayedBy,
			text: key('replayed_by', {
				date: row.resolvedAt ? dateOf(row.resolvedAt, DATE_FORMAT) : '',
			}),
		})
	if (row.replayOf) links.push({ id: row.replayOf, text: key('replay_of') })
	return links
})
const payload = computed(() => formatPayload(send.value?.json_variables))
const versionLabel = computed(() =>
	send.value?.templateVersion
		? key('version', { version: send.value.templateVersion })
		: key('draft_version'),
)

const timeline = computed(() =>
	send.value
		? buildTimeline(detail.value?.events ?? [], send.value, tracking.value)
		: [],
)

const stats = computed<StatTrioItem[]>(() => {
	const row = send.value
	if (!row) return []
	const isFallback = !!row.requestedLocale && row.requestedLocale !== row.locale
	const isNotHanded = isSuppressedStatus(row.status)
	const isSlow = !isNotHanded && isSlowLatency(row.latencyMs)
	return [
		{
			id: 'template',
			eyebrow: key('template'),
			value: row.templateSlug,
			detail: versionLabel.value,
		},
		{
			id: 'locale',
			eyebrow: key('locale'),
			value: (row.requestedLocale || row.locale).toUpperCase(),
			detail: isFallback
				? key('fallback_used', { locale: row.locale.toUpperCase() })
				: key('as_requested'),
			detailTone: isFallback ? 'warning' : undefined,
		},
		{
			id: 'latency',
			eyebrow: key('latency'),
			value: isNotHanded
				? NO_VALUE
				: formatLatency(row.latencyMs, locale.value),
			detail: isNotHanded
				? key('not_handed')
				: key(isSlow ? 'slow_latency' : 'latency_hint'),
			detailTone: isSlow ? 'error' : undefined,
		},
	]
})

const originTitle = computed(() => {
	const template = detail.value?.template
	const name = template?.name ?? send.value?.templateSlug ?? ''
	return `${name} · ${versionLabel.value}`
})

const editorLink = computed(() =>
	send.value
		? `${TEMPLATES_PATH}/${send.value.templateId}?locale=${send.value.locale}`
		: undefined,
)

function stepTitle(item: TimelineItem): string {
	return t(item.titleKey, item.titleParams)
}

function stepTime(item: TimelineItem): string {
	return item.at ? dateOf(item.at, TIME_FORMAT) : NO_VALUE
}

async function load(): Promise<void> {
	if (!sendId.value) return
	loading.value = true
	try {
		detail.value = await readSend()
	} catch (error) {
		useApiError(error)
	} finally {
		loading.value = false
	}
}

/** The provider's tracking, so the timeline waits only for what it reports. */
async function loadTracking(): Promise<void> {
	try {
		const provider = await readProvider()
		tracking.value = provider.features
			? {
					openTracking: !!provider.features.openTracking,
					clickTracking: !!provider.features.clickTracking,
				}
			: null
	} catch {
		tracking.value = null
	}
}

/**
 * Opens a linked send in this panel: the DMS reads it (from the rows shown or
 * the table's `get` route) and remounts the drawer on it.
 */
async function showSend(id: string): Promise<void> {
	try {
		await props.showRow?.(id)
	} catch {
		toast.add({ color: 'error', title: key('send_unavailable') })
	}
}

function settle(): void {
	if (props.onSuccessCallback) {
		props.onSuccessCallback()
		return
	}
	void load()
}

async function copyText(value: string, messageKey: string): Promise<void> {
	await copy(value)
	toast.add({ color: 'success', title: key(messageKey) })
}

function openRendering(): void {
	const row = send.value
	if (!row) return
	openModal({
		title: t(renderingTitleKey(row.status), {
			name: row.recipientName || row.recipientEmail,
		}),
		component: resolveComponent(RENDERING_MODAL) as Component,
		componentOptions: { rowData: row, sendId: row._id },
		size: RENDERING_MODAL_SIZE,
	})
}

function openFixAddress(): void {
	const row = send.value
	if (!row) return
	const modal = openModal({
		title: t('dms_mailing.sends.fix_address.title'),
		component: resolveComponent(FIX_ADDRESS_MODAL) as Component,
		componentOptions: { rowData: row, version: row.templateVersion ?? 0 },
		size: FIX_ADDRESS_MODAL_SIZE,
	})
	void modal.result.then((result) => {
		if (result) settle()
	})
}

function replayDetails(row: SendRow) {
	const lastTry = row.error || t(`dms_mailing.sends.status.${row.status}`)
	return h(KeyValueList, {
		dense: true,
		items: [
			{
				id: 'to',
				label: key('replay.to'),
				value: `${row.recipientName ? `${row.recipientName} · ` : ''}${row.recipientEmail}`,
			},
			{
				id: 'template',
				label: key('replay.template'),
				value: `${row.templateSlug} · ${versionLabel.value} · ${row.locale.toUpperCase()}`,
				type: 'mono',
			},
			{
				id: 'last',
				label: key('replay.last_try'),
				value: lastTry,
				tone: 'error',
			},
		],
	})
}

/** What goes again, and a warning when a draft test sends today's draft. */
function replayBody() {
	const row = send.value as SendRow
	const warning = isDraftTest.value
		? h(
				'p',
				{ class: 'text-warning text-[12.5px]' },
				key('replay.draft_warning'),
			)
		: null
	return h('div', { class: 'flex flex-col gap-3' }, [
		replayDetails(row),
		warning,
	])
}

async function replay(): Promise<void> {
	if (sending.value) return
	sending.value = true
	try {
		const result = await api.replay(sendId.value)
		reportReplay(
			result,
			send.value?.recipientEmail ?? '',
			t('dms_mailing.sends.actions.sent_again'),
		)
		settle()
	} catch (error) {
		useApiError(error)
	} finally {
		sending.value = false
	}
}

function confirmSendAgain(): void {
	const row = send.value
	if (!row) return
	const description = row.isTest
		? 'dms_mailing.sends.confirm.replay_description_test'
		: 'dms_mailing.sends.confirm.replay_description'
	void confirm({
		title: t('dms_mailing.sends.confirm.replay_title'),
		description: t(description, { recipientEmail: row.recipientEmail }),
		color: 'warning',
		icon: 'i-ph-arrow-clockwise',
		confirmIcon: 'i-ph-arrow-clockwise',
		confirmLabel: t('dms_mailing.sends.confirm.replay_confirm'),
		cancelLabel: key('replay.cancel'),
		body: replayBody,
		onConfirm: replay,
	})
}

const ACTION_HANDLERS: Record<SendActionId, () => void> = {
	rendering: openRendering,
	copy_address: () =>
		void copyText(send.value?.recipientEmail ?? '', 'address_copied'),
	fix_address: openFixAddress,
	send_again: confirmSendAgain,
}

function openSuppressionList(): void {
	const email = detail.value?.suppression?.email ?? send.value?.recipientEmail
	if (email) void navigateDms(suppressionRoute(email))
}

const copyLink = () => void copyText(window.location.href, 'link_copied')
const copyPayload = () => void copyText(payload.value, 'json_copied')

onMounted(() => {
	void load()
	void loadTracking()
})
</script>

<template>
	<!--
		As tall as the side panel's body: the send scrolls inside, the actions
		stay under it at the bottom, with nothing passing beneath them.
	-->
	<div class="flex h-full min-h-0 flex-col">
		<USkeleton v-if="loading && !send" class="m-5 h-64" />

		<template v-else-if="send">
			<div class="min-h-0 flex-1 overflow-y-auto">
				<header
					class="border-default flex flex-col gap-1.5 border-b px-5 pb-4 pt-1"
				>
					<div class="flex items-center gap-1">
						<DmsEyebrow
							class="min-w-0 flex-1"
							truncate
							:label="key('eyebrow', { id: shortSendId(send._id) })"
						/>
						<UButton
							icon="i-ph-link"
							color="neutral"
							variant="ghost"
							size="sm"
							:aria-label="key('copy_link')"
							@click="copyLink"
						/>
					</div>
					<h3
						class="text-highlighted flex flex-wrap items-center gap-2 text-lg font-semibold"
					>
						<span class="min-w-0 truncate">
							{{ send.recipientName || send.recipientEmail }}
						</span>
						<DmsStatusPill
							:tone="SEND_STATUS_TONES[send.status]"
							:label="t(`dms_mailing.sends.status.${send.status}`)"
						/>
						<DmsStatusPill
							v-if="send.isTest"
							tone="warning"
							dot="none"
							size="sm"
							uppercase
							:label="key('test')"
						/>
					</h3>
					<p class="text-muted truncate text-[12.5px]">
						<span class="font-mono">{{ send.recipientEmail }}</span>
						· {{ dateOf(send.createdAt, DATE_FORMAT) }}
					</p>
				</header>

				<div class="flex flex-1 flex-col gap-6 p-5">
					<section class="flex flex-col gap-3">
						<DmsStatGroup layout="joined" :columns="3" :items="stats" />
						<DmsBanner
							v-if="problem"
							:tone="isResolved ? 'info' : problemTone(problem.kind)"
							:size="isResolved ? 'sm' : undefined"
							:icon="problem.icon"
							:title="t(problem.titleKey, problem.params)"
							:description="
								isResolved
									? undefined
									: t(problem.descriptionKey, problem.params)
							"
							data-problem-banner
						/>
						<DmsBanner
							v-if="suppression"
							:tone="suppression.tone"
							size="sm"
							:icon="suppression.icon"
							:title="t(suppression.titleKey, suppression.params)"
						>
							<template #description>
								<span
									class="text-highlighted block truncate font-mono text-[12px]"
									:title="suppression.params.email"
									data-suppressed-address
								>
									{{ suppression.params.email }}
								</span>
								{{ t(suppression.descriptionKey, suppression.params) }}
							</template>
							<template v-if="suppression.hasListLink" #actions>
								<UButton
									size="xs"
									color="neutral"
									variant="outline"
									trailing-icon="i-ph-arrow-right"
									:label="t('dms_mailing.suppressions.notice.open_list')"
									@click="openSuppressionList"
								/>
							</template>
						</DmsBanner>
						<DmsBanner
							v-for="link in linkedSends"
							:key="link.id"
							tone="info"
							size="sm"
							icon="i-ph-arrow-clockwise"
							:title="link.text"
						>
							<template #actions>
								<UButton
									v-if="showRow"
									size="xs"
									color="neutral"
									variant="outline"
									trailing-icon="i-ph-arrow-right"
									:label="key('see_send')"
									@click="void showSend(link.id)"
								/>
							</template>
						</DmsBanner>
					</section>

					<section class="flex flex-col gap-2">
						<DmsEyebrow :label="key('timeline')" />
						<ol class="flex flex-col">
							<li
								v-for="item in timeline"
								:key="item.id"
								:class="item.isPending && 'opacity-50'"
							>
								<DmsActivityItem
									:icon="item.icon"
									:icon-color="item.isPending ? 'neutral' : item.tone"
									:subtitle="
										item.isPending ? key('pending') : item.detail || undefined
									"
									:mono="item.isDetailMono && !item.isPending"
									:trailing="stepTime(item)"
									:interactive="false"
								>
									<span
										:class="
											item.tone === 'error' && !item.isPending
												? 'text-error'
												: undefined
										"
									>
										{{ stepTitle(item) }}
									</span>
								</DmsActivityItem>
							</li>
						</ol>
					</section>

					<section class="flex flex-col gap-2">
						<DmsEyebrow :label="key('origin')" />
						<div
							class="border-default divide-default divide-y overflow-hidden rounded-lg border"
						>
							<DmsListRow
								:to="editorLink"
								icon="i-ph-envelope-simple"
								icon-size="2xs"
								size="sm"
								:title="originTitle"
							>
								<template #trailing>
									<UIcon
										name="i-ph-arrow-square-out"
										class="text-dimmed size-4"
										aria-hidden="true"
									/>
								</template>
							</DmsListRow>
							<DmsListRow
								v-if="send.source"
								icon="i-ph-code"
								icon-size="2xs"
								size="sm"
								:trailing="key('source')"
							>
								<span class="font-mono text-[12.5px]">{{ send.source }}</span>
							</DmsListRow>
						</div>
					</section>

					<section class="flex flex-col gap-2">
						<div class="flex items-center justify-between gap-2">
							<DmsEyebrow :label="key('payload')" />
							<UButton
								v-if="payload"
								size="xs"
								variant="link"
								:label="key('copy_json')"
								@click="copyPayload"
							/>
						</div>
						<pre
							class="bg-elevated/50 border-default text-toned max-h-72 overflow-auto rounded-lg border p-3 font-mono text-[11.5px] leading-relaxed"
							>{{ payload || '{}' }}</pre>
					</section>
				</div>
			</div>

			<footer
				class="bg-default border-default flex shrink-0 items-center gap-2 border-t px-5 py-3"
			>
				<UButton
					v-for="(action, index) in actions"
					:key="action.id"
					:class="index === 1 ? 'ms-auto' : undefined"
					:icon="action.icon"
					:color="action.variant === 'solid' ? 'primary' : 'neutral'"
					:variant="action.variant"
					:label="action.labelKey ? t(action.labelKey) : undefined"
					:aria-label="
						action.labelKey ? undefined : key(`actions.${action.id}`)
					"
					:loading="action.id === 'send_again' && sending"
					@click="ACTION_HANDLERS[action.id]()"
				/>
			</footer>
		</template>
	</div>
</template>
