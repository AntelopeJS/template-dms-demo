<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { GroupPort } from '../../../composables/useGraphConnect'
import { dataHandleStyle, triggerStyle } from './styles'

// Shared body for both group sentinels (groupInput / groupOutput). The two
// are mirror images: `groupInput` exposes the parent group's IN ports as
// SOURCE handles on the right edge; `groupOutput` exposes its OUT ports as
// TARGET handles on the left edge. Naming, icon, label, alignment, and
// empty-state copy all flip on `side`.
//
// Sentinel naming:
//   groupInput-trigger-out-<port> / groupInput-data-out-<port>
//   groupOutput-trigger-in-<port> / groupOutput-data-in-<port>
//
// Sentinels are not user-deletable — enforcement lives in GraphCanvas.vue's
// onNodesChange handler.

interface NodeData {
	ports?: GroupPort[]
}

const props = defineProps<{
	id: string
	data: NodeData
	selected?: boolean
	side: 'in' | 'out'
}>()

const isInput = computed(() => props.side === 'in')
const handleDirection = computed(() => (isInput.value ? 'source' : 'target'))
const handlePosition = computed(() =>
	isInput.value ? Position.Right : Position.Left,
)
const handlePrefix = computed(() => (isInput.value ? 'groupInput' : 'groupOutput'))
const handleVerb = computed(() => (isInput.value ? 'out' : 'in'))
const headerIcon = computed(() => (isInput.value ? 'i-ph-sign-in' : 'i-ph-sign-out'))
const { t } = useI18n()
const headerLabel = computed(() =>
	t(isInput.value ? 'dms_automation.nodes.groupInput' : 'dms_automation.nodes.groupOutput'),
)
const emptyText = computed(() =>
	t(isInput.value ? 'dms_automation.nodes.noInputPorts' : 'dms_automation.nodes.noOutputPorts'),
)
const rowKeyPrefix = computed(() => (isInput.value ? 'gi-row' : 'go-row'))

const ports = computed<GroupPort[]>(() =>
	Array.isArray(props.data?.ports) ? props.data.ports : [],
)

// `groupInput` surfaces the parent's IN ports (they look like sources to
// the inner subgraph); `groupOutput` surfaces the parent's OUT ports
// (sinks to the inner subgraph).
const dataPorts = computed(() =>
	ports.value.filter((p) => p.kind === 'data' && p.direction === props.side),
)
const triggerPorts = computed(() =>
	ports.value.filter((p) => p.kind === 'trigger' && p.direction === props.side),
)

const mainTrigger = computed(
	() => triggerPorts.value.find((p) => p.name === 'main') ?? null,
)
const extraTrigger = computed(() =>
	triggerPorts.value.filter((p) => p.name !== 'main'),
)

interface BodyRow {
	kind: 'trigger' | 'data'
	port: GroupPort
}
const bodyRows = computed<BodyRow[]>(() => [
	...extraTrigger.value.map((p) => ({ kind: 'trigger' as const, port: p })),
	...dataPorts.value.map((p) => ({ kind: 'data' as const, port: p })),
])

function handleId(row: BodyRow): string {
	const subject = row.kind === 'trigger' ? 'trigger' : 'data'
	return `${handlePrefix.value}-${subject}-${handleVerb.value}-${row.port.name}`
}
</script>

<template>
	<div
		class="dms-automation-node group-sentinel relative min-w-[180px] rounded-lg border border-dashed bg-elevated/40 opacity-90"
		:class="[
			isInput ? 'group-input-sentinel' : 'group-output-sentinel',
			selected
				? 'border-primary ring-1 ring-primary'
				: 'border-default',
		]"
	>
		<!-- Header: main trigger handle on the appropriate edge mirrors
		     GroupNode title-bar layout. -->
		<div
			class="relative flex items-center gap-2 px-3 py-1.5 border-b border-dashed border-default rounded-t-md"
		>
			<Handle
				v-if="!isInput && mainTrigger"
				:id="`${handlePrefix}-trigger-${handleVerb}-${mainTrigger.name}`"
				:type="handleDirection"
				:position="handlePosition"
				:style="triggerStyle"
			/>
			<UIcon :name="headerIcon" class="text-dimmed" />
			<div class="text-dimmed text-xs font-medium uppercase tracking-wide">
				{{ headerLabel }}
			</div>
			<Handle
				v-if="isInput && mainTrigger"
				:id="`${handlePrefix}-trigger-${handleVerb}-${mainTrigger.name}`"
				:type="handleDirection"
				:position="handlePosition"
				:style="triggerStyle"
			/>
		</div>

		<!-- Body: trigger extras + data ports, one per row. Layout mirrors
		     GroupNode.vue: row is `relative` so each Handle (absolute)
		     anchors to its row's vertical center; an inner flex-1 column
		     reserves a track for the label so the absolute handle doesn't
		     crowd it on narrow nodes. -->
		<div v-if="bodyRows.length > 0" class="py-2 text-xs text-dimmed">
			<div
				v-for="(row, idx) in bodyRows"
				:key="`${rowKeyPrefix}-${row.kind}-${idx}`"
				class="relative flex items-stretch py-1"
			>
				<div
					class="flex-1 flex items-center gap-1"
					:class="isInput ? 'justify-end pr-3' : 'pl-3'"
				>
					<template v-if="isInput">
						<span>{{ row.port.name }}</span>
						<Handle
							:id="handleId(row)"
							:type="handleDirection"
							:position="handlePosition"
							:style="row.kind === 'trigger' ? triggerStyle : dataHandleStyle(row.port)"
						/>
					</template>
					<template v-else>
						<Handle
							:id="handleId(row)"
							:type="handleDirection"
							:position="handlePosition"
							:style="row.kind === 'trigger' ? triggerStyle : dataHandleStyle(row.port)"
						/>
						<span>{{ row.port.name }}</span>
					</template>
				</div>
			</div>
		</div>
		<div
			v-else-if="!mainTrigger"
			class="py-2 px-3 text-xs text-dimmed italic"
		>
			{{ emptyText }}
		</div>
	</div>
</template>
