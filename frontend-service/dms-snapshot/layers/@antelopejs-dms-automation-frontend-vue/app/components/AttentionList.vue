<script setup lang="ts">
import { computed, ref } from 'vue'
import { describeRelative, describeTime, stepTitle, type StepName } from '../utils/describe'

// "Needs attention": the procedures someone should look at, each saying why
// and offering the next action — open the failing trace, edit the procedure,
// resume a paused one, dismiss a degraded one that recovered.

interface FailureRef {
	runId: string
	startedAt: string
	error: string
	step: StepName | null
}

interface AttentionRow {
	procedureId: string
	name: string
	state: 'failing' | 'degraded' | 'paused'
	runs: number
	failed: number
	streak: number
	since: string | null
	lastRunId: string | null
	lastFailure: FailureRef | null
	recovered: boolean
	/** Why a trigger did not arm: a problem code, its params, the English message. */
	armError: { code: string; params?: Record<string, string | number>; message: string } | null
	pausedAt: string | null
	pausedBy: string | null
	triggerType: string | null
}

const props = defineProps<{
	fetchUrl: string
	/** The period selector whose period the degraded rows are read over. */
	periodScope?: string
	proceduresUrl: string
	builderUrl: string
	traceUrl: string
	apiUrl: string
}>()

const { $authFetch } = useAuthFetch()
const { processI18n } = useTranslation()
const { t, te } = useI18n()
const { dateTimeFormat } = useRegionalFormat()
const toast = useToast()

// Read like the DMS cards: over the page's period, on its refreshes, through
// its Live / Pause.
const { data, isLoading, error, refresh } = useChartFetch<{ items: AttentionRow[]; total: number }>({
	fetchUrl: props.fetchUrl,
	periodScope: props.periodScope,
})

const rows = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? rows.value.length)
const hasError = computed(() => !isLoading.value && data.value === null && Boolean(error.value))
const errorDetail = computed(() => (error.value ? describeApiError(error.value) : undefined))
const busy = ref<string | null>(null)

const TONES = { failing: 'error', degraded: 'warning', paused: 'neutral' } as const

function reason(row: AttentionRow): string {
	const f = row.lastFailure
	const step = stepTitle(f?.step, processI18n)
	const error = f?.error ?? ''
	if (row.armError) {
		const key = `dms_automation.editor.problems.codes.${row.armError.code}`
		const error = te(key) ? t(key, row.armError.params ?? {}) : row.armError.message
		return processI18n('$dms_automation.procedures.detail.triggerError', { error })
	}
	if (row.state === 'failing') {
		const key = step ? 'failingAt' : 'failing'
		return processI18n(`$dms_automation.attention.${key}`, {
			count: row.streak,
			step,
			error,
		})
	}
	if (row.state === 'degraded') {
		return processI18n('$dms_automation.attention.degradedInPeriod', {
			count: row.failed,
			failed: row.failed,
			runs: row.runs,
			when: f ? describeTime(f.startedAt, dateTimeFormat) : '—',
			error,
		})
	}
	if (row.pausedAt) {
		return processI18n(
			row.pausedBy ? '$dms_automation.attention.pausedBy' : '$dms_automation.attention.pausedAt',
			{ name: row.pausedBy ?? '', ago: describeRelative(row.pausedAt) },
		)
	}
	return processI18n('$dms_automation.attention.paused')
}

interface Change {
	method: 'POST' | 'PUT' | 'DELETE'
	url: string
	body?: Record<string, unknown>
}

function failed(e: unknown) {
	toast.add({
		title: processI18n('$dms_automation.common.actionFailed'),
		description: describeApiError(e),
		color: 'error',
		icon: 'i-ph-warning',
	})
}

/**
 * Applies a change, then refreshes the page: the banner, the counts and this
 * list all move. The toast offers to put it back, since a dismiss or a resume
 * applies to everyone at once.
 */
async function act(row: AttentionRow, change: Change, undo: Change, message: string) {
	busy.value = row.procedureId
	try {
		await $authFetch(change.url, { method: change.method, body: change.body })
		// The row keeps its spinner until the page shows the change.
		await refreshPageBlocks()
		toast.add({
			title: processI18n(message, { name: row.name }),
			color: 'success',
			icon: 'i-ph-check-circle',
			actions: [
				{
					label: processI18n('$dms_automation.attention.undo'),
					color: 'neutral',
					variant: 'outline',
					onClick: () => {
						$authFetch(undo.url, { method: undo.method, body: undo.body }).then(refreshPageBlocks, failed)
					},
				},
			],
		})
	} catch (e) {
		failed(e)
	} finally {
		busy.value = null
	}
}

function resume(row: AttentionRow) {
	const url = `${props.apiUrl}/procedures/${row.procedureId}/enabled`
	// Undo puts the pause back as it was: who paused it, and when.
	void act(
		row,
		{ method: 'PUT', url, body: { enabled: true } },
		{ method: 'PUT', url, body: { enabled: false, restorePause: true } },
		'$dms_automation.attention.resumed',
	)
}

function dismiss(row: AttentionRow) {
	const url = `${props.apiUrl}/procedures/${row.procedureId}/dismiss-attention`
	void act(row, { method: 'POST', url, body: {} }, { method: 'DELETE', url }, '$dms_automation.attention.dismissed')
}
</script>

<template>
	<DmsCard :title="$t('dms_automation.attention.title')" :count="total || undefined" :padded="false" class="h-full">
		<template #actions>
			<UButton size="xs" variant="ghost" color="neutral" trailing-icon="i-ph-arrow-right" :to="proceduresUrl">
				{{ $t('dms_automation.attention.allProcedures') }}
			</UButton>
		</template>

		<div v-if="isLoading && data === null" class="flex flex-col gap-3 p-4">
			<USkeleton v-for="i in 3" :key="i" class="h-12 w-full" />
		</div>
		<div v-else-if="hasError" class="p-4" :title="errorDetail">
			<DmsEmptyState
				variant="error"
				size="sm"
				:title="$t('dms_automation.attention.loadError')"
				:description="$t('dms_automation.attention.loadErrorHint')"
				:actions="[{ label: $t('dms_automation.common.retry'), icon: 'i-ph-arrow-clockwise', onClick: refresh }]"
			/>
		</div>
		<div v-else-if="rows.length === 0" class="p-4">
			<DmsEmptyState
				size="sm"
				icon="i-ph-check-circle"
				tone="success"
				:title="$t('dms_automation.attention.empty')"
				:description="$t('dms_automation.attention.emptyHint')"
			/>
		</div>
		<template v-else>
			<ul class="divide-y divide-default">
				<!-- On a phone the actions go under the text, which keeps the full width. -->
				<li v-for="row in rows" :key="row.procedureId" class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
					<div class="flex min-w-0 flex-1 flex-col gap-1">
						<div class="flex min-w-0 items-center gap-2">
							<span class="truncate text-sm font-medium text-highlighted">{{ row.name }}</span>
							<DmsStatusPill
								:tone="TONES[row.state]"
								:label="$t(`dms_automation.procedures.status.${row.state}`)"
								size="sm"
							/>
						</div>
						<p
							class="line-clamp-2 text-xs"
							:class="row.state === 'failing' ? 'text-error' : 'text-muted'"
						>
							{{ reason(row) }}
						</p>
					</div>
					<div class="flex flex-wrap items-center gap-1 sm:shrink-0 sm:flex-nowrap">
						<UButton
							v-if="row.state !== 'paused' && row.lastFailure"
							size="xs"
							:color="row.state === 'failing' ? 'error' : 'neutral'"
							variant="soft"
							icon="i-ph-path"
							:to="`${traceUrl}?run=${row.lastFailure.runId}`"
						>
							{{ $t('dms_automation.attention.openTrace') }}
						</UButton>
						<UButton
							v-if="row.state === 'degraded'"
							size="xs"
							color="neutral"
							variant="ghost"
							:loading="busy === row.procedureId"
							@click="dismiss(row)"
						>
							{{ $t('dms_automation.attention.dismiss') }}
						</UButton>
						<UButton
							v-if="row.state === 'paused'"
							size="xs"
							color="primary"
							variant="soft"
							icon="i-ph-play"
							:loading="busy === row.procedureId"
							@click="resume(row)"
						>
							{{ $t('dms_automation.attention.resume') }}
						</UButton>
						<!-- A trigger that did not arm has no run to open: the fix is in the builder. -->
						<UButton
							v-if="row.armError"
							size="xs"
							color="error"
							variant="soft"
							icon="i-ph-pencil-simple"
							:to="`${builderUrl}?selected=${row.procedureId}`"
						>
							{{ $t('dms_automation.attention.edit') }}
						</UButton>
						<UTooltip v-else :text="$t('dms_automation.attention.edit')">
							<UButton
								size="xs"
								color="neutral"
								variant="ghost"
								icon="i-ph-pencil-simple"
								:aria-label="$t('dms_automation.attention.edit')"
								:to="`${builderUrl}?selected=${row.procedureId}`"
							/>
						</UTooltip>
					</div>
				</li>
			</ul>
			<div v-if="total > rows.length" class="border-t border-default px-4 py-2">
				<UButton size="xs" variant="link" color="neutral" trailing-icon="i-ph-arrow-right" :to="proceduresUrl">
					{{ $t('dms_automation.attention.showAll', { count: total }) }}
				</UButton>
			</div>
		</template>
	</DmsCard>
</template>
