<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { dataStyle, triggerStyle } from './styles'
import { describeDuration, type NodeRole } from '../../../utils/describe'
import type { PortRef } from '../../../composables/useAutomationNodeKinds'

// One node of the procedure graph. Its header names it (the label the builder
// gave it, else its type) under a type eyebrow coloured by its role, then one
// line saying what it does (AU-10). After a run the header carries the step's
// outcome; a node with a problem carries it in a strip at the bottom.

/** The last run's outcome of the node, drawn over the canvas. */
export interface NodeRunState {
	status: 'ok' | 'failed' | 'skipped'
	durationMs?: number | null
}

interface NodeData {
	label?: string
	typeName?: string
	icon?: string
	role?: NodeRole
	/** Module that registered the node's type, when not this one. */
	module?: string
	summary?: string
	run?: NodeRunState | null
	issue?: { severity: 'error' | 'warning'; message: string } | null
	/** Small uppercase badge in the top-right of the header (data nodes). */
	category?: string
	hasTriggerIn?: boolean
	hasMainTriggerOut?: boolean
	triggerOuts?: string[]
	dataIns?: PortRef[]
	dataOuts?: PortRef[]
}

const props = defineProps<{
	id: string
	data: NodeData
	selected?: boolean
}>()

const hasTriggerIn = computed(() => props.data?.hasTriggerIn !== false)
const hasMainTriggerOut = computed(() => props.data?.hasMainTriggerOut !== false)
const triggerOuts = computed<string[]>(() => props.data?.triggerOuts ?? [])
const dataIns = computed<PortRef[]>(() => props.data?.dataIns ?? [])
const dataOuts = computed<PortRef[]>(() => props.data?.dataOuts ?? [])

const ROLE_TEXT: Record<NodeRole, string> = {
	trigger: 'text-info',
	flow: 'text-warning',
	data: 'text-success',
	action: 'text-primary',
	helper: 'text-secondary',
	group: 'text-muted',
}

const roleClass = computed(() => ROLE_TEXT[props.data?.role ?? 'flow'])

const borderClass = computed(() => {
	if (props.selected) return 'border-primary ring-1 ring-primary'
	if (props.data?.run?.status === 'failed' || props.data?.issue?.severity === 'error') return 'border-error'
	if (props.data?.issue?.severity === 'warning') return 'border-warning/70'
	if (props.data?.run?.status === 'ok') return 'border-success/60'
	return 'border-default'
})

const dimmed = computed(() => props.data?.run?.status === 'skipped')

const { processI18n } = useTranslation()
const { t, te } = useI18n()

// A data node's category, in words ("Logic" for `boolean`).
const categoryLabel = computed(() => {
	const category = props.data?.category
	if (!category) return undefined
	const key = `dms_automation.types.dataCategories.${category}`
	return te(key) ? t(key) : category
})

// The eyebrow names the type when the node has a label of its own, and the
// node's role otherwise, so a bare node does not read its type twice.
const eyebrow = computed(() => {
	const d = props.data
	if (d?.label && d.label !== d.typeName) return d.typeName
	return processI18n(`$dms_automation.nodes.role.${d?.role ?? 'flow'}`)
})

interface BodyRow {
	leftDataIn?: PortRef
	rightTriggerOut?: string
	rightDataOut?: PortRef
}

// Body layout: each trigger-out paired with the next data-in on its row, then
// the remaining data-ins next to the data-outs.
const rows = computed<BodyRow[]>(() => {
	const r: BodyRow[] = []
	const ti = [...triggerOuts.value]
	const di = [...dataIns.value]
	const dout = [...dataOuts.value]
	while (ti.length > 0) r.push({ leftDataIn: di.shift(), rightTriggerOut: ti.shift() })
	const remaining = Math.max(di.length, dout.length)
	for (let i = 0; i < remaining; i++) r.push({ leftDataIn: di[i], rightDataOut: dout[i] })
	return r
})
</script>

<template>
	<div
		class="dms-automation-node generic-node relative w-[230px] rounded-lg border bg-default shadow-sm transition-opacity"
		:class="[borderClass, dimmed ? 'opacity-50' : '']"
	>
		<div class="relative flex items-start gap-2 rounded-t-lg border-b border-default bg-elevated px-3 py-2">
			<Handle v-if="hasTriggerIn" id="trigger-in" type="target" :position="Position.Left" :style="triggerStyle" />
			<UIcon :name="data.icon || 'i-ph-circle'" class="mt-3 size-4 shrink-0" :class="roleClass" />
			<div class="flex min-w-0 flex-1 flex-col">
				<span class="truncate font-mono text-[9.5px] tracking-wider uppercase" :class="roleClass">
					{{ eyebrow }}<template v-if="data.module"> · {{ data.module }}</template>
				</span>
				<span class="truncate text-sm font-medium text-highlighted">{{ data.label || data.typeName || 'Node' }}</span>
				<span v-if="data.summary" class="truncate font-mono text-[10.5px] text-muted">{{ data.summary }}</span>
			</div>
			<span
				v-if="data.run && data.run.status !== 'skipped'"
				class="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded px-1 font-mono text-[10px]"
				:class="data.run.status === 'failed' ? 'bg-error/15 text-error' : 'bg-success/15 text-success'"
			>
				<UIcon :name="data.run.status === 'failed' ? 'i-ph-x' : 'i-ph-check'" class="size-3" />
				{{ describeDuration(data.run.durationMs) }}
			</span>
			<span v-else-if="categoryLabel" class="ml-auto shrink-0 text-[10px] text-dimmed uppercase">{{ categoryLabel }}</span>
			<Handle v-if="hasMainTriggerOut" id="trigger-out-main" type="source" :position="Position.Right" :style="triggerStyle" />
		</div>

		<div v-if="rows.length > 0" class="py-2 text-xs text-dimmed">
			<div v-for="(row, i) in rows" :key="i" class="relative flex items-stretch py-1">
				<div class="flex flex-1 items-center gap-1 pl-3">
					<template v-if="row.leftDataIn">
						<Handle :id="`data-in-${row.leftDataIn.name}`" type="target" :position="Position.Left" :style="dataStyle" />
						<span>{{ row.leftDataIn.name }}</span>
					</template>
				</div>
				<div class="flex flex-1 items-center justify-end gap-1 pr-3">
					<template v-if="row.rightTriggerOut">
						<span>{{ row.rightTriggerOut }}</span>
						<Handle :id="`trigger-out-${row.rightTriggerOut}`" type="source" :position="Position.Right" :style="triggerStyle" />
					</template>
					<template v-else-if="row.rightDataOut">
						<span>{{ row.rightDataOut.name }}</span>
						<Handle :id="`data-out-${row.rightDataOut.name}`" type="source" :position="Position.Right" :style="dataStyle" />
					</template>
				</div>
			</div>
		</div>

		<div
			v-if="data.issue"
			class="flex items-start gap-1.5 rounded-b-lg border-t px-3 py-1.5 text-[11px]"
			:class="data.issue.severity === 'error' ? 'border-error/40 bg-error/10 text-error' : 'border-warning/40 bg-warning/10 text-warning'"
		>
			<UIcon name="i-ph-warning" class="mt-0.5 size-3 shrink-0" />
			<span class="line-clamp-2">{{ data.issue.message }}</span>
		</div>
	</div>
</template>
