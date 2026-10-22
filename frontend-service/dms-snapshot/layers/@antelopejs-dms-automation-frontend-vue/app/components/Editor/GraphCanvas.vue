<script setup lang="ts">
import { computed, markRaw, nextTick, ref, watch } from 'vue'
import { newId } from '../../utils/automation'
import { roleOf, summarizeNode, type WordedTrigger } from '../../utils/describe'
import type { NodeRunState } from './nodes/GenericNode.vue'
// The canvas chrome (dotted DMS background, zoom controls, themed
// node/handle/edge styling, pan/zoom + fit-view) now comes from the shared
// DmsFlowCanvas wrapper (dms ≥0.0.25). We only keep the @vue-flow/core bits
// our business renderers need: `Position` for node source/target anchors and
// the connection / change / edge types for our wiring handlers. The imperative
// flow controller (zoom/fit/updateNodeInternals/viewport) is reached through
// DmsFlowCanvas's exposed store via a template ref (see `flowRef`).
import { Position } from '@vue-flow/core'
import type {
	Connection,
	NodeChange,
	EdgeChange,
	Edge as VfEdge,
} from '@vue-flow/core'
// Most node kinds share a single port-spec-driven renderer. Group and the
// two group sentinels stay custom because they have cross-graph port
// declarations and special handle naming.
import GenericNode from './nodes/GenericNode.vue'
import GroupNode from './nodes/GroupNode.vue'
import GroupInputNode from './nodes/GroupInputNode.vue'
import GroupOutputNode from './nodes/GroupOutputNode.vue'
import {
	canConnect,
	connectionKind,
	parseSourceBranch,
	parseTargetBranch,
	parseDataPort,
	parseDataField,
} from '../../composables/useGraphConnect'
import type {
	ProcedureGraph,
	GraphNode as AppGraphNode,
	TriggerEdge,
	DataEdge,
	NodeKind,
	TriggerType,
	ActionType,
	DataNodeType,
	JsonSchema,
	GroupPort,
	ConnectResult,
} from '../../composables/useGraphConnect'
import {
	PALETTE_DRAG_TYPE,
	type NodeKindEntry,
	type NodeKindUI,
	type PaletteBlock,
	type TemplateSummary,
} from '../../composables/useAutomationNodeKinds'

// A template's `ports` are deep-cloned (JSON round-trip) onto each new
// template-instance group node so future template edits don't retroactively
// mutate the instance's port list (the resolved subgraph still updates live —
// that's the live-link model).
const props = defineProps<{
	graph: ProcedureGraph
	triggerTypes: TriggerType[]
	actionTypes: ActionType[]
	dataNodeTypes: DataNodeType[]
	/**
	 * Per-NodeKind metadata served by `/api/automation/node-kinds`. The
	 * `ui` block on each entry tells `dataFor` how to render the node —
	 * label, icon, port lists, type-registry / dynamic-config hooks. The
	 * frontend has zero kind-specific code beyond group + sentinels.
	 */
	nodeKinds: NodeKindEntry[]
	canUndo?: boolean
	canRedo?: boolean
	// When the canvas is showing a group's inner subgraph, these are the
	// parent group's declared ports — the sentinel nodes (groupInput /
	// groupOutput) render handles derived from this list rather than
	// reading from their own node data. (Sentinel nodes themselves don't
	// carry ports; their parent group does.) Undefined at the procedure
	// root.
	parentGroupPorts?: GroupPort[]
	// When true, the canvas suppresses graph mutations from user input —
	// used for the read-only view of template-instance inner subgraphs.
	// User can still pan / zoom / select / inspect, just not connect,
	// move, delete, or edit. The "Apply / Cancel" buttons are hidden too.
	readOnly?: boolean
	/** Outcome of each node in the run shown over the canvas (a test run, a debugged run). */
	runStates?: Record<string, NodeRunState>
	/** The problem of each node the validator named. */
	issues?: Record<string, NodeIssue>
	/**
	 * The node the editor has selected (inspector, dock "Select node", a
	 * `?node=` link): the canvas selects it too and brings it into view.
	 */
	selectedNodeId?: string | null
	/**
	 * Names the graph shown (the procedure, the group entered): a new key
	 * fits the new graph into view.
	 */
	viewKey?: string
	/**
	 * An element drawn over the canvas's right edge (the inspector on narrow
	 * screens): fitting and centring keep the nodes out from under it.
	 */
	coveredBy?: HTMLElement | null
	/** The draft's triggers, worded by the server: a schedule reads in words. */
	triggers?: WordedTrigger[]
}>()

interface NodeIssue {
	severity: 'error' | 'warning'
	message: string
	/** Problem code, translated as `dms_automation.editor.problems.codes.<code>`. */
	code?: string
	params?: Record<string, unknown>
}

const emit = defineEmits<{
	(e: 'update:graph', g: ProcedureGraph): void
	(e: 'select:node', id: string | null): void
	// Fires whenever the selection set changes (single or multi). `ids` is
	// the full set of currently selected node ids in this canvas — used by
	// Editor.vue to drive the "Group selection" toolbar action. Sentinel
	// nodes (groupInput / groupOutput) are filtered out before emitting.
	(e: 'selection-change', payload: { ids: string[] }): void
	(e: 'undo'): void
	(e: 'redo'): void
	// Bubbles up GroupNode's @dblclick — Editor.vue uses this to push the
	// group onto the subgraph navigation path. Filtered by kind here so
	// the parent doesn't need to look the node up itself.
	(e: 'group:enter', payload: { id: string }): void
}>()

const toast = useToast()
const { processI18n } = useTranslation()
const { processText } = useComposedText()
const { t, te } = useI18n()

// Fit view never zooms past 100% (a lone trigger would fill the canvas) and
// may go down to 10% so a large graph fits whole.
const FIT_PADDING = 0.15
const FIT_MAX_ZOOM = 1
const MIN_ZOOM = 0.1
const MAX_ZOOM = 1.5
// Room left around a new node, and the size assumed for a node not drawn
// yet (GenericNode's width, a typical height).
const NODE_GAP = 60
const NEW_NODE_SIZE = { width: 230, height: 90 }

const nodeTypes = markRaw({
	genericNode: GenericNode,
	group: GroupNode,
	groupInput: GroupInputNode,
	groupOutput: GroupOutputNode,
})

// Sentinel node kinds — only valid inside a group's subgraph and never
// user-deletable. We filter them out of keyboard/right-click delete in
// onNodesChange below.
const SENTINEL_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>([
	'groupInput',
	'groupOutput',
])

function vfTypeFor(kind: NodeKind): string {
	if (kind === 'group') return 'group'
	if (kind === 'groupInput') return 'groupInput'
	if (kind === 'groupOutput') return 'groupOutput'
	return 'genericNode'
}

function propsOf(schema: JsonSchema | undefined) {
	if (!schema?.properties) return []
	return Object.entries(schema.properties).map(([name, p]) => ({
		name,
		type: Array.isArray(p?.type) ? p?.type[0] : p?.type,
	}))
}

// Index node-kind metadata by kind for O(1) lookup.
const nodeKindUiByKind = computed<Map<string, NodeKindUI>>(() => {
	const m = new Map<string, NodeKindUI>()
	for (const entry of props.nodeKinds ?? []) {
		if (entry.meta?.ui) m.set(entry.kind, entry.meta.ui)
	}
	return m
})

// Pull a registered TriggerType / ActionType / DataNodeType from the
// type-registry prop indicated by a NodeKindUI.typeRegistry hint.
function lookupTypeBySpec(spec: NodeKindUI, typeId: string | undefined) {
	if (!spec.typeRegistry || !typeId) return null
	if (spec.typeRegistry === 'triggers')
		return props.triggerTypes.find((t) => t.id === typeId) ?? null
	if (spec.typeRegistry === 'actions')
		return props.actionTypes.find((a) => a.id === typeId) ?? null
	if (spec.typeRegistry === 'dataNodes')
		return props.dataNodeTypes.find((d) => d.id === typeId) ?? null
	return null
}

// A schedule in words, once the server has worded its current expression.
function scheduleTextOf(node: AppGraphNode): string | undefined {
	const cron = node.config?.cron
	const worded = props.triggers?.find((tr) => tr.nodeId === node.id && tr.cron === cron)
	return worded ? processText(worded.text) : undefined
}

// The validator's problem on a node, in the reader's language (its English
// message when this version has no text for the code).
function issueOf(id: string): NodeIssue | null {
	const issue = props.issues?.[id]
	if (!issue) return null
	const key = `dms_automation.editor.problems.codes.${issue.code}`
	return issue.code && te(key) ? { ...issue, message: t(key, issue.params ?? {}) } : issue
}

// Build the GenericNode `data` payload from a graph node. For every kind
// with `ui` metadata (every kind except group + sentinels), one
// data-driven resolver applies: combine `spec` from the backend with the
// node's `typeId` (for type-registered kinds) and `config` (for dynamic
// trigger-out ports).
function dataFor(node: AppGraphNode) {
	const spec = nodeKindUiByKind.value.get(node.kind)
	if (spec) {
		let label = spec.label
		let icon = spec.icon
		let category: string | undefined
		let dataIns = [...spec.staticDataIns]
		let dataOuts = [...spec.staticDataOuts]

		const type = lookupTypeBySpec(spec, node.typeId) as
			| {
					name?: string
					icon?: string
					category?: string
					inputSchema?: JsonSchema
					outputSchema?: JsonSchema
					configSchema?: JsonSchema
			  }
			| null
		if (type) {
			// Type names may be `$`-prefixed DMS i18n keys; plain text passes through.
			if (spec.labelFromType && type.name !== undefined)
				label = processI18n(type.name)
			if (spec.iconFromType) icon = type.icon ?? icon
			if (spec.categoryFromType) category = type.category
			if (spec.dataInsFromTypeSchema)
				dataIns = propsOf(type[spec.dataInsFromTypeSchema])
			if (spec.dataOutsFromTypeSchema)
				dataOuts = propsOf(type[spec.dataOutsFromTypeSchema])
		}

		const dynPorts = spec.dynamicTriggerOutsFromConfig
			? ((node.config?.[spec.dynamicTriggerOutsFromConfig] as
					| string[]
					| undefined) ?? [])
			: []
		const triggerOuts = [...dynPorts, ...spec.staticTriggerOuts]

		const own = (node as AppGraphNode & { label?: string }).label
		const module = (type as { module?: string } | null)?.module
		return {
			label: own || label,
			typeName: label,
			role: roleOf(node.kind, spec.category),
			module,
			summary: summarizeNode(node.kind, node.typeId, node.config, processI18n, scheduleTextOf(node)),
			run: props.runStates?.[node.id] ?? null,
			issue: issueOf(node.id),
			icon,
			category,
			typeId: node.typeId,
			config: node.config,
			hasTriggerIn: spec.hasTriggerIn,
			hasMainTriggerOut: spec.hasMainTriggerOut,
			triggerOuts,
			dataIns,
			dataOuts,
		}
	}

	if (node.kind === 'group') {
		// Group node carries its own port list + (optional) inline subgraph
		// or templateId. The fields live on the node itself (per backend
		// GroupNode interface) — surface them so the renderer can display
		// handles, linked badges, etc.
		const g = node as AppGraphNode & {
			label?: string
			ports?: unknown
			templateId?: string
			subgraph?: unknown
		}
		// Step name (`label`) first, as for any node; `config.name` is the name
		// the group or its template was created with.
		return {
			label: g.label || (node.config?.name as string | undefined) || t('dms_automation.nodes.role.group'),
			run: props.runStates?.[node.id] ?? null,
			issue: issueOf(node.id),
			ports: Array.isArray(g.ports) ? g.ports : [],
			templateId: g.templateId,
			subgraph: g.subgraph,
			config: node.config,
		}
	}
	if (node.kind === 'groupInput' || node.kind === 'groupOutput') {
		// Sentinels render the parent group's ports. In subgraph-editor
		// mode (C5.3) Editor.vue passes `parentGroupPorts` so both
		// sentinels share one source of truth — the outer group node.
		// At the procedure-graph root there's no parent group, so we
		// fall back to whatever ports the sentinel carries (which
		// should normally be none — a stray sentinel renders empty).
		if (Array.isArray(props.parentGroupPorts)) {
			return { ports: props.parentGroupPorts }
		}
		const s = node as AppGraphNode & { ports?: unknown }
		return { ports: Array.isArray(s.ports) ? s.ports : [] }
	}
	return {}
}

// What a screen reader announces for a node: its type when the node has a
// name of its own, its name, and what it does.
function ariaLabelOf(data: { label?: string; typeName?: string; summary?: string }) {
	if (!data.label) return undefined
	const type = data.typeName && data.typeName !== data.label ? `${data.typeName}: ` : ''
	return `${type}${data.label}${data.summary ? `, ${data.summary}` : ''}`
}

const vfNodes = computed(() =>
	props.graph.nodes.map((n) => {
		const data = dataFor(n)
		return {
			id: n.id,
			type: vfTypeFor(n.kind),
			position: n.position,
			data,
			ariaLabel: SENTINEL_KINDS.has(n.kind)
				? t(n.kind === 'groupInput' ? 'dms_automation.nodes.groupInput' : 'dms_automation.nodes.groupOutput')
				: ariaLabelOf(data),
			sourcePosition: Position.Bottom,
			targetPosition: Position.Top,
		}
	}),
)

// How the canvas names a node in its messages: its label, else (a group's
// sentinels) the group role.
const nodeNames = computed(
	() => new Map(vfNodes.value.map((n) => [n.id, (n.data as { label?: string }).label])),
)
function nodeName(id: string): string {
	return nodeNames.value.get(id) || t('dms_automation.nodes.role.group')
}

// Look up the kind of an edge endpoint by node id — needed for the group
// handle-id derivation below. Sentinels and groups have richer handle
// naming than regular nodes (`group-trigger-in-<port>` vs `trigger-in`),
// so the edge mapping needs to know which target/source it's wiring to.
const nodeKindById = computed<Map<string, NodeKind>>(() => {
	const m = new Map<string, NodeKind>()
	for (const n of props.graph.nodes) m.set(n.id, n.kind)
	return m
})

// Trigger edges into a group node or groupOutput sentinel target a specific
// trigger-in port — the port name lives on `e.to.branch`. Ordinary target
// nodes have a single fixed `trigger-in` handle.
function triggerTargetHandle(e: TriggerEdge, targetKind: NodeKind | undefined): string {
	if (targetKind === 'group') {
		return `group-trigger-in-${e.to.branch}`
	}
	if (targetKind === 'groupOutput') {
		// Trigger edge from an inner node into the groupOutput sentinel —
		// the sentinel exposes a `groupOutput-trigger-in-<port>` handle per
		// declared trigger-OUT port (since trigger-OUT on the OUTER group is
		// trigger-IN on the sentinel side).
		return `groupOutput-trigger-in-${e.to.branch}`
	}
	return 'trigger-in'
}

function triggerSourceHandle(e: TriggerEdge, sourceKind: NodeKind | undefined): string {
	if (sourceKind === 'group') {
		// Source is the OUTER group node firing into an outer downstream
		// node — the branch name IS the port name (see planNewGroup's
		// outerTriggerEdges where `from.branch = portName`).
		return `group-trigger-out-${e.from.branch ?? 'main'}`
	}
	if (sourceKind === 'groupInput') {
		// Inner edge out of groupInput into an inner node — handle id is
		// `groupInput-trigger-out-<port>` and the port name lives on
		// `from.branch` (per planNewGroup's innerTriggerEdges).
		return `groupInput-trigger-out-${e.from.branch ?? 'main'}`
	}
	return `trigger-out-${e.from.branch ?? 'main'}`
}

function dataSourceHandle(e: DataEdge, sourceKind: NodeKind | undefined): string {
	if (sourceKind === 'group') return `group-data-out-${e.from.port}`
	if (sourceKind === 'groupInput') return `groupInput-data-out-${e.from.port}`
	return `data-out-${e.from.port}`
}

function dataTargetHandle(e: DataEdge, targetKind: NodeKind | undefined): string {
	if (targetKind === 'group') return `group-data-in-${e.to.field}`
	if (targetKind === 'groupOutput') return `groupOutput-data-in-${e.to.field}`
	return `data-in-${e.to.field}`
}

// After a run, the edges it took are drawn solid and the one into the failing
// step red; the others fade.
function edgeClass(from: string, to: string): string {
	const runs = props.runStates
	if (!runs) return 'edge-trigger'
	const target = runs[to]?.status
	const taken = runs[from] && target && target !== 'skipped'
	if (taken && target === 'failed') return 'edge-trigger edge-failed'
	return taken ? 'edge-trigger edge-taken' : 'edge-trigger edge-idle'
}

// Edge styling lives in <style> (.edge-trigger / .edge-data) so the
// `.selected` highlight can win without `!important`. Inline `style`
// on a vue-flow edge defeats the .selected rule — documented gotcha.
const vfEdges = computed(() => {
	const kinds = nodeKindById.value
	const triggerEdges = props.graph.triggerEdges.map((e) => ({
		id: e.id,
		source: e.from.node,
		target: e.to.node,
		sourceHandle: triggerSourceHandle(e, kinds.get(e.from.node)),
		targetHandle: triggerTargetHandle(e, kinds.get(e.to.node)),
		data: { kind: 'trigger' as const },
		ariaLabel: `${menuName(e.from.node)} → ${menuName(e.to.node)}`,
		class: edgeClass(e.from.node, e.to.node),
	}))
	const dataEdges = props.graph.dataEdges.map((e) => ({
		id: e.id,
		source: e.from.node,
		target: e.to.node,
		sourceHandle: dataSourceHandle(e, kinds.get(e.from.node)),
		targetHandle: dataTargetHandle(e, kinds.get(e.to.node)),
		data: { kind: 'data' as const },
		ariaLabel: `${menuName(e.from.node)} · ${e.from.port} → ${menuName(e.to.node)} · ${e.to.field}`,
		class: 'edge-data',
	}))
	return [...triggerEdges, ...dataEdges]
})


function emitGraph(g: ProcedureGraph) {
	emit('update:graph', g)
}

interface XY {
	x: number
	y: number
}
interface Rect extends XY {
	width: number
	height: number
}

function nodeRects(): Rect[] {
	return props.graph.nodes.map((n) => {
		const size = flowRef.value?.findNode(n.id)?.dimensions
		return {
			...n.position,
			width: size?.width || NEW_NODE_SIZE.width,
			height: size?.height || NEW_NODE_SIZE.height,
		}
	})
}

function overlaps(a: Rect, b: Rect): boolean {
	const gap = NODE_GAP / 2
	return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap
}

// The first place at or below `pos` where a new node covers no other one.
function freeSpot(pos: XY): XY {
	const rects = nodeRects()
	const spot: Rect = { ...pos, ...NEW_NODE_SIZE }
	for (let hit = rects.find((r) => overlaps(spot, r)); hit; hit = rects.find((r) => overlaps(spot, r))) {
		spot.y = hit.y + hit.height + NODE_GAP
	}
	return { x: Math.round(spot.x), y: Math.round(spot.y) }
}

// A new step goes right of the selected one, else in the middle of what the
// canvas shows.
function newNodePosition(anchor: AppGraphNode | undefined): XY {
	const flow = flowRef.value
	if (anchor) {
		const width = flow?.findNode(anchor.id)?.dimensions.width || NEW_NODE_SIZE.width
		return freeSpot({ x: anchor.position.x + width + NODE_GAP, y: anchor.position.y })
	}
	if (!flow) return freeSpot({ x: 0, y: 0 })
	const { x, y, zoom } = flow.viewport
	return freeSpot({
		x: (flow.dimensions.width / 2 - x) / zoom - NEW_NODE_SIZE.width / 2,
		y: (flow.dimensions.height / 2 - y) / zoom - NEW_NODE_SIZE.height / 2,
	})
}

// The node a new step follows: the one selected last on this canvas.
function anchorNode(): AppGraphNode | undefined {
	const id = props.selectedNodeId ?? canvasSelection.value[canvasSelection.value.length - 1]
	return props.graph.nodes.find((n) => n.id === id)
}

interface Port {
	/** Vue Flow handle id. */
	id: string
	/** Port name ('' for the single trigger input of a step). */
	name: string
}
interface NodeHandles {
	triggerIns: Port[]
	triggerOuts: Port[]
	dataIns: Port[]
	dataOuts: Port[]
}

// The handles a node draws, named as its renderer names them (see the
// handle prefix table in useGraphConnect).
function handlesOf(node: AppGraphNode): NodeHandles {
	if (node.kind === 'group' || SENTINEL_KINDS.has(node.kind)) {
		const ports =
			node.kind === 'group'
				? ((node as AppGraphNode & { ports?: GroupPort[] }).ports ?? [])
				: (props.parentGroupPorts ?? [])
		const pick = (kind: GroupPort['kind'], direction: GroupPort['direction'], prefix: string) =>
			ports
				.filter((p) => p.kind === kind && p.direction === direction)
				.map((p) => ({ id: `${prefix}${p.name}`, name: p.name }))
		if (node.kind === 'group') {
			return {
				triggerIns: pick('trigger', 'in', 'group-trigger-in-'),
				triggerOuts: pick('trigger', 'out', 'group-trigger-out-'),
				dataIns: pick('data', 'in', 'group-data-in-'),
				dataOuts: pick('data', 'out', 'group-data-out-'),
			}
		}
		// The sentinels face inwards: the group's inputs leave groupInput, its
		// outputs enter groupOutput.
		if (node.kind === 'groupInput') {
			return {
				triggerIns: [],
				triggerOuts: pick('trigger', 'in', 'groupInput-trigger-out-'),
				dataIns: [],
				dataOuts: pick('data', 'in', 'groupInput-data-out-'),
			}
		}
		return {
			triggerIns: pick('trigger', 'out', 'groupOutput-trigger-in-'),
			triggerOuts: [],
			dataIns: pick('data', 'out', 'groupOutput-data-in-'),
			dataOuts: [],
		}
	}
	const data = dataFor(node) as {
		hasTriggerIn?: boolean
		hasMainTriggerOut?: boolean
		triggerOuts?: string[]
		dataIns?: Array<{ name: string }>
		dataOuts?: Array<{ name: string }>
	}
	const branches = [...(data.hasMainTriggerOut === false ? [] : ['main']), ...(data.triggerOuts ?? [])]
	return {
		triggerIns: data.hasTriggerIn === false ? [] : [{ id: 'trigger-in', name: '' }],
		triggerOuts: branches.map((name) => ({ id: `trigger-out-${name}`, name })),
		dataIns: (data.dataIns ?? []).map((p) => ({ id: `data-in-${p.name}`, name: p.name })),
		dataOuts: (data.dataOuts ?? []).map((p) => ({ id: `data-out-${p.name}`, name: p.name })),
	}
}

function check(graph: ProcedureGraph, conn: Connection) {
	return canConnect(
		graph,
		props.nodeKinds,
		props.triggerTypes,
		props.actionTypes,
		props.dataNodeTypes,
		conn,
		{ parentGroupPorts: props.parentGroupPorts },
	)
}

// The link from `from`'s main output to `to`, when that output is free and
// `to` has an input that accepts it.
function nextStepConnection(graph: ProcedureGraph, from: AppGraphNode, to: AppGraphNode): Connection | null {
	const out = handlesOf(from).triggerOuts.find((p) => p.name === 'main')
	const ins = handlesOf(to).triggerIns
	const into = ins.find((p) => p.name === 'main' || p.name === '') ?? ins[0]
	if (!out || !into) return null
	if (graph.triggerEdges.some((e) => e.from.node === from.id && (e.from.branch ?? 'main') === 'main')) return null
	const conn: Connection = { source: from.id, sourceHandle: out.id, target: to.id, targetHandle: into.id }
	return check(graph, conn).ok ? conn : null
}

// The node to select and bring into view once drawn: one just added, or one
// the editor points at (`readable`).
let revealPending: { id: string; readable: boolean } | null = null

// Add a node where it was dropped, or next to the selected node and linked
// from it (one undo step for both).
function insertNode(node: AppGraphNode, at?: XY) {
	const anchor = at ? undefined : anchorNode()
	const placed = { ...node, position: at ? freeSpot(at) : newNodePosition(anchor) }
	const graph = { ...props.graph, nodes: [...props.graph.nodes, placed] }
	const link = anchor ? nextStepConnection(graph, anchor, placed) : null
	emitGraph(link ? (withConnection(graph, link)?.graph ?? graph) : graph)
	revealPending = { id: placed.id, readable: false }
}

function defaultsFromSchema(schema: JsonSchema | undefined): Record<string, unknown> {
	if (!schema?.properties) return {}
	const out: Record<string, unknown> = {}
	for (const [name, prop] of Object.entries(schema.properties)) {
		if (prop && prop.default !== undefined) out[name] = prop.default
	}
	return out
}

function defaultConfigFor(kind: NodeKind, typeId?: string): Record<string, unknown> {
	const ui = nodeKindUiByKind.value.get(kind)
	if (ui?.typeRegistry === 'triggers') {
		const t = props.triggerTypes.find((tt) => tt.id === typeId)
		return defaultsFromSchema(t?.configSchema)
	}
	if (ui?.typeRegistry === 'actions') {
		const a = props.actionTypes.find((aa) => aa.id === typeId)
		return defaultsFromSchema(a?.inputSchema)
	}
	if (ui?.typeRegistry === 'dataNodes') {
		const d = props.dataNodeTypes.find((dd) => dd.id === typeId)
		// Constant nodes seed from `configSchema` (their value lives there);
		// wired-port data nodes seed any `inputSchema` field defaults.
		return { ...defaultsFromSchema(d?.inputSchema), ...defaultsFromSchema(d?.configSchema) }
	}
	// Static-config kinds carry their seed config in metadata; deep-clone
	// so each instance gets its own mutable copy. JSON round-trip strips
	// the Vue reactive proxy that wraps `props.nodeKinds` — structuredClone
	// would throw on the proxy.
	return ui?.defaultConfig
		? (JSON.parse(JSON.stringify(ui.defaultConfig)) as Record<string, unknown>)
		: {}
}

function addNode(kind: NodeKind, typeId?: string, at?: XY) {
	insertNode(
		{
			id: newId(),
			kind,
			typeId,
			config: defaultConfigFor(kind, typeId),
			position: { x: 0, y: 0 },
		},
		at,
	)
}

// Drop a template-instance group node into the current graph. The instance
// carries `templateId` and a deep clone (JSON round-trip) of the template's
// port list;
// it has NO inline `subgraph` — the executor resolves the live subgraph
// from the template cache at run time (C3.2 / C4.4). Editing the source
// template later will retroactively change what this instance executes
// (the "live link" model); the port list is cloned so a port rename on
// the template doesn't silently invalidate the outer wiring on this
// instance (the user can manually re-sync by forking + re-saving).
function addTemplateInstance(template: TemplateSummary, at?: XY) {
	const node: AppGraphNode & {
		ports: GroupPort[]
		templateId: string
	} = {
		id: newId(),
		kind: 'group',
		config: { name: template.name },
		position: { x: 0, y: 0 },
		templateId: template._id,
		// JSON round-trip strips Vue's reactive proxy that wraps the template
		// passed from the palette; structuredClone throws on proxies.
		ports: JSON.parse(JSON.stringify(template.ports ?? [])) as GroupPort[],
	}
	insertNode(node, at)
}

// Node creation is driven from the left BuilderPalette (in Editor.vue) — expose
// the two add helpers so the palette's events can reach the graph mutation.
defineExpose({ addNode, addTemplateInstance })

// A block dragged from the palette lands where it is dropped.
function onDragOver(event: DragEvent) {
	if (props.readOnly || !event.dataTransfer?.types.includes(PALETTE_DRAG_TYPE)) return
	event.preventDefault()
	event.dataTransfer.dropEffect = 'copy'
}

function onDrop(event: DragEvent) {
	const raw = event.dataTransfer?.getData(PALETTE_DRAG_TYPE)
	const flow = flowRef.value
	if (props.readOnly || !raw || !flow) return
	event.preventDefault()
	const point = flow.screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
	const at = { x: point.x - NEW_NODE_SIZE.width / 2, y: point.y - NEW_NODE_SIZE.height / 2 }
	const block = JSON.parse(raw) as PaletteBlock
	if (block.template) addTemplateInstance(block.template, at)
	else if (block.kind) addNode(block.kind, block.typeId, at)
}

// DmsFlowCanvas owns the VueFlow store (it calls `useVueFlow(flowId)` with a
// private id and `defineExpose`s the resulting controller). We grab that
// controller through a template ref instead of calling `useVueFlow()` here —
// a bare `useVueFlow()` would resolve to the DEFAULT store, which is NOT the
// one DmsFlowCanvas drives, so zoom/fit/updateNodeInternals would silently
// no-op. Only the handful of imperative methods we actually use are typed.
interface FlowNodeState {
	id: string
	selected?: boolean
	computedPosition: XY
	dimensions: { width: number; height: number }
}
interface FlowController {
	zoomIn: () => void
	zoomOut: () => void
	zoomTo: (zoom: number) => void
	setViewport: (viewport: XY & { zoom: number }, options?: { duration?: number }) => Promise<boolean>
	screenToFlowCoordinate: (position: XY) => XY
	findNode: (id: string) => FlowNodeState | undefined
	addSelectedNodes: (nodes: FlowNodeState[]) => void
	removeSelectedNodes: (nodes: FlowNodeState[]) => void
	updateNodeInternals: (ids?: string | string[]) => void
	// DmsFlowCanvas `defineExpose`s the VueFlow controller; Vue's expose proxy
	// unwraps the `viewport` ref, so consumers read `.viewport.zoom` directly
	// (NOT `.viewport.value.zoom` — that extra `.value` is undefined and pinned
	// the zoom readout at 100%). Same for the refs below.
	viewport: XY & { zoom: number }
	/** Size of the canvas on screen. */
	dimensions: { width: number; height: number }
	getSelectedNodes: FlowNodeState[]
	getSelectedEdges: Array<{ id: string }>
	/** 'invalid' while the link being drawn hovers a port that refuses it. */
	connectionStatus: 'valid' | 'invalid' | null
}
const flowRef = ref<FlowController | null>(null)
const wrapRef = ref<HTMLElement | null>(null)

// The width of the canvas the inspector covers when it is drawn over it.
function coveredRight(): number {
	const cover = props.coveredBy?.getBoundingClientRect()
	const own = wrapRef.value?.getBoundingClientRect()
	if (!cover?.width || !own) return 0
	return Math.max(0, Math.min(own.right, cover.right) - Math.max(own.left, cover.left))
}

// Fit every node into the part of the canvas left visible.
function fitView() {
	const flow = flowRef.value
	if (!flow) return
	const nodes = props.graph.nodes
		.map((n) => flow.findNode(n.id))
		.filter((n): n is FlowNodeState => !!n?.dimensions.width)
	if (nodes.length === 0) return
	const left = Math.min(...nodes.map((n) => n.computedPosition.x))
	const top = Math.min(...nodes.map((n) => n.computedPosition.y))
	const width = Math.max(...nodes.map((n) => n.computedPosition.x + n.dimensions.width)) - left
	const height = Math.max(...nodes.map((n) => n.computedPosition.y + n.dimensions.height)) - top
	const visible = flow.dimensions.width - coveredRight()
	const room = 1 + FIT_PADDING
	const fit = Math.min(visible / (width * room), flow.dimensions.height / (height * room))
	const zoom = Math.min(Math.max(fit, MIN_ZOOM), FIT_MAX_ZOOM)
	flow.setViewport({
		x: (visible - width * zoom) / 2 - left * zoom,
		y: (flow.dimensions.height - height * zoom) / 2 - top * zoom,
		zoom,
	})
}

// Select a node and bring it into the visible part of the canvas. A node the
// editor points at (a link, a problem) is also shown at a readable zoom; a
// new node keeps the zoom.
function focusNode(id: string, readable = false) {
	const flow = flowRef.value
	const node = flow?.findNode(id)
	if (!flow || !node) return
	if (!node.selected) flow.addSelectedNodes([node])
	// Selecting opens the inspector, which narrows or covers the canvas:
	// look once it is drawn (two frames).
	requestAnimationFrame(() => requestAnimationFrame(() => panTo(id, readable)))
}

function panTo(id: string, readable: boolean) {
	const flow = flowRef.value
	const node = flow?.findNode(id)
	if (!flow || !node) return
	const visible = flow.dimensions.width - coveredRight()
	const zoom = readable ? Math.max(flow.viewport.zoom, 1) : flow.viewport.zoom
	const left = node.computedPosition.x * zoom + flow.viewport.x
	const top = node.computedPosition.y * zoom + flow.viewport.y
	const inSight =
		left >= 0 &&
		top >= 0 &&
		left + node.dimensions.width * zoom <= visible &&
		top + node.dimensions.height * zoom <= flow.dimensions.height
	if (inSight && zoom === flow.viewport.zoom) return
	flow.setViewport(
		{
			x: visible / 2 - (node.computedPosition.x + node.dimensions.width / 2) * zoom,
			y: flow.dimensions.height / 2 - (node.computedPosition.y + node.dimensions.height / 2) * zoom,
			zoom,
		},
		// A node pointed at is shown at once; a new one slides into view.
		{ duration: readable ? 0 : 200 },
	)
}

// A new graph on the canvas (first load, another procedure, a group entered
// or left) is fitted into view; a node just added or pointed at is shown.
// Both wait until every node is measured and the panels around the canvas
// have settled (two frames): Vue Flow keeps the measures of nodes whose id
// the previous graph shared, so it does not always report them again.
let fitPending = true
let settleQueued = false
function settleView() {
	if (settleQueued) return
	settleQueued = true
	requestAnimationFrame(() =>
		requestAnimationFrame(() => {
			settleQueued = false
			const flow = flowRef.value
			if (!flow || !props.graph.nodes.every((n) => flow.findNode(n.id)?.dimensions.width)) return
			if (fitPending) {
				fitPending = false
				fitView()
				// The node the editor points at stays the one shown.
				if (props.selectedNodeId) revealPending ??= { id: props.selectedNodeId, readable: true }
			}
			if (revealPending) {
				const { id, readable } = revealPending
				revealPending = null
				focusNode(id, readable)
			}
		}),
	)
}

// Vue Flow emits this once every node on the canvas has been measured.
function onNodesInitialized() {
	settleView()
}

watch(
	() => props.viewKey,
	() => {
		fitPending = true
		nextTick(settleView)
	},
)

watch(
	() => props.selectedNodeId,
	(id) => {
		const flow = flowRef.value
		// The editor closed its inspector: the canvas lets go of the node too.
		if (!id) {
			if (flow?.getSelectedNodes.length) flow.removeSelectedNodes(flow.getSelectedNodes)
			return
		}
		// A node selected on the canvas itself is already where the user looks.
		if (flow?.findNode(id)?.selected) return
		revealPending = { id, readable: true }
		nextTick(settleView)
	},
	// The editor may name a node (a `?node=` link) before the canvas exists.
	{ immediate: true },
)

// Vue Flow caches each node's handle bounding boxes in its internal store and
// only re-measures when `updateNodeInternals(id)` is called. When a port is
// renamed or moved between the title bar and body (e.g. renaming a port to
// "main" moves the handle from a body row into the header), the Handle DOM
// element ends up in a different on-screen position but the cached bbox stays
// stale — connected edges keep drawing to the OLD coordinates until the next
// re-measure.
//
// To keep edges glued to handles, watch a signature derived from the per-node
// port lists / kinds and force a re-measure of every node after the DOM has
// applied the new template. Watching the full `props.graph` would fire on
// every drag (each emitGraph returns a fresh object) — costly and pointless,
// since node positions trigger their own internal updates already. The
// signature only changes when port shape changes, which is exactly when we
// need to re-measure.
const portsSignature = computed(() => {
	const own = props.graph.nodes
		.map((n) => {
			const ports = (n as AppGraphNode & { ports?: unknown }).ports
			const portsKey = Array.isArray(ports) ? JSON.stringify(ports) : ''
			return `${n.id}:${n.kind}:${portsKey}`
		})
		.join('|')
	// Sentinel nodes (groupInput / groupOutput) inside this canvas render
	// handles derived from `parentGroupPorts`, not from their own node data.
	// A rename on the outer group's port list re-renders the sentinel but
	// doesn't show up in `props.graph.nodes` above, so we must also fold
	// the parent ports into the signature.
	const parent = Array.isArray(props.parentGroupPorts)
		? JSON.stringify(props.parentGroupPorts)
		: ''
	return `${own}#${parent}`
})
watch(portsSignature, () => {
	nextTick(() => {
		for (const node of props.graph.nodes) {
			flowRef.value?.updateNodeInternals(node.id)
		}
	})
})

const zoomPercent = computed(() => {
	const zoom = flowRef.value?.viewport.zoom ?? 1
	return `${Math.round(zoom * 100)}%`
})

function resetZoom() {
	flowRef.value?.zoomTo(1)
}

// The graph once `conn` is drawn, and the link it took the place of.
function withConnection(
	graph: ProcedureGraph,
	conn: Connection,
): { graph: ProcedureGraph; added: TriggerEdge | DataEdge; replaced?: TriggerEdge | DataEdge } | null {
	const kind = connectionKind(conn.sourceHandle)
	if (kind === 'trigger') {
		const branch = parseSourceBranch(conn.sourceHandle)
		const toBranch = parseTargetBranch(conn.targetHandle)
		const newEdge: TriggerEdge = {
			id: newId(),
			from: { node: conn.source, branch },
			to: toBranch !== undefined
				? { node: conn.target, branch: toBranch }
				: { node: conn.target },
		}
		// Each source/branch carries exactly one outgoing trigger edge.
		// Connecting again replaces any existing edge from that source/branch.
		// (Branching across if/switch named branches still works because each
		// branch has its own `from.branch` and only conflicts with itself.)
		const replaced = graph.triggerEdges.find(
			(e) => e.from.node === conn.source && (e.from.branch ?? 'main') === branch,
		)
		return {
			graph: { ...graph, triggerEdges: [...graph.triggerEdges.filter((e) => e !== replaced), newEdge] },
			added: newEdge,
			replaced,
		}
	}
	if (kind !== 'data') return null
	const port = parseDataPort(conn.sourceHandle)
	const field = parseDataField(conn.targetHandle)
	if (!port || !field) return null
	const newEdge: DataEdge = {
		id: newId(),
		from: { node: conn.source, port },
		to: { node: conn.target, field },
	}
	// Overwrite: a field reads from one output only.
	const replaced = graph.dataEdges.find((e) => e.to.node === conn.target && e.to.field === field)
	return {
		graph: { ...graph, dataEdges: [...graph.dataEdges.filter((e) => e !== replaced), newEdge] },
		added: newEdge,
		replaced,
	}
}

function refusalText(result: ConnectResult): string {
	return result.ok ? '' : t(`dms_automation.editor.canvas.connect.${result.code}`, result.params ?? {})
}

// Undo of a replacement: the new link goes, the old one comes back — unless
// the new link is gone already, or an end of the old one was deleted since.
function restoreLink(added: TriggerEdge | DataEdge, old: TriggerEdge | DataEdge) {
	const graph = props.graph
	const ids = new Set(graph.nodes.map((n) => n.id))
	const back = ids.has(old.from.node) && ids.has(old.to.node)
	if ('port' in added.from) {
		if (!graph.dataEdges.some((e) => e.id === added.id)) return
		const edges = graph.dataEdges.filter((e) => e.id !== added.id)
		emitGraph({ ...graph, dataEdges: back ? [...edges, old as DataEdge] : edges })
	} else {
		if (!graph.triggerEdges.some((e) => e.id === added.id)) return
		const edges = graph.triggerEdges.filter((e) => e.id !== added.id)
		emitGraph({ ...graph, triggerEdges: back ? [...edges, old as TriggerEdge] : edges })
	}
}

// Drawing over an existing link replaces it: say which one, with an undo of
// that replacement only.
function notifyReplaced(added: TriggerEdge | DataEdge, old: TriggerEdge | DataEdge, conn: Connection) {
	let description: string
	if ('port' in old.from) {
		const port = parseDataPort(conn.sourceHandle)
		if (old.from.node === conn.source && old.from.port === port) return
		description = t('dms_automation.editor.canvas.replaced.data', {
			field: (old as DataEdge).to.field,
			step: menuName(conn.target),
			source: `${menuName(conn.source)} · ${port}`,
			previous: `${menuName(old.from.node)} · ${old.from.port}`,
		})
	} else {
		if (old.to.node === conn.target) return
		description = t('dms_automation.editor.canvas.replaced.trigger', {
			source: menuName(conn.source),
			target: menuName(conn.target),
			previous: menuName(old.to.node),
		})
	}
	toast.add({
		title: t('dms_automation.editor.canvas.replaced.title'),
		description,
		color: 'info',
		icon: 'i-ph-arrows-left-right',
		actions: [{ label: t('dms_automation.editor.canvas.undo'), onClick: () => restoreLink(added, old) }],
	})
}

function onConnect(conn: Connection) {
	if (props.readOnly) return
	const result = check(props.graph, conn)
	if (!result.ok) {
		toast.add({
			title: t('dms_automation.editor.canvas.connect.title'),
			description: refusalText(result),
			color: 'warning',
			icon: 'i-ph-warning',
		})
		return
	}
	const next = withConnection(props.graph, conn)
	if (!next) return
	emitGraph(next.graph)
	if (next.replaced) notifyReplaced(next.added, next.replaced, conn)
}

// Why the port under a link being drawn refuses it, shown while it hovers.
const refusal = ref('')
const refusalShown = computed(() => flowRef.value?.connectionStatus === 'invalid' && refusal.value !== '')

function isValidConnection(conn: Connection): boolean {
	const result = check(props.graph, conn)
	refusal.value = refusalText(result)
	return result.ok
}

// Released over a port that refuses the link: keep the reason on screen.
function onConnectEnd() {
	if (refusalShown.value) {
		toast.add({
			title: t('dms_automation.editor.canvas.connect.title'),
			description: refusal.value,
			color: 'warning',
			icon: 'i-ph-warning',
		})
	}
	refusal.value = ''
}

// Without a mouse: every link the selected step can make, from the canvas
// toolbar (WCAG 2.5.7).

// Two steps with the same name are told apart by the end of their id (link
// menu, replacement toast, links read aloud).
function menuName(id: string): string {
	const name = nodeName(id)
	const twins = props.graph.nodes.filter((n) => nodeName(n.id) === name).length
	return twins > 1 ? `${name} #${id.slice(-4)}` : name
}
interface LinkItem {
	label: string
	connection: Connection
}

const linkGroups = computed(() => {
	const id = canvasSelection.value.length === 1 ? canvasSelection.value[0] : undefined
	const node = props.graph.nodes.find((n) => n.id === id)
	if (!node || props.readOnly) return []
	const mine = handlesOf(node)
	const next: LinkItem[] = []
	const send: LinkItem[] = []
	const read: LinkItem[] = []
	const wired = (target: string, field: string) =>
		props.graph.dataEdges.some((e) => e.to.node === target && e.to.field === field)
	const add = (into: LinkItem[], label: string, connection: Connection) => {
		if (check(props.graph, connection).ok) into.push({ label, connection })
	}
	for (const other of props.graph.nodes) {
		if (other.id === node.id) continue
		const theirs = handlesOf(other)
		const name = menuName(other.id)
		for (const out of mine.triggerOuts) {
			const current = props.graph.triggerEdges.find(
				(e) => e.from.node === node.id && (e.from.branch ?? 'main') === out.name,
			)
			if (current?.to.node === other.id) continue
			// The output already leads somewhere: the menu says what goes.
			const replaces = current ? ` (${t('dms_automation.editor.canvas.link.replaces', { name: menuName(current.to.node) })})` : ''
			for (const into of theirs.triggerIns) {
				const branch = out.name === 'main' ? '' : `${out.name} `
				const port = into.name && into.name !== 'main' ? ` · ${into.name}` : ''
				add(next, `${branch}→ ${name}${port}${replaces}`, { source: node.id, sourceHandle: out.id, target: other.id, targetHandle: into.id })
			}
		}
		for (const out of mine.dataOuts) {
			for (const into of theirs.dataIns) {
				if (wired(other.id, into.name)) continue
				add(send, `${out.name} → ${name} · ${into.name}`, { source: node.id, sourceHandle: out.id, target: other.id, targetHandle: into.id })
			}
		}
		for (const out of theirs.dataOuts) {
			for (const into of mine.dataIns) {
				if (wired(node.id, into.name)) continue
				add(read, `${name} · ${out.name} → ${into.name}`, { source: other.id, sourceHandle: out.id, target: node.id, targetHandle: into.id })
			}
		}
	}
	const group = (key: string, items: LinkItem[]) =>
		items.length ? [{ type: 'label' as const, label: t(`dms_automation.editor.canvas.link.${key}`) }, ...items] : []
	return [group('next', next), group('send', send), group('read', read)].filter((g) => g.length > 0)
})

// The link menu is offered for a single selected step of an editable graph.
const canLink = computed(() => !props.readOnly && canvasSelection.value.length === 1)

// The menu is an action, not a field: it never keeps a value.
const linkChoice = ref<LinkItem | null>(null)
function onLink(item: LinkItem | null) {
	if (item?.connection) onConnect(item.connection)
	linkChoice.value = null
}

// Multi-selection tracking — Vue Flow emits one NodeSelectionChange per
// affected node when the user box-selects or shift-clicks. We accumulate
// the current set here and emit a single `selection-change` event with
// the full list (sentinels filtered out — the user shouldn't be able to
// fold a sentinel into a new group). The single-node `select:node` event
// is preserved for the inspector (it expects exactly one node id).
const selectedNodeIds = new Set<string>()
// The same set, reactive (sentinels included), for the toolbar's link menu
// and the placement of new nodes.
const canvasSelection = ref<string[]>([])

// Drop any tracked ids that no longer exist in the current graph (e.g.
// after navigating to a different procedure / subgraph, or after the
// "Group selection" action removes the selected nodes). Re-emit if the
// set shrank. We can't `watch(() => props.graph, ...)` because that
// fires on every node drag (each emitGraph returns a fresh object).
watch(
	() => props.graph.nodes,
	(nodes) => {
		if (selectedNodeIds.size === 0) return
		const valid = new Set(nodes.map((n) => n.id))
		let pruned = false
		for (const id of [...selectedNodeIds]) {
			if (!valid.has(id)) {
				selectedNodeIds.delete(id)
				pruned = true
			}
		}
		if (pruned) {
			const ids = [...selectedNodeIds].filter((id) => {
				const n = nodes.find((nn) => nn.id === id)
				return n ? !SENTINEL_KINDS.has(n.kind) : false
			})
			canvasSelection.value = [...selectedNodeIds]
			emit('selection-change', { ids })
		}
	},
)

function onNodesChange(changes: NodeChange[]) {
	let nextNodes = props.graph.nodes
	let nextTrigger = props.graph.triggerEdges
	let nextData = props.graph.dataEdges
	let changed = false
	let selectionChanged = false

	for (const c of changes) {
		// In read-only mode, still surface selection so the inspector
		// can show node details; suppress position drag and delete.
		if (props.readOnly && c.type !== 'select') continue
		if (c.type === 'position' && c.position) {
			// Positions are stored as whole pixels, and a click that moves a
			// node by less than one (a select, not a drag) changes nothing:
			// otherwise selecting a node would count as an unsaved change.
			const pos = { x: Math.round(c.position.x), y: Math.round(c.position.y) }
			const current = nextNodes.find((n) => n.id === c.id)
			if (current && current.position.x === pos.x && current.position.y === pos.y) continue
			nextNodes = nextNodes.map((n) => (n.id === c.id ? { ...n, position: pos } : n))
			changed = true
		} else if (c.type === 'remove') {
			// Sentinel nodes (groupInput / groupOutput) are auto-managed by
			// the editor and never user-deletable. Drop the change silently
			// so keyboard delete + right-click delete both no-op on them.
			const victim = nextNodes.find((n) => n.id === c.id)
			if (victim && SENTINEL_KINDS.has(victim.kind)) continue
			nextNodes = nextNodes.filter((n) => n.id !== c.id)
			nextTrigger = nextTrigger.filter(
				(e) => e.from.node !== c.id && e.to.node !== c.id,
			)
			nextData = nextData.filter(
				(e) => e.from.node !== c.id && e.to.node !== c.id,
			)
			if (selectedNodeIds.delete(c.id)) selectionChanged = true
			changed = true
		} else if (c.type === 'select') {
			if (c.selected) {
				if (!selectedNodeIds.has(c.id)) {
					selectedNodeIds.add(c.id)
					selectionChanged = true
				}
				emit('select:node', c.id)
			} else {
				if (selectedNodeIds.delete(c.id)) selectionChanged = true
				// Re-point the single-node inspector on deselect: fall back to a
				// still-selected node (most-recent), or clear it once the
				// selection is empty. A click-swap fires `select: true` above in
				// the same batch, which then overrides this.
				const remaining = [...selectedNodeIds]
				emit('select:node', remaining[remaining.length - 1] ?? null)
			}
		}
	}

	if (selectionChanged) {
		// Filter out sentinels — folding them into a new group makes no
		// sense and the toolbar gating depends on a clean set.
		const ids = [...selectedNodeIds].filter((id) => {
			const n = props.graph.nodes.find((nn) => nn.id === id)
			return n ? !SENTINEL_KINDS.has(n.kind) : false
		})
		canvasSelection.value = [...selectedNodeIds]
		emit('selection-change', { ids })
	}

	if (changed) {
		emitGraph({
			...props.graph,
			nodes: nextNodes,
			triggerEdges: nextTrigger,
			dataEdges: nextData,
		})
	}
}

// DmsFlowCanvas's delete affordance (trash badge on the selected node + the
// Delete/Backspace key path it now owns) is emit-only: it hands us the ids and
// we perform the mutation. Route them through onNodesChange's `remove` path so
// sentinel filtering, edge cleanup, selection sync and emitGraph stay in one
// place.
function onDeleteNodes(ids: string[]) {
	if (props.readOnly) return
	onNodesChange(ids.map((id) => ({ type: 'remove', id }) as NodeChange))
}

function onEdgesChange(changes: EdgeChange[]) {
	if (props.readOnly) return
	let nextTrigger = props.graph.triggerEdges
	let nextData = props.graph.dataEdges
	let changed = false

	for (const c of changes) {
		if (c.type === 'remove') {
			const beforeT = nextTrigger.length
			nextTrigger = nextTrigger.filter((e) => e.id !== c.id)
			if (nextTrigger.length !== beforeT) {
				changed = true
				continue
			}
			const beforeD = nextData.length
			nextData = nextData.filter((e) => e.id !== c.id)
			if (nextData.length !== beforeD) changed = true
		}
	}

	if (changed) {
		emitGraph({
			...props.graph,
			triggerEdges: nextTrigger,
			dataEdges: nextData,
		})
	}
}

// The DMS canvas deletes the selected nodes on Delete / Backspace, not the
// selected links: remove those here (a deleted node takes its links along).
function onKeydown(event: KeyboardEvent) {
	if (props.readOnly || (event.key !== 'Delete' && event.key !== 'Backspace')) return
	const target = event.target
	if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
	const flow = flowRef.value
	if (!flow || flow.getSelectedNodes.length > 0 || flow.getSelectedEdges.length === 0) return
	event.preventDefault()
	onEdgesChange(flow.getSelectedEdges.map((e) => ({ type: 'remove', id: e.id }) as EdgeChange))
}

// Edge-update flow (drag an existing edge's endpoint to reattach or delete):
//   1. @edge-update-start clears the success flag.
//   2. @edge-update fires only if the user drops on a valid target — mark
//      successful and rewrite the edge with the new connection.
//   3. @edge-update-end fires unconditionally; if no successful update
//      happened, the user dropped in empty space → delete the edge.
let edgeUpdateSuccessful = false

function onEdgeUpdateStart() {
	edgeUpdateSuccessful = false
}

function onEdgeUpdate(payload: {
	event: MouseEvent
	edge: VfEdge
	connection: Connection
}) {
	edgeUpdateSuccessful = true
	const { edge, connection } = payload
	const kind = (edge.data as { kind?: 'trigger' | 'data' } | undefined)?.kind
	if (kind === 'trigger') {
		const branch = parseSourceBranch(connection.sourceHandle)
		const toBranch = parseTargetBranch(connection.targetHandle)
		const nextTrigger = props.graph.triggerEdges.map((e) =>
			e.id === edge.id
				? {
						...e,
						from: { node: connection.source, branch },
						to: toBranch !== undefined
							? { node: connection.target, branch: toBranch }
							: { node: connection.target },
					}
				: e,
		)
		emitGraph({ ...props.graph, triggerEdges: nextTrigger })
	} else if (kind === 'data') {
		const port = parseDataPort(connection.sourceHandle)
		const field = parseDataField(connection.targetHandle)
		if (!port || !field) return
		const nextData = props.graph.dataEdges.map((e) =>
			e.id === edge.id
				? {
						...e,
						from: { node: connection.source, port },
						to: { node: connection.target, field },
					}
				: e,
		)
		emitGraph({ ...props.graph, dataEdges: nextData })
	}
}

// Vue Flow fires @node-double-click with a single `{ event, node }` payload.
// Filter to group nodes so Editor.vue receives a clean group:enter signal —
// double-clicking any other node kind is reserved for future inline edit
// affordances.
function onNodeDoubleClick(payload: {
	event: MouseEvent
	node: { id: string; type?: string }
}) {
	if (payload.node?.type !== 'group') return
	emit('group:enter', { id: payload.node.id })
}

function onEdgeUpdateEnd(payload: { event: MouseEvent; edge: VfEdge }) {
	if (edgeUpdateSuccessful) return
	const { edge } = payload
	if (!edge) return
	const nextTrigger = props.graph.triggerEdges.filter((e) => e.id !== edge.id)
	const nextData = props.graph.dataEdges.filter((e) => e.id !== edge.id)
	if (
		nextTrigger.length === props.graph.triggerEdges.length &&
		nextData.length === props.graph.dataEdges.length
	) {
		return
	}
	emitGraph({
		...props.graph,
		triggerEdges: nextTrigger,
		dataEdges: nextData,
	})
}
</script>

<template>
	<div
		ref="wrapRef"
		class="graph-canvas-wrap @container relative w-full h-full border border-default rounded-lg overflow-hidden"
		@keydown="onKeydown"
		@dragover="onDragOver"
		@drop="onDrop"
	>
		<DmsFlowCanvas
			ref="flowRef"
			:nodes="vfNodes"
			:edges="vfEdges"
			:node-types="nodeTypes"
			:controls="false"
			:is-valid-connection="isValidConnection"
			:nodes-draggable="!readOnly"
			:nodes-connectable="!readOnly"
			:elements-selectable="true"
			:edges-updatable="!readOnly"
			:deletable-nodes="!readOnly"
			:fit-view-on-init="false"
			:min-zoom="MIN_ZOOM"
			:max-zoom="MAX_ZOOM"
			@nodes-initialized="onNodesInitialized"
			@connect="onConnect"
			@connect-end="onConnectEnd"
			@nodes-change="onNodesChange"
			@delete-nodes="onDeleteNodes"
			@edges-change="onEdgesChange"
			@edge-update-start="onEdgeUpdateStart"
			@edge-update="onEdgeUpdate"
			@edge-update-end="onEdgeUpdateEnd"
			@node-double-click="onNodeDoubleClick"
		>
			<!-- One row along the top edge: the breadcrumb (shrinks, truncated by
			     its owner) and the toolbar (Undo / Redo, the link menu and the
			     selection's group actions; saving lives in the editor's bar). A
			     read-only template-instance view keeps only the group actions
			     (Fork). The row lets pointer events through between the two.
			     Provided unconditionally: DmsFlowCanvas reads its panel slots
			     once, so a slot added later would never render. -->
			<template #top-left>
				<div class="pointer-events-none flex w-[calc(100cqw-1.5rem)] items-start justify-between gap-2">
					<!-- The breadcrumb takes what the toolbar leaves (6rem at least),
					     the toolbar wraps only past that. -->
					<div class="min-w-24 flex-1 basis-0">
						<div class="pointer-events-auto w-fit max-w-full">
							<slot name="breadcrumb" />
						</div>
					</div>
					<div
						v-if="canLink || $slots.groupActions"
						class="pointer-events-auto flex min-w-0 flex-wrap items-center justify-end gap-1 rounded-lg border border-default bg-elevated p-1 shadow-md"
					>
						<template v-if="canLink">
							<!-- Links the selected step can make, for keyboard users: an
							     icon, so the row stays on one line. -->
							<UTooltip :text="$t('dms_automation.editor.canvas.link.label')">
								<USelectMenu
									:model-value="linkChoice"
									:items="linkGroups"
									size="sm"
									variant="ghost"
									icon="i-ph-flow-arrow"
									:aria-label="$t('dms_automation.editor.canvas.link.label')"
									:search-input="{ placeholder: $t('dms_automation.editor.canvas.link.search') }"
									:content="{ align: 'end' }"
									:ui="{ content: 'min-w-72', base: 'ps-1.5 pe-1.5', leading: 'static p-0', placeholder: 'hidden', trailing: 'hidden' }"
									@update:model-value="onLink"
								>
									<template #empty>
										{{ $t('dms_automation.editor.canvas.link.empty') }}
									</template>
								</USelectMenu>
							</UTooltip>
							<div v-if="$slots.groupActions" class="mx-1 h-5 w-px bg-default" />
						</template>
						<!-- Group-related actions slotted in by Editor.vue: Group
						     selection, Save as template, Fork to local group, Enter
						     group. -->
						<slot name="groupActions" />
					</div>
				</div>
			</template>

			<template #bottom-center>
				<p
					v-if="refusalShown"
					role="status"
					class="mx-auto mb-2 flex w-fit max-w-sm items-center gap-1.5 rounded-md border border-warning/40 bg-elevated px-2 py-1 text-xs text-warning shadow-md"
				>
					<UIcon name="i-ph-prohibit" class="size-3.5 shrink-0" />
					{{ refusal }}
				</p>
				<div
					class="mx-auto flex w-fit items-center gap-1 rounded-lg border border-default bg-elevated p-1 shadow-md"
				>
					<!-- Undo / Redo sit with the view controls, leaving the top row
					     to the selection's actions. -->
					<template v-if="!readOnly">
						<UTooltip :text="$t('dms_automation.editor.canvas.undo')" :kbds="['meta', 'z']">
							<UButton
								size="sm"
								variant="ghost"
								color="neutral"
								icon="i-ph-arrow-counter-clockwise"
								:aria-label="$t('dms_automation.editor.canvas.undo')"
								:disabled="!canUndo"
								@click="emit('undo')"
							/>
						</UTooltip>
						<UTooltip :text="$t('dms_automation.editor.canvas.redo')" :kbds="['meta', 'shift', 'z']">
							<UButton
								size="sm"
								variant="ghost"
								color="neutral"
								icon="i-ph-arrow-clockwise"
								:aria-label="$t('dms_automation.editor.canvas.redo')"
								:disabled="!canRedo"
								@click="emit('redo')"
							/>
						</UTooltip>
						<div class="mx-1 h-5 w-px bg-default" />
					</template>
					<UButton
						size="sm"
						variant="ghost"
						color="neutral"
						icon="i-ph-magnifying-glass-minus"
						:aria-label="$t('dms_automation.editor.canvas.zoomOut')"
						@click="flowRef?.zoomOut()"
					/>
					<button
						type="button"
						class="px-2 text-sm tabular-nums text-muted transition-colors hover:text-highlighted"
						:aria-label="$t('dms_automation.editor.canvas.resetZoom')"
						@click="resetZoom"
					>
						{{ zoomPercent }}
					</button>
					<UButton
						size="sm"
						variant="ghost"
						color="neutral"
						icon="i-ph-magnifying-glass-plus"
						:aria-label="$t('dms_automation.editor.canvas.zoomIn')"
						@click="flowRef?.zoomIn()"
					/>
					<div class="mx-1 h-5 w-px bg-default" />
					<UButton
						size="sm"
						variant="ghost"
						color="neutral"
						icon="i-ph-arrows-out"
						:aria-label="$t('dms_automation.editor.canvas.fitView')"
						@click="fitView"
					/>
				</div>
			</template>
		</DmsFlowCanvas>
	</div>
</template>

<style>
/* The top row spans the canvas: between the breadcrumb and the toolbar, the
   pane under it stays draggable. Vue Flow sets the panel's pointer-events
   inline, hence the !important. */
.graph-canvas-wrap .vue-flow__panel.top.left {
	pointer-events: none !important;
}

/* Ports keep their small dot but take a 24px target (WCAG 2.5.8). */
.dms-automation-node .vue-flow__handle::before {
	content: '';
	position: absolute;
	inset: -8px;
	border-radius: 9999px;
}

/* Trigger edges (control flow) take the info role, data edges the success
   role, dashed; theme tokens only (AU-15). The `.edge-*` class out-specifies
   DmsFlowCanvas's generic `.vue-flow__edge-path` rule. */
.vue-flow__edge.edge-trigger .vue-flow__edge-path {
	stroke: var(--ui-info);
	stroke-width: 2;
}

.vue-flow__edge.edge-data .vue-flow__edge-path {
	stroke: var(--ui-success);
	stroke-width: 2;
	stroke-dasharray: 4 4;
}

.vue-flow__edge.edge-trigger.edge-taken .vue-flow__edge-path {
	stroke: var(--ui-success);
	stroke-width: 2.5;
}

.vue-flow__edge.edge-trigger.edge-failed .vue-flow__edge-path {
	stroke: var(--ui-error);
	stroke-width: 2.5;
}

.vue-flow__edge.edge-trigger.edge-idle .vue-flow__edge-path {
	opacity: 0.35;
}

/* Selected / focused edge highlight. The doubled `.edge-*` class lifts
   specificity above DmsFlowCanvas's own selected rule, which would repaint the
   edge in the accent and erase the trigger-vs-data distinction. */
.vue-flow__edge.edge-trigger.selected .vue-flow__edge-path,
.vue-flow__edge.edge-data.selected .vue-flow__edge-path,
.vue-flow__edge.edge-trigger:focus .vue-flow__edge-path,
.vue-flow__edge.edge-data:focus .vue-flow__edge-path,
.vue-flow__edge.edge-trigger:focus-visible .vue-flow__edge-path,
.vue-flow__edge.edge-data:focus-visible .vue-flow__edge-path {
	stroke: var(--ui-warning);
	stroke-width: 3;
}
</style>
