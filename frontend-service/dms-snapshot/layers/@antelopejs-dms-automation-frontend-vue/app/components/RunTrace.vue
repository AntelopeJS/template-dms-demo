<script setup lang="ts">
import { computed, ref } from 'vue'
import {
	builderRunUrl,
	opensInBuilder,
	type RunDetail,
	type RunNeighbour,
	type TraceStep,
	useAutomationRuns,
} from '../composables/useAutomationRuns'
import { useRunActions } from '../composables/useRunActions'
import {
	describeDateTime,
	describeDuration,
	type StepName,
} from '../utils/describe'

// The run trace page (`?run=<id>`): one run, linkable. Why it failed comes
// first, under the header; then its steps on a time line, the payload and the
// log in tabs, and beside them the path it took and how it compares with the
// last success.

const props = defineProps<{
	apiUrl: string
	runsUrl: string
	builderUrl: string
	traceUrl: string
}>()

const route = useDmsRoute()
const router = useDmsRouter()
const { processText } = useComposedText()
const { t, locale } = useI18n()
const { dateTimeFormat } = useRegionalFormat()
const runs = useAutomationRuns(props.apiUrl)
const { rerun, rerunning } = useRunActions({ apiUrl: props.apiUrl, traceUrl: props.traceUrl })

const runId = computed(() => {
	const q = route.query.run
	return typeof q === 'string' ? q : Array.isArray(q) ? (q[0] ?? null) : null
})

const HTTP_NOT_FOUND = 404

function statusOf(e: unknown): number | undefined {
	const error = e as { statusCode?: number; response?: { status?: number } }
	return error.statusCode ?? error.response?.status
}

const runRead = runs.readRun(runId)
// Until another run's read answers, the run on screen stays; a run that did
// not load shows why instead.
const run = computed<RunDetail | null>(() => (runRead.error.value ? null : runRead.data.value))
const loading = computed(() => runRead.pending.value)
/** Why the run did not load: no id given, no such run, or another error. */
const failure = computed<{ reason: 'noRun' | 'notFound' | 'error'; message?: string } | null>(() => {
	if (!runId.value) return { reason: 'noRun' }
	const error = runRead.error.value
	if (!error) return null
	return statusOf(error) === HTTP_NOT_FOUND ? { reason: 'notFound' } : { reason: 'error', message: describeApiError(error) }
})
const tab = ref('steps')
const pathOnly = ref(false)

function load() {
	void runRead.refresh()
}

const names = computed(() => {
	const map = new Map<string, StepName>()
	for (const step of run.value?.trace.steps ?? []) map.set(step.nodeId, step.name)
	return map
})

const deleted = computed(() => !!run.value && !run.value.procedure)
const procedureName = computed(
	() => run.value?.procedure?.name ?? run.value?.procedureName ?? t('dms_automation.feed.deletedProcedure'),
)
const failed = computed(() => run.value?.status === 'failed')
const startedAt = computed(() => describeDateTime(run.value?.startedAt, dateTimeFormat))
const statusLabel = computed(() => (failed.value ? t('dms_automation.runs.status.failed') : t('dms_automation.runs.status.ok')))

useHead({
	title: () => (run.value ? `${statusLabel.value} · ${procedureName.value} · ${startedAt.value}` : t('dms_automation.trace.title')),
})

const historyUrl = computed(() =>
	run.value ? `${props.runsUrl}?procedure=${encodeURIComponent(run.value.procedureId)}` : props.runsUrl,
)

/** The steps of the graph the run went through, each once, in order. */
const ranSteps = computed(() => [...new Set((run.value?.trace.steps ?? []).map((s) => s.nodeId))])
const totalSteps = computed(() => ranSteps.value.length + (run.value?.trace.skipped.length ?? 0))

/**
 * The step that stopped the run: the last failure no Try/Catch or Retry
 * caught, at the node the run failed at.
 */
const fatalStep = computed<TraceStep | undefined>(() => {
	const steps = run.value?.trace.steps ?? []
	const fatal = steps.filter((s) => s.status === 'failed' && !s.handled)
	const last = [...fatal].reverse()
	return last.find((s) => s.nodeId === run.value?.failedNodeId) ?? last[0]
})

const stepPosition = computed(() => ({
	index: fatalStep.value ? ranSteps.value.indexOf(fatalStep.value.nodeId) + 1 : 0,
	total: totalSteps.value,
}))

// Without the graph that ran, or with a gap in the log, the steps the run did
// not reach are unknown: so is the total.
const totalKnown = computed(() => !!run.value?.graph && !run.value.graphOutdated && !run.value.trace.truncated)

const durationDelta = computed(() => {
	const r = run.value
	if (!r || r.durationMs === null || r.usualDurationMs === null) return null
	return r.durationMs - r.usualDurationMs
})

const olderVersion = computed(() => {
	const r = run.value
	if (!r?.procedure || !r.procedureVersion) return false
	return r.procedureVersion < r.procedure.version
})

/** The version tile: the draft a test ran, the version, or why it is unknown. */
const version = computed(() => {
	const r = run.value
	if (!r) return { value: '', detail: '', tone: 'neutral' as const }
	if (r.kind === 'test') {
		return { value: t('dms_automation.trace.draft'), detail: t('dms_automation.trace.draftDetail'), tone: 'neutral' as const }
	}
	const value = r.procedureVersion ? `v${r.procedureVersion}` : '—'
	if (!r.procedure) return { value, detail: t('dms_automation.trace.procedureDeleted'), tone: 'neutral' as const }
	if (!r.procedureVersion) return { value, detail: t('dms_automation.trace.versionUnknown'), tone: 'neutral' as const }
	if (olderVersion.value) {
		return { value, detail: t('dms_automation.trace.olderVersionShort', { version: r.procedure.version }), tone: 'warning' as const }
	}
	return { value, detail: t('dms_automation.trace.currentVersion'), tone: 'neutral' as const }
})

// A webhook path can be long: the tile keeps its last segment, the detail
// line and the header say it whole.
function shortTrigger(r: RunDetail): string {
	const full = processText(r.triggerText)
	const path = r.trigger?.path
	if (!path) return full
	const segments = path.split('/').filter(Boolean)
	return segments.length > 1 ? `${r.trigger?.method ?? 'POST'} …/${segments.at(-1)}` : full
}

const stats = computed(() => {
	const r = run.value
	if (!r) return []
	const delta = durationDelta.value
	const trigger = processText(r.triggerText)
	const triggerShort = shortTrigger(r)
	const kind = r.kind && r.kind !== 'run' ? t(`dms_automation.runs.kind.${r.kind}`) : ''
	return [
		{
			id: 'status',
			eyebrow: t('dms_automation.trace.status'),
			value: statusLabel.value,
			detail: failed.value && stepPosition.value.index > 0
				? t(totalKnown.value ? 'dms_automation.trace.atStep' : 'dms_automation.trace.atStepOnly', stepPosition.value)
				: t('dms_automation.trace.stepsDone', { count: ranSteps.value.length }, ranSteps.value.length),
			detailTone: failed.value ? ('error' as const) : ('neutral' as const),
			icon: failed.value ? 'i-ph-x-circle' : 'i-ph-check-circle',
			tone: failed.value ? ('error' as const) : ('success' as const),
		},
		{
			id: 'duration',
			eyebrow: t('dms_automation.trace.duration'),
			value: describeDuration(r.durationMs, locale.value),
			detail: delta === null
				? ''
				: t(delta >= 0 ? 'dms_automation.trace.slowerThanUsual' : 'dms_automation.trace.fasterThanUsual', {
						delta: describeDuration(Math.abs(delta), locale.value),
					}),
			detailTone: delta !== null && delta > (r.usualDurationMs ?? 0) ? ('warning' as const) : ('neutral' as const),
			icon: 'i-ph-timer',
		},
		{
			id: 'trigger',
			eyebrow: t('dms_automation.trace.trigger'),
			value: triggerShort,
			detail: [kind, triggerShort === trigger ? '' : trigger].filter(Boolean).join(' · '),
			icon: 'i-ph-lightning',
		},
		{
			id: 'version',
			eyebrow: t('dms_automation.trace.version'),
			value: version.value.value,
			detail: version.value.detail,
			detailTone: version.value.tone,
			icon: 'i-ph-git-commit',
		},
	]
})

const tabs = computed(() => {
	const r = run.value
	const skipped = r?.trace.skipped.length ?? 0
	return [
		{
			label: t('dms_automation.trace.tabs.steps'),
			value: 'steps',
			badge: skipped ? `${ranSteps.value.length}/${totalSteps.value}` : ranSteps.value.length,
		},
		{ label: t('dms_automation.trace.tabs.payload'), value: 'payload' },
		{ label: t('dms_automation.trace.tabs.logs'), value: 'logs', badge: r?.logCount ?? r?.logs?.entries.length },
	]
})

/** Whose graph was not kept: the draft a test ran, a version, or an unknown one. */
const outdatedTitle = computed(() => {
	const r = run.value
	if (r?.kind === 'test') return t('dms_automation.trace.draftNotKept')
	return r?.procedureVersion
		? t('dms_automation.trace.graphNotKept', { version: r.procedureVersion })
		: t('dms_automation.trace.graphNotKeptUnknown')
})

// A test ran a draft the builder does not have: its builder buttons stay,
// disabled, saying why.
const builderHint = computed(() =>
	run.value?.procedure && !opensInBuilder(run.value) ? t('dms_automation.trace.builderDraftHint') : '',
)

function debugInBuilder(node?: string) {
	if (run.value && opensInBuilder(run.value)) void router.push(builderRunUrl(props.builderUrl, run.value, node))
}

/** The previous and next runs of the procedure, with how they ended. */
const neighbours = computed(() => {
	const r = run.value
	const list: Array<{ key: string; label: string; icon: string; run: RunNeighbour }> = []
	if (r?.previous) list.push({ key: 'previous', label: t('dms_automation.trace.previousRun'), icon: 'i-ph-arrow-left', run: r.previous })
	if (r?.next) list.push({ key: 'next', label: t('dms_automation.trace.nextRun'), icon: 'i-ph-arrow-right', run: r.next })
	return list
})

function openRun(id: string) {
	void router.push(`${props.traceUrl}?run=${encodeURIComponent(id)}`)
}
</script>

<template>
	<div class="flex flex-col gap-5">
		<div v-if="loading && !run" class="flex flex-col gap-4">
			<USkeleton class="h-8 w-80" />
			<USkeleton class="h-20 w-full" />
			<USkeleton class="h-80 w-full" />
		</div>

		<DmsEmptyState
			v-else-if="failure?.reason === 'noRun'"
			icon="i-ph-path"
			size="lg"
			:title="$t('dms_automation.trace.noRun')"
			:description="$t('dms_automation.trace.noRunHint')"
			:actions="[{ label: $t('dms_automation.runs.title'), icon: 'i-ph-list-bullets', to: runsUrl }]"
		/>

		<DmsEmptyState
			v-else-if="failure?.reason === 'notFound'"
			icon="i-ph-magnifying-glass"
			size="lg"
			:title="$t('dms_automation.trace.notFound')"
			:description="$t('dms_automation.trace.notFoundHint')"
			:actions="[{ label: $t('dms_automation.runs.title'), icon: 'i-ph-list-bullets', to: runsUrl }]"
		/>

		<DmsEmptyState
			v-else-if="failure"
			variant="error"
			size="lg"
			:title="$t('dms_automation.trace.loadError')"
			:description="failure.message"
			:actions="[
				{ label: $t('dms_automation.common.retry'), icon: 'i-ph-arrow-clockwise', onClick: load },
				{ label: $t('dms_automation.runs.title'), variant: 'outline', color: 'neutral', to: runsUrl },
			]"
		/>

		<template v-else-if="run">
			<header class="flex flex-wrap items-start gap-4">
				<div class="flex min-w-0 flex-1 flex-col gap-1">
					<DmsLink :to="historyUrl" class="inline-flex w-fit items-center gap-1 text-xs text-muted hover:text-highlighted">
						<UIcon name="i-ph-arrow-left" class="size-3.5" />
						{{ $t('dms_automation.runs.title') }}
					</DmsLink>
					<div class="flex min-w-0 flex-wrap items-center gap-2">
						<h1 class="truncate text-xl font-semibold text-highlighted">{{ procedureName }}</h1>
						<DmsStatusPill :tone="failed ? 'error' : 'success'" :label="statusLabel" />
						<UBadge v-if="run.kind === 'test'" color="info" variant="subtle" size="sm">
							{{ $t('dms_automation.runs.kind.test') }}
						</UBadge>
						<UBadge v-if="deleted" color="neutral" variant="subtle" size="sm">
							{{ $t('dms_automation.trace.deleted') }}
						</UBadge>
					</div>
					<!-- Spaced, not dotted: a separator would dangle where the line wraps. -->
					<p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
						<span class="inline-flex items-center gap-1">
							<span class="font-mono text-xs">{{ run._id }}</span>
							<DmsCopyButton :value="run._id" />
						</span>
						<span>{{ $t('dms_automation.trace.startedBy', { time: startedAt, trigger: processText(run.triggerText) }) }}</span>
						<span v-if="run.instanceId" class="font-mono text-xs text-dimmed" :title="$t('dms_automation.trace.instance')">
							{{ $t('dms_automation.trace.onInstance', { instance: run.instanceId.slice(0, 8) }) }}
						</span>
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<UButton
						v-for="neighbour in neighbours"
						:key="neighbour.key"
						color="neutral"
						variant="ghost"
						:icon="neighbour.icon"
						@click="openRun(neighbour.run.runId)"
					>
						{{ neighbour.label }}
						<span class="sr-only">({{ neighbour.run.status === 'failed' ? $t('dms_automation.runs.status.failed') : $t('dms_automation.runs.status.ok') }})</span>
						<UIcon
							:name="neighbour.run.status === 'failed' ? 'i-ph-x-circle' : 'i-ph-check-circle'"
							class="size-4"
							:class="neighbour.run.status === 'failed' ? 'text-error' : 'text-success'"
						/>
					</UButton>
					<UButton
						v-if="run.procedure && run.payloadKept"
						color="neutral"
						variant="outline"
						icon="i-ph-arrow-clockwise"
						:loading="rerunning"
						@click="rerun(run._id, procedureName)"
					>
						{{ $t('dms_automation.runs.rerunWithPayload') }}
					</UButton>
					<UTooltip v-if="run.procedure" :text="builderHint" :disabled="!builderHint">
						<span class="inline-flex">
							<UButton color="primary" icon="i-ph-bug" :disabled="!!builderHint" @click="debugInBuilder()">
								{{ $t('dms_automation.trace.debugInBuilder') }}
							</UButton>
						</span>
					</UTooltip>
				</div>
			</header>

			<DmsAutomationRunFailure v-if="failed" :run="run" :trace-url="traceUrl">
				<UTooltip v-if="run.procedure" :text="builderHint" :disabled="!builderHint">
					<span class="inline-flex">
						<UButton
							size="xs"
							color="error"
							variant="soft"
							icon="i-ph-crosshair"
							:disabled="!!builderHint"
							@click="debugInBuilder(run.failedNodeId)"
						>
							{{ $t('dms_automation.trace.openStep') }}
						</UButton>
					</span>
				</UTooltip>
				<p v-if="builderHint" class="basis-full text-xs text-muted">{{ builderHint }}</p>
			</DmsAutomationRunFailure>

			<DmsBanner
				v-if="run.graphOutdated"
				size="sm"
				tone="warning"
				icon="i-ph-git-commit"
				:title="outdatedTitle"
				:description="$t('dms_automation.trace.graphNotKeptHint', { current: run.procedure?.version })"
			/>
			<DmsBanner
				v-else-if="olderVersion"
				size="sm"
				tone="info"
				icon="i-ph-git-commit"
				:title="$t('dms_automation.trace.olderVersion', { version: run.procedureVersion })"
				:description="$t('dms_automation.trace.olderVersionHint', { current: run.procedure?.version })"
			/>
			<DmsBanner
				v-if="run.rerunOf"
				size="sm"
				tone="info"
				icon="i-ph-arrow-clockwise"
				:title="$t('dms_automation.trace.rerunOf')"
			>
				<template #actions>
					<UButton size="xs" variant="soft" color="info" @click="openRun(run.rerunOf)">
						{{ $t('dms_automation.trace.openOriginal') }}
					</UButton>
				</template>
			</DmsBanner>

			<DmsStatGroup :items="stats" layout="joined" :columns="4" />

			<div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<DmsCard :padded="false">
					<div class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-3 pt-2">
						<UTabs v-model="tab" :items="tabs" variant="link" :content="false" size="sm" />
						<USwitch
							v-if="tab === 'steps'"
							v-model="pathOnly"
							size="xs"
							:label="$t('dms_automation.trace.pathOnly')"
							class="pb-2"
						/>
					</div>
					<DmsAutomationRunWaterfall
						v-if="tab === 'steps'"
						:steps="run.trace.steps"
						:skipped="run.trace.skipped"
						:total-ms="run.durationMs"
						:path-only="pathOnly"
						:truncated="run.trace.truncated"
					/>
					<div v-else-if="tab === 'payload'" class="p-3">
						<DmsAutomationRunPayload :raw="run.triggerPayload" :kept="run.payloadKept" />
					</div>
					<DmsAutomationRunLogList v-else :api-url="apiUrl" :run-id="run._id" :log="run.logs" :names="names" />
				</DmsCard>

				<div class="flex flex-col gap-4">
					<DmsCard>
						<template #header>
							<DmsEyebrow as="h2" tone="muted" truncate :label="$t('dms_automation.trace.pathTaken')" />
						</template>
						<template v-if="opensInBuilder(run) && !run.graphOutdated" #actions>
							<UButton size="xs" variant="ghost" color="neutral" trailing-icon="i-ph-arrow-up-right" @click="debugInBuilder()">
								{{ $t('dms_automation.trace.openInBuilder') }}
							</UButton>
						</template>
						<DmsAutomationRunPathTaken :run="run" :builder-url="builderUrl" />
					</DmsCard>
					<DmsCard>
						<template #header>
							<DmsEyebrow as="h2" tone="muted" truncate :label="$t('dms_automation.trace.compared')" />
						</template>
						<DmsAutomationRunCompare :run="run" :trace-url="traceUrl" />
					</DmsCard>
				</div>
			</div>
		</template>
	</div>
</template>
