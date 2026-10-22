<script setup lang="ts">
import {
	CARD_DATE_FORMAT,
	formatCardDate,
	formatCardSince,
	firstName,
} from '../utils/gallery'
import { localeChipClass, localeChips } from '../utils/locales'
import {
	cardFooter,
	daysSince,
	type AttentionReason,
	type CardFooterKind,
} from '../utils/template-attention'
import type {
	TemplateRow,
	TemplateStats,
	TemplateStatus,
} from '../types/mailing'

interface TemplateCardProps {
	template: TemplateRow
	/** Last 30 days of real sends; absent means none. */
	stats?: TemplateStats
	/** Why the template needs attention, from the gallery's rules. */
	attention?: AttentionReason[]
}

const PREVIEW_WIDTH = 600
const PREVIEW_SCALE = 0.4
const OPEN_RATE_DIGITS = 1
const PERCENT = 100

const STATUS_TONES: Record<TemplateStatus, string> = {
	live: 'success',
	draft: 'neutral',
	archived: 'warning',
}
const DRAFT_CHANGES_TONE = 'info'

const props = withDefaults(defineProps<TemplateCardProps>(), {
	stats: undefined,
	attention: () => [],
})

const emit = defineEmits<{
	open: []
	details: []
	'test-send': []
	'real-send': []
	'open-locale': [code: string]
}>()

const { t, locale } = useI18n()
const { dateTimeFormat } = useRegionalFormat()
const { uniqueLocales } = useUniqueLocales()

const isLive = computed(() => props.template.status === 'live')
const hasDraftChanges = computed(
	() => isLive.value && Boolean(props.template.isDraftPending),
)
/** Customers receive the published version: the thumbnail shows it. */
const previewVersion = computed(() => (isLive.value ? 'published' : 'draft'))

const statusLabel = computed(() =>
	hasDraftChanges.value
		? t('dms_mailing.templates.card.draft_changes')
		: t(`dms_mailing.templates.status.${props.template.status}`),
)

const statusTone = computed(() =>
	hasDraftChanges.value
		? DRAFT_CHANGES_TONE
		: STATUS_TONES[props.template.status],
)

const chips = computed(() =>
	localeChips(
		props.template.locales,
		uniqueLocales.value.map((entry) => entry.code),
	),
)

const staleDays = computed(() =>
	props.attention.includes('stale_draft')
		? daysSince(props.template.updatedAt, new Date())
		: 0,
)
const isNeverSent = computed(() => props.attention.includes('never_sent'))

const footer = computed(() => cardFooter(props.template, props.stats))

const footerDate = computed(() =>
	formatCardDate(
		footer.value.at,
		new Date(),
		locale.value,
		(date) => t('dms_mailing.common.on_date', { date }),
		dateTimeFormat(CARD_DATE_FORMAT),
	),
)

const editedLabel = computed(() =>
	t('dms_mailing.templates.card.edited', { date: footerDate.value }),
)

const sendsLabel = computed(() =>
	new Intl.NumberFormat(locale.value).format(footer.value.sends),
)

const openRateLabel = computed(() =>
	new Intl.NumberFormat(locale.value, {
		style: 'percent',
		maximumFractionDigits: OPEN_RATE_DIGITS,
	}).format(footer.value.openRate / PERCENT),
)

/** "live for 1 hr" within a day, "live since Sep 27" after. */
const liveSince = computed(() =>
	formatCardSince(
		footer.value.at,
		new Date(),
		locale.value,
		dateTimeFormat(CARD_DATE_FORMAT),
	),
)

const FOOTER_TEXTS: Partial<Record<CardFooterKind, () => string>> = {
	no_send: () =>
		liveSince.value?.kind === 'duration'
			? t('dms_mailing.templates.card.no_send_for', {
					duration: liveSince.value.text,
				})
			: t('dms_mailing.templates.card.no_send_since', {
					date: liveSince.value?.text ?? '',
				}),
	edited: () => {
		const name = firstName(footer.value.by)
		return name
			? t('dms_mailing.templates.card.edited_by', {
					date: footerDate.value,
					name,
				})
			: editedLabel.value
	},
}

const footerText = computed(() => FOOTER_TEXTS[footer.value.kind]?.() ?? '')

function chipLabel(code: string, present: boolean): string {
	const key = present ? 'edit_locale' : 'add_locale'
	return t(`dms_mailing.templates.card.${key}`, {
		locale: code.toUpperCase(),
	})
}
</script>

<template>
	<DmsCard
		as="article"
		:padded="false"
		interactive
		tabindex="0"
		:aria-label="template.name"
		class="focus-visible:outline-primary group relative flex flex-col overflow-hidden focus-visible:outline-2"
		:class="template.status === 'archived' ? 'opacity-75' : ''"
		@click="emit('open')"
		@keydown.enter.self="emit('open')"
		@keydown.t.exact.self="emit('test-send')"
	>
		<div
			class="bg-elevated/40 relative flex h-[172px] justify-center overflow-hidden bg-[radial-gradient(var(--ui-border)_1px,transparent_1px)] bg-[length:14px_14px] pt-4"
		>
			<div class="pointer-events-none rounded-t-md shadow-sm">
				<MailingTemplatePreviewFrame
					:template-id="template._id"
					:version="previewVersion"
					:width="PREVIEW_WIDTH"
					:scale="PREVIEW_SCALE"
					:label="template.name"
					lazy
					decorative
				/>
			</div>
			<span class="bg-default absolute left-2.5 top-2.5 z-10 rounded-full">
				<DmsStatusPill
					:tone="statusTone"
					:label="statusLabel"
					:dot="isLive ? 'live' : 'static'"
					size="sm"
				/>
			</span>
			<div
				class="bg-(--ui-bg)/60 pointer-events-none absolute inset-0 flex items-center justify-center gap-2 opacity-0 backdrop-blur-[2px] transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
			>
				<UButton
					icon="i-ph-flask"
					color="neutral"
					variant="outline"
					size="sm"
					:label="t('dms_mailing.templates.card.test')"
					@click.stop="emit('test-send')"
				/>
				<UTooltip
					v-if="isLive"
					:text="t('dms_mailing.templates.actions.real_send')"
				>
					<UButton
						icon="i-ph-paper-plane-right"
						color="error"
						variant="outline"
						size="sm"
						square
						:aria-label="t('dms_mailing.templates.actions.real_send')"
						@click.stop="emit('real-send')"
					/>
				</UTooltip>
				<UButton
					icon="i-ph-pencil-simple"
					size="sm"
					:label="t('dms_mailing.templates.actions.edit')"
					@click.stop="emit('open')"
				/>
			</div>
		</div>

		<div
			class="border-default flex flex-1 flex-col gap-1.5 border-t px-3.5 pb-3 pt-3"
		>
			<div class="flex min-w-0 items-center gap-2">
				<h3
					class="text-highlighted truncate text-[13.5px] font-semibold"
					:title="template.name"
				>
					{{ template.name }}
				</h3>
				<DmsStatusPill
					v-if="staleDays"
					tone="neutral"
					size="sm"
					dot="none"
					:label="
						t('dms_mailing.templates.card.stale_days', { days: staleDays })
					"
				/>
				<DmsStatusPill
					v-if="isNeverSent"
					tone="warning"
					size="sm"
					dot="none"
					:label="t('dms_mailing.templates.card.never_sent')"
				/>
				<UButton
					class="ml-auto shrink-0"
					icon="i-ph-info"
					color="neutral"
					variant="ghost"
					size="xs"
					square
					:aria-label="t('dms_mailing.templates.actions.details')"
					@click.stop="emit('details')"
				/>
			</div>
			<div class="flex min-w-0 items-center gap-2">
				<span class="text-dimmed truncate font-mono text-[11.5px]">
					{{ template.slug }}
				</span>
				<span v-if="chips.length" class="ml-auto flex shrink-0 gap-1">
					<button
						v-for="chip in chips"
						:key="chip.code"
						type="button"
						:title="chipLabel(chip.code, chip.present)"
						:aria-label="chipLabel(chip.code, chip.present)"
						:class="localeChipClass(chip.present)"
						class="focus-visible:outline-primary transition-colors hover:brightness-125 focus-visible:outline-2"
						@click.stop="emit('open-locale', chip.code)"
					>
						{{ chip.code }}
					</button>
				</span>
			</div>
			<div
				class="border-default text-muted mt-1 flex items-center gap-3 border-t pt-2 font-mono text-[11.5px]"
			>
				<template v-if="footer.kind === 'stats'">
					<span class="shrink-0 whitespace-nowrap">
						<b class="text-highlighted font-semibold">{{ sendsLabel }}</b>
						{{ t('dms_mailing.templates.card.sends', footer.sends) }}
					</span>
					<span class="shrink-0 whitespace-nowrap">
						<b class="text-highlighted font-semibold">{{ openRateLabel }}</b>
						{{ t('dms_mailing.templates.card.open') }}
					</span>
					<span class="ml-auto min-w-0 truncate" :title="editedLabel">
						{{ editedLabel }}
					</span>
				</template>
				<span v-else class="truncate">{{ footerText }}</span>
			</div>
		</div>
	</DmsCard>
</template>
