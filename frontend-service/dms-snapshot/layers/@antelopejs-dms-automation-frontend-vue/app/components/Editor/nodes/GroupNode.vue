<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { GroupPort } from '../../../composables/useGraphConnect'

interface NodeData {
	label?: string
	icon?: string
	typeId?: string
	templateId?: string
	templateName?: string
	ports?: GroupPort[]
	config?: { name?: string; [k: string]: unknown }
	subgraph?: unknown
}

const props = defineProps<{
	id: string
	data: NodeData
	selected?: boolean
}>()

const ports = computed<GroupPort[]>(() =>
	Array.isArray(props.data?.ports) ? props.data.ports : [],
)

const triggerInPorts = computed(() =>
	ports.value.filter((p) => p.kind === 'trigger' && p.direction === 'in'),
)
const triggerOutPorts = computed(() =>
	ports.value.filter((p) => p.kind === 'trigger' && p.direction === 'out'),
)
const dataInPorts = computed(() =>
	ports.value.filter((p) => p.kind === 'data' && p.direction === 'in'),
)
const dataOutPorts = computed(() =>
	ports.value.filter((p) => p.kind === 'data' && p.direction === 'out'),
)

const isTemplateInstance = computed(() => Boolean(props.data?.templateId))

// GraphCanvas resolves the name: the step name, else the group's own name.
const title = computed(() => props.data?.label ?? props.data?.config?.name)

const headerIcon = computed(() =>
	isTemplateInstance.value ? 'i-ph-link' : 'i-ph-package',
)

import { dataHandleStyle, triggerStyle } from './styles'

// Mirror the convention used by GenericNode: the trigger port named "main"
// lives on the title bar (left for trigger-in, right for trigger-out). Any
// other trigger ports spill into the body rows below, interleaved with the
// data port rows. If no port is named "main", the title bar has no trigger
// handle on that side — the user picks which port is the "main" one by
// naming it.
const mainTriggerIn = computed(
	() => triggerInPorts.value.find((p) => p.name === 'main') ?? null,
)
const mainTriggerOut = computed(
	() => triggerOutPorts.value.find((p) => p.name === 'main') ?? null,
)
const extraTriggerIn = computed(() =>
	triggerInPorts.value.filter((p) => p.name !== 'main'),
)
const extraTriggerOut = computed(() =>
	triggerOutPorts.value.filter((p) => p.name !== 'main'),
)

// Body rows: left column shows trigger-in extras followed by data-in ports;
// right column shows trigger-out extras followed by data-out ports. Each row
// gets one entry per side (may be null if that side has fewer entries).
interface LeftRow {
	kind: 'trigger' | 'data'
	port: GroupPort
}
interface RightRow {
	kind: 'trigger' | 'data'
	port: GroupPort
}
const leftRows = computed<LeftRow[]>(() => [
	...extraTriggerIn.value.map((p) => ({ kind: 'trigger' as const, port: p })),
	...dataInPorts.value.map((p) => ({ kind: 'data' as const, port: p })),
])
const rightRows = computed<RightRow[]>(() => [
	...extraTriggerOut.value.map((p) => ({ kind: 'trigger' as const, port: p })),
	...dataOutPorts.value.map((p) => ({ kind: 'data' as const, port: p })),
])
const bodyRowCount = computed(() =>
	Math.max(leftRows.value.length, rightRows.value.length),
)
const hasAnyPorts = computed(
	() =>
		mainTriggerIn.value !== null ||
		mainTriggerOut.value !== null ||
		bodyRowCount.value > 0,
)
</script>

<template>
	<div
		class="dms-automation-node group-node relative min-w-[220px] rounded-lg border bg-default shadow-sm"
		:class="
			selected
				? 'border-primary ring-1 ring-primary'
				: 'border-default'
		"
	>
		<!-- Header — main trigger-in (left) / main trigger-out (right), mirroring
		     the GenericNode convention. -->
		<div
			class="relative flex items-center gap-2 rounded-t-lg border-b border-default bg-elevated px-3 py-2"
		>
			<Handle
				v-if="mainTriggerIn"
				:id="`group-trigger-in-${mainTriggerIn.name}`"
				type="target"
				:position="Position.Left"
				:style="triggerStyle"
			/>
			<div class="relative">
				<UIcon :name="headerIcon" class="size-4 text-primary" />
			</div>
			<div class="truncate text-sm font-medium text-highlighted">
				{{ title }}
			</div>
			<span
				v-if="isTemplateInstance"
				class="ml-auto inline-flex items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary"
				:title="$t('dms_automation.nodes.linkedHint')"
			>
				<UIcon name="i-ph-link" class="w-3 h-3" />
				{{ $t('dms_automation.nodes.linked') }}
			</span>
			<Handle
				v-if="mainTriggerOut"
				:id="`group-trigger-out-${mainTriggerOut.name}`"
				type="source"
				:position="Position.Right"
				:style="triggerStyle"
			/>
		</div>

		<!-- Body rows: trigger-in extras + data-in on the left, trigger-out
		     extras + data-out on the right. -->
		<div v-if="bodyRowCount > 0" class="py-2 text-xs text-dimmed">
			<div
				v-for="i in bodyRowCount"
				:key="`row-${i - 1}`"
				class="relative flex items-stretch py-1"
			>
				<div class="flex-1 flex items-center gap-1 pl-3">
					<template v-if="leftRows[i - 1]">
						<Handle
							v-if="leftRows[i - 1]!.kind === 'trigger'"
							:id="`group-trigger-in-${leftRows[i - 1]!.port.name}`"
							type="target"
							:position="Position.Left"
							:style="triggerStyle"
						/>
						<Handle
							v-else
							:id="`group-data-in-${leftRows[i - 1]!.port.name}`"
							type="target"
							:position="Position.Left"
							:style="dataHandleStyle(leftRows[i - 1]!.port)"
						/>
						<span>{{ leftRows[i - 1]!.port.name }}</span>
					</template>
				</div>
				<div class="flex-1 flex items-center justify-end gap-1 pr-3">
					<template v-if="rightRows[i - 1]">
						<span>{{ rightRows[i - 1]!.port.name }}</span>
						<Handle
							v-if="rightRows[i - 1]!.kind === 'trigger'"
							:id="`group-trigger-out-${rightRows[i - 1]!.port.name}`"
							type="source"
							:position="Position.Right"
							:style="triggerStyle"
						/>
						<Handle
							v-else
							:id="`group-data-out-${rightRows[i - 1]!.port.name}`"
							type="source"
							:position="Position.Right"
							:style="dataHandleStyle(rightRows[i - 1]!.port)"
						/>
					</template>
				</div>
			</div>
		</div>
		<div
			v-else-if="!hasAnyPorts"
			class="py-2 px-3 text-xs text-dimmed italic"
		>
			{{ $t('dms_automation.nodes.noPorts') }}
		</div>
	</div>
</template>
