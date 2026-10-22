<script setup lang="ts">
import { computed } from 'vue'
import { builderRunUrl, opensInBuilder, type RunDetail, type TraceStep } from '../../composables/useAutomationRuns'
import { stepTitle } from '../../utils/describe'

// The path the run took, read from its log as a list: each step once, in the
// order it first ran, indented under its loop or try, with how often it ran
// and the branch it chose; the branches it left aside under the step that
// chose. A step opens in the builder on this run. Read from the log, the path
// is the run's own even when the graph that ran was not kept: then only the
// branches left aside, which come from the graph, are not shown.

const props = defineProps<{
	run: RunDetail
	builderUrl?: string
}>()

const { processI18n } = useTranslation()

const topLevel = (id: string) => id.split('__')[0] ?? id

type State = 'ok' | 'failed' | 'handled' | 'running' | 'truncated'

interface PathItem {
	nodeId: string
	title: string
	kind?: string
	depth: number
	runs: number
	state: State
	branch?: string
	/** Branches the step could have taken, and where they led. */
	notTaken: Array<{ branch: string; title: string }>
}

function stateOf(executions: TraceStep[]): State {
	if (executions.some((s) => s.status === 'failed' && !s.handled)) return 'failed'
	if (executions.some((s) => s.status === 'failed')) return 'handled'
	if (executions.some((s) => s.status === 'running')) return 'running'
	if (executions.some((s) => s.status === 'truncated')) return 'truncated'
	return 'ok'
}

// Only a graph that is the one that ran says which branches were left aside.
const graph = computed(() => (props.run.graphOutdated ? null : props.run.graph))

const names = computed(() => {
	const map = new Map<string, string>()
	for (const s of [...props.run.trace.skipped, ...props.run.trace.steps]) map.set(s.nodeId, stepTitle(s.name, processI18n))
	for (const node of graph.value?.nodes ?? []) if (!map.has(node.id) && node.label) map.set(node.id, node.label)
	return map
})

function branchesNotTaken(nodeId: string): PathItem['notTaken'] {
	const taken = new Set(props.run.trace.edgesTaken ?? [])
	const ran = new Set(props.run.trace.steps.map((s) => topLevel(s.nodeId)))
	return (graph.value?.triggerEdges ?? [])
		.filter((e) => e.from.node === nodeId && !taken.has(e.id) && !ran.has(e.to.node))
		.map((e) => ({ branch: e.from.branch ?? 'main', title: names.value.get(e.to.node) ?? e.to.node }))
}

// Steps that choose where the run goes on: the branches they left aside are
// listed under them.
const CHOOSING_KINDS = new Set(['if', 'switch', 'tryCatch', 'retry'])

const items = computed<PathItem[]>(() => {
	const byNode = new Map<string, TraceStep[]>()
	for (const step of props.run.trace.steps) byNode.set(step.nodeId, [...(byNode.get(step.nodeId) ?? []), step])
	return [...byNode.entries()].map(([nodeId, executions]) => {
		const first = executions[0]!
		const branch = executions.map((s) => s.branch).find(Boolean)
		return {
			nodeId,
			title: stepTitle(first.name, processI18n),
			kind: first.name.kind,
			depth: Math.min(...executions.map((s) => s.depth)),
			runs: executions.length,
			state: stateOf(executions),
			branch,
			notTaken: CHOOSING_KINDS.has(first.name.kind ?? '') ? branchesNotTaken(nodeId) : [],
		}
	})
})

const ICON: Record<State, { name: string; class: string }> = {
	ok: { name: 'i-ph-check-circle', class: 'text-success' },
	failed: { name: 'i-ph-x-circle', class: 'text-error' },
	handled: { name: 'i-ph-warning-circle', class: 'text-warning' },
	running: { name: 'i-ph-circle-notch', class: 'text-info' },
	truncated: { name: 'i-ph-scissors', class: 'text-muted' },
}

// The builder opens the procedure on this run with the step selected; not
// when it cannot show the run, nor when the graph shown is not the one that
// ran.
function stepUrl(nodeId: string): string | undefined {
	if (!props.builderUrl || !opensInBuilder(props.run) || props.run.graphOutdated) return undefined
	return builderRunUrl(props.builderUrl, props.run, nodeId)
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<ol v-if="items.length" class="flex max-h-96 flex-col overflow-auto" :aria-label="$t('dms_automation.trace.pathTaken')">
			<li v-for="item in items" :key="item.nodeId" class="flex flex-col" :style="{ paddingInlineStart: `${Math.min(item.depth, 4)}rem` }">
				<!-- DmsLink is registered globally: a link when the step opens in the builder. -->
				<component
					:is="stepUrl(item.nodeId) ? 'DmsLink' : 'span'"
					:to="stepUrl(item.nodeId)"
					class="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm"
					:class="stepUrl(item.nodeId) ? 'hover:bg-elevated' : ''"
				>
					<UIcon :name="ICON[item.state].name" class="size-4 shrink-0" :class="ICON[item.state].class" />
					<span class="truncate text-highlighted">{{ item.title }}</span>
					<span v-if="item.runs > 1" class="shrink-0 font-mono text-xs text-muted">×{{ item.runs }}</span>
					<span v-if="item.branch" class="shrink-0 font-mono text-xs text-muted">→ {{ item.branch }}</span>
				</component>
				<p
					v-for="other in item.notTaken"
					:key="other.branch + other.title"
					class="flex min-w-0 items-center gap-2 py-0.5 ps-8 text-xs text-muted"
				>
					<UIcon name="i-ph-circle-dashed" class="size-3.5 shrink-0" />
					<span class="truncate">{{ $t('dms_automation.trace.branchLeft', { branch: other.branch, step: other.title }) }}</span>
				</p>
			</li>
		</ol>
		<p v-else class="p-2 text-center text-xs text-muted">{{ $t('dms_automation.trace.noSteps') }}</p>
		<p v-if="!run.graph" class="text-xs text-muted">{{ $t('dms_automation.trace.noGraph') }}</p>
		<p v-else-if="run.graphOutdated" class="flex items-start gap-1.5 text-xs text-warning">
			<UIcon name="i-ph-info" class="mt-0.5 size-3.5 shrink-0" />
			{{ $t('dms_automation.trace.pathWithoutGraph') }}
		</p>
		<p v-else-if="run.procedure && !opensInBuilder(run)" class="flex items-start gap-1.5 text-xs text-muted">
			<UIcon name="i-ph-info" class="mt-0.5 size-3.5 shrink-0" />
			{{ $t('dms_automation.trace.builderDraftHint') }}
		</p>
	</div>
</template>
