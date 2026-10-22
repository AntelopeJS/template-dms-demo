<script setup lang="ts">
import { computed } from 'vue'
import type { RunDetail } from '../../composables/useAutomationRuns'
import { describeDateTime, describeDuration, stepTitle } from '../../utils/describe'

// Each step of this run next to the same step in the last successful run,
// every iteration added up: what got slower, by how much, and the steps the
// last success went through that this run never reached.

const props = defineProps<{ run: RunDetail; traceUrl: string }>()

const { processI18n } = useTranslation()
const { dateTimeFormat } = useRegionalFormat()

// A gap under this share of the last success's time, or under a few
// milliseconds, reads as noise.
const NOTABLE_GAP = 0.2
const NOTABLE_GAP_MS = 5

interface Row {
	nodeId: string
	name: string
	before: number | null
	now: number | null
	/** This run never got to the step. */
	notReached: boolean
	tone: 'failed' | 'handled' | 'ok'
}

const rows = computed<Row[]>(() => {
	const before = props.run.lastSuccess?.stepDurations ?? {}
	const rowsById = new Map<string, Row>()
	for (const step of props.run.trace.steps) {
		const row = rowsById.get(step.nodeId) ?? {
			nodeId: step.nodeId,
			name: stepTitle(step.name, processI18n),
			before: before[step.nodeId] ?? null,
			now: null,
			notReached: false,
			tone: 'ok',
		}
		if (step.durationMs !== null) row.now = (row.now ?? 0) + step.durationMs
		if (step.status === 'failed') row.tone = step.handled && row.tone !== 'failed' ? 'handled' : 'failed'
		rowsById.set(step.nodeId, row)
	}
	const skippedNames = new Map(props.run.trace.skipped.map((s) => [s.nodeId, stepTitle(s.name, processI18n)]))
	const labels = new Map((props.run.graph?.nodes ?? []).flatMap((n) => (n.label ? [[n.id, n.label] as const] : [])))
	// A step this run never reached reads as one row, its inner steps (a
	// group's) added up into it.
	for (const [flatId, ms] of Object.entries(before)) {
		if (rowsById.has(flatId)) continue
		const nodeId = flatId.split('__')[0] ?? flatId
		const row = rowsById.get(nodeId) ?? {
			nodeId,
			name: skippedNames.get(nodeId) ?? labels.get(nodeId) ?? nodeId,
			before: null,
			now: null,
			notReached: true,
			tone: 'ok',
		}
		if (row.notReached && ms !== null) row.before = (row.before ?? 0) + ms
		rowsById.set(nodeId, row)
	}
	return [...rowsById.values()]
})

function gapOf(before: number | null, now: number | null): number | null {
	return before === null || now === null ? null : now - before
}

function gapClass(before: number | null, now: number | null): string {
	const gap = gapOf(before, now)
	if (gap === null || before === null || Math.abs(gap) <= Math.max(before * NOTABLE_GAP, NOTABLE_GAP_MS)) return 'text-muted'
	return gap > 0 ? 'text-warning' : 'text-success'
}

function describeGap(gap: number | null): string {
	if (gap === null || Math.round(gap) === 0) return ''
	return `${gap >= 0 ? '+' : '−'}${describeDuration(Math.abs(gap))}`
}

const NOW_CLASS = { failed: 'text-error', handled: 'text-warning', ok: 'text-toned' } as const

const GRID = 'grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-3'
</script>

<template>
	<div v-if="run.lastSuccess" class="flex flex-col">
		<div :class="GRID" class="items-end border-b border-default pb-1.5 font-mono text-[10.5px] text-dimmed uppercase">
			<span>{{ $t('dms_automation.trace.step') }}</span>
			<DmsLink :to="`${traceUrl}?run=${encodeURIComponent(run.lastSuccess.runId)}`" class="flex flex-col text-right hover:text-highlighted">
				<span>{{ $t('dms_automation.trace.compareLastSuccess') }}</span>
				<span class="whitespace-nowrap normal-case">{{ describeDateTime(run.lastSuccess.startedAt, dateTimeFormat) }}</span>
			</DmsLink>
			<span class="text-right">{{ $t('dms_automation.trace.now') }}</span>
			<span class="text-right">{{ $t('dms_automation.trace.compareGap') }}</span>
		</div>
		<div v-for="row in rows" :key="row.nodeId" :class="GRID" class="border-b border-default py-1.5 text-xs">
			<span class="truncate" :class="row.notReached ? 'text-muted' : 'text-toned'">{{ row.name }}</span>
			<span class="text-right font-mono text-muted tabular-nums">{{ describeDuration(row.before) }}</span>
			<span v-if="row.notReached" class="text-right text-muted">{{ $t('dms_automation.trace.compareNotReached') }}</span>
			<span v-else class="text-right font-mono tabular-nums" :class="NOW_CLASS[row.tone]">{{ describeDuration(row.now) }}</span>
			<span class="text-right font-mono tabular-nums" :class="gapClass(row.before, row.now)">{{ describeGap(gapOf(row.before, row.now)) }}</span>
		</div>
		<div :class="GRID" class="pt-1.5 text-xs font-medium">
			<span class="text-toned">{{ $t('dms_automation.trace.compareTotal') }}</span>
			<span class="text-right font-mono text-muted tabular-nums">{{ describeDuration(run.lastSuccess.durationMs) }}</span>
			<span class="text-right font-mono text-toned tabular-nums">{{ describeDuration(run.durationMs) }}</span>
			<span class="text-right font-mono tabular-nums" :class="gapClass(run.lastSuccess.durationMs, run.durationMs)">
				{{ describeGap(gapOf(run.lastSuccess.durationMs, run.durationMs)) }}
			</span>
		</div>
	</div>
	<p v-else class="text-xs text-muted">{{ $t('dms_automation.trace.noSuccessYet') }}</p>
</template>
