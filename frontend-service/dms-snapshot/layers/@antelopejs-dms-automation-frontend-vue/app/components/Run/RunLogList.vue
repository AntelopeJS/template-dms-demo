<script setup lang="ts">
import { computed, ref } from 'vue'
import { type LogEntry, type RunLog, useAutomationRuns } from '../../composables/useAutomationRuns'
import { describeDuration, prettyJson, stepTitle, type StepName } from '../../utils/describe'

// The run's log as a timed list, named by step instead of node id: every
// executor event and every message a step wrote. It can be narrowed to the
// warnings and errors or to the steps' own messages, searched, jumped to its
// first error and copied. Read with the run when it carries it, else on
// demand.

const props = defineProps<{
	apiUrl: string
	runId: string
	/** The log, when the run came with it. */
	log?: RunLog
	names: Map<string, StepName>
}>()

const { processI18n } = useTranslation()
const { t } = useI18n()
const runs = useAutomationRuns(props.apiUrl)
const expanded = ref<Set<number>>(new Set())

// The log a run did not come with, read once the list shows it. A stored
// run's log does not change: the page's refreshes leave it alone.
const logRead = runs.readLogs(() => (props.log ? null : props.runId), { refreshOnPageRefresh: false })
const log = computed(() => props.log ?? logRead.data.value)
const loading = computed(() => !props.log && logRead.pending.value)
const error = computed(() => (!props.log && logRead.error.value ? describeApiError(logRead.error.value) : null))

const level = ref<'all' | 'problems' | 'errors'>('all')
const stepMessagesOnly = ref(false)
const search = ref('')

const levels = computed(() => [
	{ label: t('dms_automation.trace.logLevelAll'), value: 'all' },
	{ label: t('dms_automation.trace.logLevelProblems'), value: 'problems' },
	{ label: t('dms_automation.trace.logLevelErrors'), value: 'errors' },
])

const LEVELS_SHOWN = {
	all: ['info', 'warn', 'error'],
	problems: ['warn', 'error'],
	errors: ['error'],
} as const

const sorted = computed<LogEntry[]>(() =>
	[...(log.value?.entries ?? [])].sort((a, b) => a.ts - b.ts || a.seq - b.seq),
)

function stepOf(entry: LogEntry): string {
	if (!entry.nodeId) return entry.source
	const name = props.names.get(entry.nodeId)
	return name ? stepTitle(name, processI18n) : entry.nodeId
}

const entries = computed(() => {
	const shown: readonly string[] = LEVELS_SHOWN[level.value]
	const query = search.value.trim().toLowerCase()
	return sorted.value.filter(
		(entry) =>
			shown.includes(entry.level) &&
			(!stepMessagesOnly.value || entry.source === 'log') &&
			(!query || `${entry.message} ${stepOf(entry)}`.toLowerCase().includes(query)),
	)
})

const firstError = computed(() => entries.value.find((e) => e.level === 'error'))

function jumpToFirstError() {
	const entry = firstError.value
	if (!entry) return
	document.getElementById(`log-entry-${entry.seq}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

/** The entries shown, as text: what "Copy" puts on the clipboard. */
const asText = computed(() =>
	entries.value
		.map((e) => `+${describeDuration(e.ts)}\t${e.level.toUpperCase()}\t${stepOf(e)}\t${e.message}`)
		.join('\n'),
)

const LEVEL_ICON = {
	error: { name: 'i-ph-x-circle', class: 'text-error' },
	warn: { name: 'i-ph-warning', class: 'text-warning' },
	info: { name: 'i-ph-dot-outline', class: 'text-dimmed' },
} as const

function toggle(seq: number) {
	const next = new Set(expanded.value)
	if (next.has(seq)) next.delete(seq)
	else next.add(seq)
	expanded.value = next
}
</script>

<template>
	<div class="@container flex flex-col">
		<div v-if="loading" class="flex flex-col gap-2 p-3">
			<USkeleton v-for="i in 4" :key="i" class="h-5 w-full" />
		</div>
		<p v-else-if="error" class="p-3 text-sm text-error">{{ $t('dms_automation.trace.logLoadError') }} {{ error }}</p>
		<template v-else>
			<div class="flex flex-wrap items-center gap-2 border-b border-default px-3 py-2">
				<UInput
					v-model="search"
					size="xs"
					icon="i-ph-magnifying-glass"
					:placeholder="$t('dms_automation.trace.logSearch')"
					:aria-label="$t('dms_automation.trace.logSearch')"
					class="min-w-40 flex-1"
				/>
				<USelect v-model="level" :items="levels" size="xs" class="w-44" :aria-label="$t('dms_automation.trace.logLevel')" />
				<USwitch v-model="stepMessagesOnly" size="xs" :label="$t('dms_automation.trace.logStepMessages')" />
				<div class="ms-auto flex items-center gap-1">
					<UButton
						v-if="firstError"
						size="xs"
						color="error"
						variant="ghost"
						icon="i-ph-arrow-down"
						@click="jumpToFirstError"
					>
						{{ $t('dms_automation.trace.logFirstError') }}
					</UButton>
					<DmsCopyButton :value="asText" :aria-label="$t('dms_automation.trace.logCopy')" />
				</div>
			</div>
			<div v-for="entry in entries" :id="`log-entry-${entry.seq}`" :key="entry.seq" class="border-b border-default">
				<button
					type="button"
					class="grid w-full grid-cols-[4.5rem_1rem_minmax(0,1fr)] items-start gap-2 px-3 py-1.5 text-left font-mono text-xs hover:bg-elevated/60 @xl:grid-cols-[4.5rem_1rem_minmax(0,1fr)_minmax(0,12rem)]"
					:disabled="entry.value === undefined"
					@click="toggle(entry.seq)"
				>
					<span class="text-dimmed tabular-nums">+{{ describeDuration(entry.ts) }}</span>
					<UIcon :name="LEVEL_ICON[entry.level].name" class="mt-0.5 size-3.5" :class="LEVEL_ICON[entry.level].class" />
					<span class="break-words whitespace-pre-wrap" :class="entry.level === 'error' ? 'text-error' : 'text-toned'">{{ entry.message }}</span>
					<span class="col-start-3 truncate text-dimmed @xl:col-start-auto @xl:text-right">{{ stepOf(entry) }}</span>
				</button>
				<pre
					v-if="expanded.has(entry.seq)"
					class="mx-3 mb-2 max-h-64 overflow-auto rounded-md bg-elevated p-2 font-mono text-xs text-toned"
				>{{ prettyJson(entry.value) }}</pre>
			</div>
			<p v-if="sorted.length && !entries.length" class="px-3 py-4 text-center text-sm text-muted">{{ $t('dms_automation.trace.logNoMatch') }}</p>
			<p class="px-3 py-2 font-mono text-[11px] text-dimmed">
				{{ $t('dms_automation.trace.logComplete', { count: sorted.length }) }}
				<template v-if="log?.truncated">· {{ $t('dms_automation.trace.logTruncated', { count: log.truncated }) }}</template>
			</p>
		</template>
	</div>
</template>
