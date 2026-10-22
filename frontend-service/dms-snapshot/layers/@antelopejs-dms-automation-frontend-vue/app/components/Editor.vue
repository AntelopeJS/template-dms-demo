<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, type Ref, watch } from 'vue'
import { type RunDetail, type TraceStep, useAutomationRuns } from '../composables/useAutomationRuns'
import type { NodeRunState } from './Editor/nodes/GenericNode.vue'
import type { DockIssue, DockRun, DockTab } from './Editor/BottomDock.vue'
import type { ProcedureSummaryRow } from './Editor/ProcedureSwitcher.vue'
import { describeDateTime, describeDuration, describeTime, stepTitle, type TriggerSummary, type WordedTrigger } from '../utils/describe'
import type { BreadcrumbItem } from '@nuxt/ui'
import type { NodeKindEntry, TemplateSummary } from '../composables/useAutomationNodeKinds'
import { newId, queryString } from '../utils/automation'
import type {
	ActionType,
	DataEdge,
	DataNodeType,
	GraphNode,
	GroupPort,
	JsonSchema,
	JsonSchemaProperty,
	ProcedureGraph,
	TriggerEdge,
	TriggerType,
} from '../composables/useGraphConnect'

// Editor mode.
//
// 'procedure' (default) — loads /api/automation/procedures,
//   manages the selected procedure list, saves via PUT /procedures/:id, exposes
//   the manual Run-now button.
// 'template'   — loads ONE template via GET /api/automation/templates/:id and
//   edits its `subgraph` directly. The template's `ports` are injected as the
//   root canvas's `parentGroupPorts` so the groupInput/groupOutput sentinels at
//   the root level render the template's outer-face handles. Save goes to
//   PUT /api/automation/templates/:id. Run, procedure list, and enabled toggle
//   are hidden.
//
// Mode is resolved from the route query: `?template=<id>` switches into
// template mode.
// This keeps the route wiring trivial (the Templates catalog navigates
// to `/modules/automation/builder?template=<id>`) without needing a
// dedicated page.
const props = withDefaults(
	defineProps<{
		apiUrl?: string
		runsUrl?: string
		traceUrl?: string
	}>(),
	{
		apiUrl: '/api/automation',
		runsUrl: '/modules/automation/runs',
		traceUrl: '/modules/automation/trace',
	},
)

const route = useDmsRoute()
const router = useDmsRouter()
const { t, te, locale } = useI18n()
const { dateTimeFormat } = useRegionalFormat()
const { processI18n } = useTranslation()
const { processText } = useComposedText()
// Shortcut hints print ⌘ on macOS and Ctrl elsewhere, like the rest of the DMS.
const { formatShortcut } = useKeyboardPlatform()

/** The builder's own path, without the query its URL may carry. */
function builderPath(): string {
	return route.path.split('?')[0] ?? route.path
}

function queryValue(key: string): string | null {
	return queryString(route.query[key])
}

const templateQueryId = computed(() => queryValue('template'))

const editorMode = computed<'procedure' | 'template'>(() => (templateQueryId.value ? 'template' : 'procedure'))

const editorTemplateId = computed<string | null>(() => (editorMode.value === 'template' ? templateQueryId.value : null))

interface ProcedureRecord {
	_id: string
	name: string
	description: string
	enabled: boolean
	graph: ProcedureGraph
	// The graph's version (it moves with the graph only), and the revision
	// (it moves with every write: a save, a pause from the list). A save sends
	// the revision it started from back, so the server refuses to overwrite
	// what was written elsewhere in the meantime.
	version?: number
	revision?: number
}

const { $authFetch } = useAuthFetch()
const toast = useToast()
// Composables are called before the first `await` of this setup: after it,
// the component instance they inject from is gone.
const { confirm } = useConfirm()
const { confirmFrom } = useConfirmFrom()
const runsApi = useAutomationRuns(props.apiUrl)
// Leaving the page with unsaved changes goes through the DMS leave guard.
const unsavedDraft = ref(false)
useUnsavedChanges({ dirty: unsavedDraft })

const procedures = ref<ProcedureRecord[]>([])
const selectedId = ref<string | null>(null)
const switcherOpen = ref(false)
const newProcedureOpen = ref(false)
const runNowOpen = ref(false)
const loading = ref(false)
const loadError = ref<string | null>(null)
// The `?selected=` of a procedure that no longer exists: the builder says so
// instead of opening another one.
const missingProcedureId = ref<string | null>(null)
// `?template=` names a template that no longer exists.
const templateNotFound = ref(false)
const saving = ref(false)
const running = ref(false)

// Template-mode state. `templatePorts` holds the OUTER-face ports of the
// edited template — they're not part of the editable subgraph but they ARE
// the source of truth for the root-level groupInput/groupOutput sentinels'
// handle sets. We pipe them through `currentParentGroupPorts` so GraphCanvas
// renders them identically to how it renders a nested group's sentinels.
const templatePorts = ref<GroupPort[]>([])
// Kept as loaded: saving the template from the editor must not reset its icon.
const templateIcon = ref<string>('i-ph-package')

// The palette's catalogs, read with the page. They are optional for
// editing: one the server cannot answer is an empty list.
const triggerTypesRead = useApiData<TriggerType[]>('/api/automation/trigger-types')
const actionTypesRead = useApiData<ActionType[]>('/api/automation/action-types')
const dataNodeTypesRead = useApiData<DataNodeType[]>('/api/automation/data-node-types')
// Per-NodeKind UI metadata served by the backend
// (`/api/automation/node-kinds`). Drives the editor's GenericNode renderer
// so the frontend doesn't need to know about specific kinds.
const nodeKindsRead = useAutomationNodeKinds()
const triggerTypes = computed(() => triggerTypesRead.data.value ?? [])
const actionTypes = computed(() => actionTypesRead.data.value ?? [])
const dataNodeTypes = computed(() => dataNodeTypesRead.data.value ?? [])
const nodeKinds = computed(() => nodeKindsRead.data.value ?? [])

// Workspace-global templates surfaced in the canvas's node palette. Empty
// list → palette section hidden (handled inside BuilderPalette).
//
// Only the fields the palette + template-instance creation need are kept,
// and handed over with the page: the list endpoint also returns the
// description, the usage count and the hydrated subgraph. Under a key of its
// own, apart from the library's full rows of the same URL.
const templatesRead = useApiData<TemplateSummary[]>('/api/automation/templates', {
	key: 'dms-automation-palette-templates',
	transform: (value) =>
		(value as { results: TemplateSummary[] }).results.map((t) => ({
			_id: t._id,
			name: t.name,
			icon: t.icon,
			ports: Array.isArray(t.ports) ? t.ports : [],
		})),
})
const templates = computed(() => templatesRead.data.value ?? [])

// Hide the palette section while editing a template (self-edit). The
// server's cycle check would still catch any reference cycle, but blocking
// it at the UI level keeps the UX cleaner — the user can't even attempt
// to drop a template (including the one currently open) into itself.
const palettesTemplates = computed<TemplateSummary[] | undefined>(() =>
	editorMode.value === 'template' ? undefined : templates.value,
)

// Triggers live at the top level of a procedure: the palette offers none
// inside a group or a template.
const paletteTriggerTypes = computed<TriggerType[]>(() =>
	editorMode.value === 'template' || subgraphPath.value.length > 1 ? [] : triggerTypes.value,
)

// The inspector (or the template's ports): docked beside the canvas from lg
// (the palette starts folded below xl, so the canvas keeps most of the
// width), floating over it on narrower screens.
const ASIDE_CLASS =
	'absolute inset-y-0 right-0 z-10 flex w-80 max-w-full flex-col border-l border-default bg-default shadow-lg lg:relative lg:z-auto lg:shrink-0 lg:shadow-none'

// Which graph the canvas shows (procedure or template, then the groups
// entered): the canvas fits a new one into view.
const canvasViewKey = computed(() => [selectedId.value ?? '', ...subgraphPath.value.slice(1).map((segment) => segment.id)].join('/'))

// Back to the Library's Templates tab, on the template being edited.
const libraryBackUrl = computed(() =>
	editorTemplateId.value && !templateNotFound.value
		? `/modules/automation/library?tab=templates&template=${editorTemplateId.value}`
		: '/modules/automation/library?tab=templates',
)

const selectedNodeId = ref<string | null>(null)
// Mirrors GraphCanvas's @selection-change — full set of currently selected
// node ids in the canvas, sentinel-filtered. Drives the "Group selection"
// toolbar button (see canGroupSelection / createGroupFromSelection).
const selectedNodeIds = ref<string[]>([])

function onSelectionChange(payload: { ids: string[] }) {
	selectedNodeIds.value = payload.ids
}

// Subgraph navigation stack. The first entry is always the procedure root;
// each subsequent entry is a group / template segment the user has entered.
// Cleared and re-seeded whenever the selected procedure changes (see the
// watch on selectedId below).
//
// kind === 'procedure' — id is the procedure _id, name is its display name.
// kind === 'group'     — id is the group node's id within its parent graph.
// kind === 'template'  — reserved for the dedicated template editor view.
//                        Navigation into local groups pushes as 'group';
//                        template instances likewise push as 'group' with
//                        the read-only signal taken from the node having a
//                        templateId, not from the path kind.
interface SubgraphPathSegment {
	kind: 'procedure' | 'group' | 'template'
	id: string
	name: string
}

const subgraphPath = ref<SubgraphPathSegment[]>([])

interface ProcedureSnapshot {
	name: string
	enabled: boolean
	graph: ProcedureGraph
	// Template mode only: the template's outer ports, edited at its root.
	ports?: GroupPort[]
}

const graphHistory = ref<ProcedureGraph[]>([])
const graphHistoryIndex = ref<number>(-1)
const savedSnapshot = ref<ProcedureSnapshot | null>(null)
const HISTORY_LIMIT = 100

function cloneGraph(g: ProcedureGraph): ProcedureGraph {
	return JSON.parse(JSON.stringify(g))
}

function takeSnapshot(p: ProcedureRecord): ProcedureSnapshot {
	return {
		name: p.name,
		enabled: p.enabled,
		graph: cloneGraph(p.graph),
		...(editorMode.value === 'template' ? { ports: templatePorts.value.map((port) => ({ ...port })) } : {}),
	}
}

// Strip per-node position: a drag is told apart from a structural change.
function structuralKey(g: ProcedureGraph): string {
	return JSON.stringify({
		nodes: g.nodes.map(({ position: _pos, ...rest }) => rest),
		triggerEdges: g.triggerEdges,
		dataEdges: g.dataEdges,
	})
}

/**
 * What a change does, when it is one a burst of changes repeats: the same
 * nodes moved ("move:a,b"), or the same settings of one node edited
 * ("edit:a:url"), at any depth of groups. `null` for anything else.
 */
function repeatableChangeKey(before: ProcedureGraph, after: ProcedureGraph): string | null {
	if (JSON.stringify([before.triggerEdges, before.dataEdges]) !== JSON.stringify([after.triggerEdges, after.dataEdges])) return null
	if (before.nodes.length !== after.nodes.length) return null
	const moved: string[] = []
	let edited: string | null = null
	for (let i = 0; i < after.nodes.length; i++) {
		const a = before.nodes[i]! as GraphNode & Record<string, unknown>
		const b = after.nodes[i]! as GraphNode & Record<string, unknown>
		if (a.id !== b.id) return null
		const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
		if (keys.length === 0) continue
		if (keys.length === 1 && keys[0] === 'position') {
			moved.push(a.id)
			continue
		}
		if (edited) return null
		if (keys.length === 1 && keys[0] === 'subgraph' && a.subgraph && b.subgraph) {
			const inner = repeatableChangeKey(a.subgraph, b.subgraph)
			if (!inner) return null
			edited = `${a.id}/${inner}`
			continue
		}
		if (!keys.every((k) => k === 'config' || k === 'label')) return null
		const fields = Object.keys({ ...a.config, ...b.config }).filter((k) => JSON.stringify(a.config?.[k]) !== JSON.stringify(b.config?.[k]))
		edited = `${a.id}:${[...fields, ...(keys.includes('label') ? ['label'] : [])].join(',')}`
	}
	if (edited) return moved.length ? null : `edit:${edited}`
	return moved.length ? `move:${moved.join(',')}` : null
}

// A drag emits a graph per frame and a text field one per keystroke: the
// changes of one burst make one undo step (the last one is replaced while
// the same nodes move, or the same field is typed in, without a pause).
const HISTORY_MERGE_MS = 1000
let lastChange: { key: string | null; at: number } = { key: null, at: 0 }

function pushHistory(g: ProcedureGraph, merge = false) {
	const current = graphHistory.value[graphHistoryIndex.value]
	if (current && JSON.stringify(current) === JSON.stringify(g)) return
	const key = merge && current ? repeatableChangeKey(current, g) : null
	const now = Date.now()
	const sameBurst = key !== null && key === lastChange.key && now - lastChange.at < HISTORY_MERGE_MS
	lastChange = { key, at: now }
	// A new action, a drag included, drops what Redo could bring back.
	graphHistory.value = graphHistory.value.slice(0, graphHistoryIndex.value + 1)
	if (sameBurst) {
		graphHistory.value[graphHistoryIndex.value] = cloneGraph(g)
		return
	}
	graphHistory.value.push(cloneGraph(g))
	graphHistoryIndex.value = graphHistory.value.length - 1
	if (graphHistory.value.length > HISTORY_LIMIT) {
		graphHistory.value.shift()
		graphHistoryIndex.value--
	}
}

function initHistoryAndSaved() {
	lastChange = { key: null, at: 0 }
	if (selected.value) {
		graphHistory.value = [cloneGraph(selected.value.graph)]
		graphHistoryIndex.value = 0
		savedSnapshot.value = takeSnapshot(selected.value)
	} else {
		graphHistory.value = []
		graphHistoryIndex.value = -1
		savedSnapshot.value = null
	}
}

const PROCEDURES_PAGE_SIZE = 200

// What the builder opens, read with the page: every procedure, or the
// template `?template=` names. The editor works on its own copy of what they
// answered (`procedures`), which its drafts change.
const procedureListRead = useApiData<ProcedureRecord[]>(
	() => (editorMode.value === 'procedure' ? 'dms-automation-builder-procedures' : null),
	async ({ $authFetch, signal }) => {
		// The API serves pages of PROCEDURES_PAGE_SIZE at most: read them all.
		const list: ProcedureRecord[] = []
		for (let page = 0; ; page++) {
			const { results } = await $authFetch<{ results: ProcedureRecord[] }>(
				`/api/automation/procedures?limit=${PROCEDURES_PAGE_SIZE}&page=${page}`,
				{ signal },
			)
			list.push(...results)
			if (results.length < PROCEDURES_PAGE_SIZE) break
		}
		return list
	},
)

interface AutomationTemplateApi {
	_id: string
	name: string
	description?: string
	icon?: string
	ports: GroupPort[]
	subgraph: ProcedureGraph
}

const templateRead = useApiData<AutomationTemplateApi>(() =>
	editorTemplateId.value ? `/api/automation/templates/${editorTemplateId.value}` : null,
)

/** Opens what the procedure list answered: `?selected=`, else the procedure open, else the first. */
function openList() {
	const error = procedureListRead.error.value
	if (error) {
		loadError.value = describeApiError(error)
		return
	}
	loadError.value = null
	// Copies: a draft changes the editor's records, not the read's.
	procedures.value = (procedureListRead.data.value ?? []).map((p) => ({ ...p }))
	if (
		selectedId.value &&
		!procedures.value.some((p) => p._id === selectedId.value)
	) {
		selectedId.value = null
	}
	const requested = queryValue('selected')
	if (requested && procedures.value.some((p) => p._id === requested)) {
		selectedId.value = requested
	} else if (requested && !selectedId.value) {
		// A link to a deleted procedure opens none: the builder says so
		// and offers the switcher (see onMounted).
		missingProcedureId.value = requested
		return
	}
	if (!selectedId.value && procedures.value.length > 0) {
		const first = procedures.value[0]
		selectedId.value = first ? first._id : null
	}
}

/** Reads the procedure list again (one was created) and opens it. */
async function loadList() {
	loading.value = true
	await procedureListRead.refresh()
	loading.value = false
	openList()
}

/** Opens what the template read answered, or says why there is none. */
function openTemplate() {
	const id = editorTemplateId.value
	if (!id) {
		templateNotFound.value = true
		loadError.value = t('dms_automation.editor.templateNotFound')
		return
	}
	const error = templateRead.error.value
	const tpl = templateRead.data.value
	if (error || !tpl) {
		// Worded for users, the same on the server and in the browser (the
		// raw fetch error names an internal URL that differs between them).
		templateNotFound.value = apiErrorStatus(error) === 404
		loadError.value = templateNotFound.value ? t('dms_automation.editor.templateNotFound') : describeApiError(error)
		procedures.value = []
		selectedId.value = null
		templatePorts.value = []
		return
	}
	templateNotFound.value = false
	loadError.value = null
	// Adapt the template into the ProcedureRecord shape so the rest of
	// the editor (history, dirty-tracking, sentinel sync, group toolbar)
	// keeps working unchanged. `enabled` is meaningless for templates;
	// pin it to true so the "disabled" warning banner never appears.
	const adapted: ProcedureRecord = {
		_id: tpl._id,
		name: tpl.name,
		description: tpl.description ?? '',
		enabled: true,
		graph: tpl.subgraph,
	}
	procedures.value = [adapted]
	selectedId.value = adapted._id
	templateIcon.value = tpl.icon || 'i-ph-package'
	templatePorts.value = Array.isArray(tpl.ports)
		? tpl.ports.map((p) => ({ ...p }))
		: []
}

// What the builder opens is awaited: the server renders it, and the browser
// opens the same from the data handed over. The catalogs, the templates and
// the bar's figures are read meanwhile, in parallel.
await Promise.all([procedureListRead, templateRead])
if (editorMode.value === 'template') openTemplate()
else openList()

const selected = computed<ProcedureRecord | null>(
	() => procedures.value.find((p) => p._id === selectedId.value) ?? null,
)

// `watch(selectedId, …)` (declared below) doesn't fire for the value
// assigned during the awaits above, so seed history + savedSnapshot once
// for the auto-selected procedure. Must come after `selected` is declared
// — initHistoryAndSaved() reads selected.value.
initHistoryAndSaved()
seedSubgraphPath()

function seedSubgraphPath() {
	const p = selected.value
	if (!p) {
		subgraphPath.value = []
		return
	}
	// In template mode the root segment is the template itself (we reuse the
	// 'template' kind already declared on SubgraphPathSegment). The breadcrumb
	// renders it with the i-ph-link icon, which is exactly what we want for
	// "Templates ▸ <name>".
	if (editorMode.value === 'template') {
		subgraphPath.value = [
			{ kind: 'template', id: p._id, name: p.name || 'Template' },
		]
		return
	}
	subgraphPath.value = [
		{ kind: 'procedure', id: p._id, name: p.name || 'Procedure' },
	]
}

// Walk the procedure graph following subgraphPath. Returns the full chain
// of (segment, containerGraph, groupNode|null) so currentGraph and
// currentParentGroupPorts can be derived from one traversal without
// re-walking.
//
// If a path segment can't be resolved (e.g. the group node was deleted in
// the outer graph), traversal stops at the last valid level — the caller
// is expected to also watch the stale path and trim it (see the watch on
// `selected.graph`).
interface SubgraphFrame {
	segment: SubgraphPathSegment
	graph: ProcedureGraph
	// The group node that owns `graph` (i.e. graph === groupNode.subgraph).
	// Null for the procedure root.
	groupNode: GraphNode | null
}

const subgraphFrames = computed<SubgraphFrame[]>(() => {
	const p = selected.value
	if (!p) return []
	const path = subgraphPath.value
	if (path.length === 0) return []
	const frames: SubgraphFrame[] = [
		{ segment: path[0]!, graph: p.graph, groupNode: null },
	]
	for (let i = 1; i < path.length; i++) {
		const seg = path[i]!
		const parent = frames[i - 1]!
		const node = parent.graph.nodes.find(
			(n) => n.id === seg.id && n.kind === 'group',
		)
		if (!node) break
		// Local group → inline subgraph. Template instance → no inline
		// subgraph on the client, so we can't navigate in. The
		// double-click handler guards against pushing a template-instance
		// segment in the first place; this is a safety net.
		const sub = node.subgraph
		if (!sub) break
		frames.push({ segment: seg, graph: sub, groupNode: node })
	}
	return frames
})

const currentGraph = computed<ProcedureGraph | null>(() => {
	const frames = subgraphFrames.value
	if (frames.length === 0) return null
	return frames[frames.length - 1]!.graph
})

// The parent group node whose subgraph we're currently viewing — null at
// the procedure root.
const currentParentGroup = computed<GraphNode | null>(() => {
	const frames = subgraphFrames.value
	if (frames.length <= 1) return null
	return frames[frames.length - 1]!.groupNode
})

const currentParentGroupPorts = computed<GroupPort[] | undefined>(() => {
	const g = currentParentGroup.value
	if (g) return Array.isArray(g.ports) ? g.ports : []
	// Root level in template mode: the template's own `ports` are the
	// outer-face of the edited subgraph. Inject them so the root-level
	// groupInput / groupOutput sentinels render the right handles.
	if (editorMode.value === 'template') return templatePorts.value
	return undefined
})

// Read-only mode kicks in when viewing the inner subgraph of a template
// instance (a group node carrying `templateId`). The fork action lets
// the user promote it to a local group; until then we just show a
// banner and disable mutations.
const isCurrentGraphReadOnly = computed<boolean>(() => {
	const g = currentParentGroup.value
	if (!g) return false
	return Boolean(g.templateId)
})

const breadcrumbItems = computed<BreadcrumbItem[]>(() =>
	subgraphPath.value.map((seg, idx) => ({
		label: seg.name,
		icon:
			seg.kind === 'procedure'
				? 'i-ph-flow-arrow'
				: seg.kind === 'template'
					? 'i-ph-link'
					: 'i-ph-package',
		// onSelect fires for clicks; popping the path to `idx + 1` keeps
		// the clicked segment and discards everything deeper.
		onSelect: (ev: Event) => {
			ev.preventDefault()
			if (idx < subgraphPath.value.length - 1) {
				subgraphPath.value = subgraphPath.value.slice(0, idx + 1)
				// Clear node selection — the old selected node id may not
				// exist in the new current graph.
				selectedNodeId.value = null
			}
		},
	})),
)

// If the user deletes a group node from an outer graph while their path
// points into its subgraph, prune the path back to the deepest valid
// frame. Cheap because subgraphFrames already does the traversal.
watch(
	() => subgraphFrames.value.length,
	(framesLen) => {
		if (framesLen > 0 && framesLen < subgraphPath.value.length) {
			subgraphPath.value = subgraphPath.value.slice(0, framesLen)
			selectedNodeId.value = null
		}
	},
)

// Keep the procedure-root breadcrumb label in sync with renames.
watch(
	() => selected.value?.name,
	(name) => {
		const first = subgraphPath.value[0]
		if (first && first.kind === 'procedure' && name) first.name = name
	},
)

function exitSubgraph() {
	subgraphPath.value = subgraphPath.value.slice(0, -1)
	selectedNodeId.value = null
}

function onGraphUpdate(g: ProcedureGraph) {
	if (!selected.value) return
	const path = subgraphPath.value
	if (path.length <= 1) {
		// At procedure root — write straight through, same as before
		// subgraph navigation existed.
		selected.value.graph = g
		pushHistory(g, true)
		return
	}
	// At a deeper level — `g` is the subgraph of the deepest group node.
	// Walk the path from the outer procedure graph down, cloning the
	// chain so Vue's reactivity sees a fresh top-level graph (history
	// keys structuralKey() off node identity at every level).
	const rootGraph = cloneGraph(selected.value.graph)
	let containerNodes = rootGraph.nodes
	for (let i = 1; i < path.length; i++) {
		const seg = path[i]!
		const idx = containerNodes.findIndex(
			(n) => n.id === seg.id && n.kind === 'group',
		)
		if (idx === -1) {
			// Path was stale — bail out without mutating; the watch on
			// subgraphFrames.length will prune the path.
			return
		}
		// Replace the node at idx with a shallow clone so we can mutate
		// its `subgraph` without aliasing back into the original (the
		// outer graph already came from cloneGraph above, so its node
		// objects are fresh too — but the inner subgraph reference
		// chain needs explicit substitution).
		const cloned: GraphNode = { ...containerNodes[idx]! }
		containerNodes[idx] = cloned
		if (i === path.length - 1) {
			cloned.subgraph = g
		} else {
			// Mid-chain — keep walking, ensuring each intermediate
			// subgraph is also a fresh object for the next iteration's
			// nodes array.
			if (!cloned.subgraph) return
			cloned.subgraph = {
				...cloned.subgraph,
				nodes: [...cloned.subgraph.nodes],
			}
			containerNodes = cloned.subgraph.nodes
		}
	}
	selected.value.graph = rootGraph
	pushHistory(rootGraph, true)
}

const canUndo = computed<boolean>(
	() => graphHistoryIndex.value > 0,
)
const canRedo = computed<boolean>(
	() => graphHistoryIndex.value < graphHistory.value.length - 1,
)
const isDirty = computed<boolean>(() => {
	if (!selected.value || !savedSnapshot.value) return false
	return (
		JSON.stringify(takeSnapshot(selected.value)) !==
		JSON.stringify(savedSnapshot.value)
	)
})

function onUndo() {
	if (!canUndo.value || !selected.value) return
	lastChange = { key: null, at: 0 }
	graphHistoryIndex.value--
	const g = graphHistory.value[graphHistoryIndex.value]
	if (g) selected.value.graph = cloneGraph(g)
}

function onRedo() {
	if (!canRedo.value || !selected.value) return
	lastChange = { key: null, at: 0 }
	graphHistoryIndex.value++
	const g = graphHistory.value[graphHistoryIndex.value]
	if (g) selected.value.graph = cloneGraph(g)
}

function onCancel() {
	if (!selected.value || !savedSnapshot.value) return
	const snap = savedSnapshot.value
	selected.value.name = snap.name
	selected.value.enabled = snap.enabled
	selected.value.graph = cloneGraph(snap.graph)
	if (snap.ports) templatePorts.value = snap.ports.map((port) => ({ ...port }))
	pushHistory(selected.value.graph)
	// A refused save is answered by the draft it refused: discarding it
	// clears the banner, and the name, outside the graph, is checked again.
	saveBlocked.value = false
	void validateDraft()
}

const selectedNode = computed<GraphNode | null>(() => {
	const id = selectedNodeId.value
	if (!id) return null
	// Lookup is scoped to whichever graph the canvas is currently
	// bound to, not always the procedure root — otherwise selecting a
	// node inside a subgraph would resolve to null.
	const g = currentGraph.value
	if (!g) return null
	return g.nodes.find((n) => n.id === id) ?? null
})

const selectedNodeTriggerType = computed<TriggerType | null>(() => {
	const n = selectedNode.value
	if (!n || n.kind !== 'trigger') return null
	return triggerTypes.value.find((t) => t.id === n.typeId) ?? null
})

const selectedNodeActionType = computed<ActionType | null>(() => {
	const n = selectedNode.value
	if (!n || n.kind !== 'action') return null
	return actionTypes.value.find((a) => a.id === n.typeId) ?? null
})

function onSelectNode(id: string | null) {
	selectedNodeId.value = id
}

// The node palette lives in the left BuilderPalette sidebar; its add events are
// forwarded to the canvas' exposed helpers via this template ref.
const graphCanvasRef = ref<{
	addNode: (kind: string, typeId?: string) => void
	addTemplateInstance: (template: { _id: string; name: string; icon?: string; ports: GroupPort[] }) => void
} | null>(null)

function onPaletteAddNode(payload: { kind: string; typeId?: string }) {
	graphCanvasRef.value?.addNode(payload.kind, payload.typeId)
}
function onPaletteAddTemplate(template: { _id: string; name: string; icon?: string; ports: GroupPort[] }) {
	graphCanvasRef.value?.addTemplateInstance(template)
}

watch(selectedId, () => {
	selectedNodeId.value = null
	initHistoryAndSaved()
	seedSubgraphPath()
})

// `?template=<id>` changed while the editor stayed mounted (Editor is
// mounted once per route navigation, so this is mostly a guard for in-place
// query updates, e.g. catalog "Edit" buttons using router.push): the template
// read follows the URL, and the editor opens what it answers.
watch(
	() => templateRead.status.value,
	(status) => {
		if (editorMode.value === 'template' && (status === 'success' || status === 'error')) openTemplate()
	},
)

/** A group's name: its step name, else the name it was created with. */
function groupName(node: GraphNode): string {
	return node.label || (node.config?.name as string | undefined) || t('dms_automation.editor.groupDefaultName')
}

function onGroupEnter(payload: { id: string }) {
	const g = currentGraph.value
	if (!g) return
	const node = g.nodes.find((n) => n.id === payload.id && n.kind === 'group')
	if (!node) return
	// Template instances have no inline subgraph — the frame walker would
	// stop at this segment and the watcher would prune it back. Bail early so
	// the path doesn't briefly include a doomed segment.
	if (node.templateId && !node.subgraph) return
	const name = groupName(node)
	subgraphPath.value = [
		...subgraphPath.value,
		{ kind: 'group', id: node.id, name },
	]
	selectedNodeId.value = null
}

// "Enter group" affordance — true iff the currently selected node is a group
// (local, or a template instance with a resolved subgraph). Read-only state
// is not consulted: entering a group from a read-only view is allowed.
// Drives the toolbar button, the inspector button, and the Tab keybinding.
const canEnterGroup = computed<boolean>(() => {
	const n = selectedNode.value
	if (!n || n.kind !== 'group') return false
	// Template instances need a resolved subgraph to navigate into; without
	// one we can't render the inner view.
	if (n.templateId && !n.subgraph) return false
	return true
})

function enterSelectedGroup() {
	const n = selectedNode.value
	if (!n || n.kind !== 'group') return
	onGroupEnter({ id: n.id })
}

function onUpdateNode(updated: GraphNode) {
	const g = currentGraph.value
	if (!g) return
	const nextGraph: ProcedureGraph = {
		...g,
		nodes: g.nodes.map((n) => (n.id === updated.id ? updated : n)),
	}
	onGraphUpdate(nextGraph)
}

// Detect port renames between two port arrays of the same group node.
//
// Two-pass matching, scoped per (kind, direction):
//   1. Ports present in BOTH arrays under the same (kind, direction, name) are
//      considered identical — no rename.
//   2. Of the remaining old/new ports, pair them positionally within each
//      (kind, direction) bucket. Each pair is a rename (old.name → new.name).
//      Unpaired old-only ports are true deletions; unpaired new-only ports are
//      true additions.
//
// This is heuristic but the GroupPortEditor emits one mutation per UX action,
// so each ports:update typically carries a single delta and the positional
// pairing is unambiguous.
interface PortRename {
	kind: 'data' | 'trigger'
	direction: 'in' | 'out'
	oldName: string
	newName: string
}

function detectPortRenames(
	oldPorts: GroupPort[],
	newPorts: GroupPort[],
): PortRename[] {
	const renames: PortRename[] = []
	const buckets: Array<{ kind: 'data' | 'trigger'; direction: 'in' | 'out' }> = [
		{ kind: 'data', direction: 'in' },
		{ kind: 'data', direction: 'out' },
		{ kind: 'trigger', direction: 'in' },
		{ kind: 'trigger', direction: 'out' },
	]
	for (const b of buckets) {
		const oldInBucket = oldPorts.filter(
			(p) => p.kind === b.kind && p.direction === b.direction,
		)
		const newInBucket = newPorts.filter(
			(p) => p.kind === b.kind && p.direction === b.direction,
		)
		const newNames = new Set(newInBucket.map((p) => p.name))
		const oldNames = new Set(oldInBucket.map((p) => p.name))
		// Ports that exist in both arrays with the same name didn't change.
		const oldOnly = oldInBucket.filter((p) => !newNames.has(p.name))
		const newOnly = newInBucket.filter((p) => !oldNames.has(p.name))
		const pairCount = Math.min(oldOnly.length, newOnly.length)
		for (let i = 0; i < pairCount; i++) {
			renames.push({
				kind: b.kind,
				direction: b.direction,
				oldName: oldOnly[i]!.name,
				newName: newOnly[i]!.name,
			})
		}
	}
	return renames
}

// Rewrite edge endpoints that referenced the renamed port names. Mutates the
// provided edge arrays in place.
//
// `nodeId` is the node owning the renamed ports — either the outer group node
// (for the outer graph's edges) or a sentinel node id inside the subgraph (for
// the inner edges). The direction of the rename determines which edge end is
// affected:
//   • data/in     → edge.to.field   when edge.to.node === nodeId
//   • data/out    → edge.from.port  when edge.from.node === nodeId
//   • trigger/in  → edge.to.branch  when edge.to.node === nodeId
//   • trigger/out → edge.from.branch when edge.from.node === nodeId
//
// For the inner subgraph, the sentinels invert the direction (an inbound port
// on the group is an OUTBOUND handle on the groupInput sentinel and vice
// versa). Callers pass `invertDirection: true` so a group-level "in" rename is
// applied to the sentinel's "out" handles, etc.
function applyPortRenamesToEdges(
	triggerEdges: TriggerEdge[],
	dataEdges: DataEdge[],
	nodeId: string,
	renames: PortRename[],
	invertDirection: boolean,
): void {
	for (const r of renames) {
		const effectiveDirection = invertDirection
			? r.direction === 'in'
				? 'out'
				: 'in'
			: r.direction
		if (r.kind === 'data') {
			if (effectiveDirection === 'out') {
				for (const e of dataEdges) {
					if (e.from.node === nodeId && e.from.port === r.oldName) {
						e.from.port = r.newName
					}
				}
			} else {
				for (const e of dataEdges) {
					if (e.to.node === nodeId && e.to.field === r.oldName) {
						e.to.field = r.newName
					}
				}
			}
		} else {
			if (effectiveDirection === 'out') {
				for (const e of triggerEdges) {
					if (e.from.node === nodeId && e.from.branch === r.oldName) {
						e.from.branch = r.newName
					}
				}
			} else {
				for (const e of triggerEdges) {
					if (e.to.node === nodeId && e.to.branch === r.oldName) {
						e.to.branch = r.newName
					}
				}
			}
		}
	}
}

// Make sure the group node's local subgraph has the sentinels and that no
// inner edge references a port that was just removed. The sentinels are
// auto-managed (the user never creates them by hand); their handle set is
// derived at render time from the parent group's `ports` array (see
// GraphCanvas.vue `parent-group-ports` prop plumbing), so this
// function only owns four responsibilities:
//   1. Ensure a single groupInput and a single groupOutput exist.
//   2. Drop data edges whose source/target port no longer exists.
//   3. Drop trigger edges whose source branch (originating at groupInput)
//      no longer exists.
//   4. Drop trigger edges into groupOutput whose target port (`to.branch`)
//      no longer exists.
function syncSentinels(group: GraphNode): void {
	if (!group.subgraph) return

	let gi = group.subgraph.nodes.find((n) => n.kind === 'groupInput')
	let go = group.subgraph.nodes.find((n) => n.kind === 'groupOutput')

	if (!gi) {
		gi = {
			id: newId(),
			kind: 'groupInput',
			config: {},
			position: { x: 0, y: 0 },
		}
		group.subgraph.nodes.push(gi)
	}
	if (!go) {
		go = {
			id: newId(),
			kind: 'groupOutput',
			config: {},
			position: { x: 600, y: 0 },
		}
		group.subgraph.nodes.push(go)
	}

	const ports = Array.isArray(group.ports) ? group.ports : []
	const validDataIn = new Set(
		ports
			.filter((p) => p.kind === 'data' && p.direction === 'in')
			.map((p) => p.name),
	)
	const validDataOut = new Set(
		ports
			.filter((p) => p.kind === 'data' && p.direction === 'out')
			.map((p) => p.name),
	)
	const validTriggerIn = new Set(
		ports
			.filter((p) => p.kind === 'trigger' && p.direction === 'in')
			.map((p) => p.name),
	)
	const validTriggerOut = new Set(
		ports
			.filter((p) => p.kind === 'trigger' && p.direction === 'out')
			.map((p) => p.name),
	)

	const giId = gi.id
	const goId = go.id

	group.subgraph.dataEdges = group.subgraph.dataEdges.filter((e) => {
		if (e.from.node === giId && !validDataIn.has(e.from.port)) return false
		if (e.to.node === goId && !validDataOut.has(e.to.field)) return false
		return true
	})

	group.subgraph.triggerEdges = group.subgraph.triggerEdges.filter((e) => {
		// trigger edges OUT OF groupInput carry the port name as `from.branch`
		// (the same convention if/switch use for named branches).
		if (e.from.node === giId) {
			const branch = e.from.branch ?? 'main'
			if (!validTriggerIn.has(branch)) return false
		}
		// trigger edges INTO groupOutput carry the target port name on
		// `to.branch`. If the port has been removed from the group's
		// declarations, drop the edge.
		if (e.to.node === goId && e.to.branch !== undefined) {
			if (!validTriggerOut.has(e.to.branch)) return false
		}
		return true
	})
}

function onPortsUpdate(payload: { nodeId: string; ports: GroupPort[] }) {
	const g = currentGraph.value
	if (!g) return
	const idx = g.nodes.findIndex(
		(n) => n.id === payload.nodeId && n.kind === 'group',
	)
	if (idx === -1) return
	const existing = g.nodes[idx]!
	// Template instances don't own a local subgraph — their `ports` come from
	// the template definition and are read-only on the instance. Defensive:
	// silently no-op if someone managed to invoke the editor on one.
	if (existing.templateId) return

	// Detect renames against the PREVIOUS ports array BEFORE we replace it.
	// Pure additions and pure deletions yield no renames; syncSentinels still
	// handles deletions by dropping orphaned inner edges, and the outer graph
	// has no edges for added ports yet, so neither needs port-name rewrites.
	const oldPorts = Array.isArray(existing.ports) ? existing.ports : []
	const renames = detectPortRenames(oldPorts, payload.ports)

	// Build a deep-cloned group node so syncSentinels can mutate its subgraph
	// freely without aliasing into the current graph's state. The outer
	// onUpdateNode/onGraphUpdate path expects a fresh node reference.
	const clonedGroup: GraphNode = {
		...existing,
		ports: payload.ports.map((p) => ({ ...p })),
		subgraph: existing.subgraph
			? (JSON.parse(JSON.stringify(existing.subgraph)) as ProcedureGraph)
			: undefined,
	}

	// Cascade renames into the INNER subgraph before syncSentinels runs — if
	// we waited until after, syncSentinels would treat the old port names
	// still on inner edges as references to deleted ports and drop them.
	if (renames.length > 0 && clonedGroup.subgraph) {
		const gi = clonedGroup.subgraph.nodes.find((n) => n.kind === 'groupInput')
		const go = clonedGroup.subgraph.nodes.find((n) => n.kind === 'groupOutput')
		// Group-level "in" ports surface as groupInput's OUT handles, and
		// group-level "out" ports surface as groupOutput's IN handles. We pass
		// invertDirection=true and target the right sentinel per direction.
		const inRenames = renames.filter((r) => r.direction === 'in')
		const outRenames = renames.filter((r) => r.direction === 'out')
		if (gi && inRenames.length > 0) {
			applyPortRenamesToEdges(
				clonedGroup.subgraph.triggerEdges,
				clonedGroup.subgraph.dataEdges,
				gi.id,
				inRenames,
				true,
			)
		}
		if (go && outRenames.length > 0) {
			applyPortRenamesToEdges(
				clonedGroup.subgraph.triggerEdges,
				clonedGroup.subgraph.dataEdges,
				go.id,
				outRenames,
				true,
			)
		}
	}

	syncSentinels(clonedGroup)

	// Cascade renames into the OUTER graph's edges (where this group node is
	// an endpoint). We do this by walking the current graph, cloning the
	// triggerEdges / dataEdges arrays, applying the renames, then going
	// through onGraphUpdate so history + dirty tracking pick it up. We can't
	// rely on onUpdateNode for outer-edge changes because it only replaces
	// the node, not the edges.
	if (renames.length > 0) {
		const nextOuter: ProcedureGraph = {
			...g,
			nodes: g.nodes.map((n, i) => (i === idx ? clonedGroup : n)),
			triggerEdges: g.triggerEdges.map((e) => ({
				...e,
				from: { ...e.from },
				to: { ...e.to },
			})),
			dataEdges: g.dataEdges.map((e) => ({
				...e,
				from: { ...e.from },
				to: { ...e.to },
			})),
		}
		applyPortRenamesToEdges(
			nextOuter.triggerEdges,
			nextOuter.dataEdges,
			payload.nodeId,
			renames,
			false,
		)
		onGraphUpdate(nextOuter)
		return
	}

	onUpdateNode(clonedGroup)
}

function onUnwireField(payload: { field: string }) {
	const g = currentGraph.value
	if (!g || !selectedNode.value) return
	const nodeId = selectedNode.value.id
	const nextGraph: ProcedureGraph = {
		...g,
		dataEdges: g.dataEdges.filter(
			(e) => !(e.to.node === nodeId && e.to.field === payload.field),
		),
	}
	onGraphUpdate(nextGraph)
}

// Inspector "Delete node" button — same outcome as pressing Delete/Backspace
// on the canvas: drop the node plus every trigger/data edge that touches it.
function onDeleteNode(payload: { id: string }) {
	const g = currentGraph.value
	if (!g || isCurrentGraphReadOnly.value) return
	const id = payload.id
	const nextGraph: ProcedureGraph = {
		...g,
		nodes: g.nodes.filter((n) => n.id !== id),
		triggerEdges: g.triggerEdges.filter(
			(e) => e.from.node !== id && e.to.node !== id,
		),
		dataEdges: g.dataEdges.filter(
			(e) => e.from.node !== id && e.to.node !== id,
		),
	}
	if (selectedNodeId.value === id) selectedNodeId.value = null
	onGraphUpdate(nextGraph)
}

// ---------------------------------------------------------------------------
// Create-group-from-selection
// ---------------------------------------------------------------------------
// Visible when the user has selected one or more eligible nodes in the
// current canvas. "Eligible" rules out kinds that can't legally live inside
// a group's subgraph in v1:
//   • `trigger` — triggers must live at the top level of a procedure.
//   • `groupInput` / `groupOutput` — sentinels are auto-managed and only
//     valid inside their owning group.
// Selection containing multiple groups IS allowed: nesting an existing
// group inside a new one is just a regular subgraph node move; the v1
// validator doesn't forbid it, and the executor's depth cap catches
// runaway recursion.
//
// Also gated on:
//   • An editable graph (not the read-only template-instance view).
//   • A real procedure being open (selected.value).
const canGroupSelection = computed<boolean>(() => {
	if (!selected.value) return false
	if (isCurrentGraphReadOnly.value) return false
	const ids = selectedNodeIds.value
	if (ids.length === 0) return false
	const g = currentGraph.value
	if (!g) return false
	const idSet = new Set(ids)
	for (const n of g.nodes) {
		if (!idSet.has(n.id)) continue
		if (n.kind === 'trigger') return false
		if (n.kind === 'groupInput' || n.kind === 'groupOutput') return false
	}
	return true
})

// Friendly default port names. Each cut edge maps to a desired name based on
// the user-facing label on the cut side; if two edges land on the same name
// (e.g. two inside actions both have an `input` field), we suffix `-2`, `-3`
// per (kind, direction). The user can rename later in the GroupPortEditor.
//
// Port name picks:
//   data-in    → target node's input field name
//   data-out   → source node's output port name
//   trigger-in → source branch label if present, else 'main'
//   trigger-out → source branch label if present, else 'main'
//
// The "main" default for non-branching trigger cuts is intentional: the
// GroupNode / sentinel renderers place a trigger port named "main" on the
// title bar (mirroring ordinary trigger/action nodes), so a typical group
// wrapping linear flow looks just like a single action — title-bar in/out.
// Branch-labeled ports (if.then, switch.<case>, …) render in the body.
function desiredPortNameForTrigger(branch: string | undefined): string {
	return branch && branch.length > 0 ? branch : 'main'
}

// Dedup against an already-declared set scoped to (kind, direction). The set
// is mutated as new names are reserved.
function uniqueName(desired: string, taken: Set<string>): string {
	if (!taken.has(desired)) {
		taken.add(desired)
		return desired
	}
	let i = 2
	while (taken.has(`${desired}-${i}`)) i++
	const final = `${desired}-${i}`
	taken.add(final)
	return final
}

interface NewGroupPlan {
	groupId: string
	groupPorts: GroupPort[]
	// Sentinel node ids — the planner generates them up front so its inner
	// edges reference real ids; the caller installs the sentinel nodes
	// under these ids.
	groupInputId: string
	groupOutputId: string
	// Edges to add to the outer graph (replacements for cut edges).
	outerTriggerEdges: TriggerEdge[]
	outerDataEdges: DataEdge[]
	// Edges to add inside the new subgraph (connecting sentinels to the
	// inner endpoints of the cut edges).
	innerTriggerEdges: TriggerEdge[]
	innerDataEdges: DataEdge[]
}

// Build a JsonSchema property bag from a kind's declared static port
// list — used as the fallback when no type-registry schema applies.
function staticPortsToSchema(
	ports: ReadonlyArray<{ name: string; type?: string }>,
): JsonSchema {
	const properties: Record<string, JsonSchemaProperty> = {}
	for (const p of ports) {
		properties[p.name] = p.type ? { type: p.type } : {}
	}
	return { properties }
}

function findSchemaForDataSourcePort(nodeId: string, port: string): JsonSchema | undefined {
	const g = currentGraph.value
	if (!g) return undefined
	const node = g.nodes.find((n) => n.id === nodeId)
	if (!node) return undefined
	// `group` carries its ports on the node itself, not in the kind registry.
	if (node.kind === 'group') {
		const p = (node.ports ?? []).find(
			(pp) => pp.kind === 'data' && pp.direction === 'out' && pp.name === port,
		)
		return p?.schema as JsonSchema | undefined
	}
	const ui = nodeKinds.value.find((k) => k.kind === node.kind)?.meta.ui
	if (!ui) return undefined
	let outputSchema: JsonSchema | undefined
	if (ui.typeRegistry && ui.dataOutsFromTypeSchema) {
		const key = ui.dataOutsFromTypeSchema
		if (ui.typeRegistry === 'triggers') {
			const t = triggerTypes.value.find((tt) => tt.id === node.typeId) as
				| Record<string, JsonSchema | undefined>
				| undefined
			outputSchema = t?.[key]
		} else if (ui.typeRegistry === 'actions') {
			const a = actionTypes.value.find((aa) => aa.id === node.typeId) as
				| Record<string, JsonSchema | undefined>
				| undefined
			outputSchema = a?.[key]
		} else {
			const d = dataNodeTypes.value.find((dd) => dd.id === node.typeId) as
				| Record<string, JsonSchema | undefined>
				| undefined
			outputSchema = d?.[key]
		}
	}
	if (!outputSchema && ui.staticDataOuts.length > 0) {
		outputSchema = staticPortsToSchema(ui.staticDataOuts)
	}
	const prop = outputSchema?.properties?.[port]
	if (!prop) return undefined
	return prop as JsonSchema
}

function findSchemaForDataTargetField(nodeId: string, field: string): JsonSchema | undefined {
	const g = currentGraph.value
	if (!g) return undefined
	const node = g.nodes.find((n) => n.id === nodeId)
	if (!node) return undefined
	if (node.kind === 'group') {
		const p = (node.ports ?? []).find(
			(pp) => pp.kind === 'data' && pp.direction === 'in' && pp.name === field,
		)
		return p?.schema as JsonSchema | undefined
	}
	const ui = nodeKinds.value.find((k) => k.kind === node.kind)?.meta.ui
	if (!ui) return undefined
	let inputSchema: JsonSchema | undefined
	if (ui.typeRegistry && ui.dataInsFromTypeSchema) {
		const key = ui.dataInsFromTypeSchema
		if (ui.typeRegistry === 'actions') {
			const a = actionTypes.value.find((aa) => aa.id === node.typeId) as
				| Record<string, JsonSchema | undefined>
				| undefined
			inputSchema = a?.[key]
		} else if (ui.typeRegistry === 'dataNodes') {
			const d = dataNodeTypes.value.find((dd) => dd.id === node.typeId) as
				| Record<string, JsonSchema | undefined>
				| undefined
			inputSchema = d?.[key]
		} else {
			const t = triggerTypes.value.find((tt) => tt.id === node.typeId) as
				| Record<string, JsonSchema | undefined>
				| undefined
			inputSchema = t?.[key]
		}
	}
	if (!inputSchema && ui.staticDataIns.length > 0) {
		inputSchema = staticPortsToSchema(ui.staticDataIns)
	}
	const prop = inputSchema?.properties?.[field]
	if (!prop) return undefined
	return prop as JsonSchema
}

function planNewGroup(
	g: ProcedureGraph,
	selection: Set<string>,
	groupId: string,
): NewGroupPlan {
	const ports: GroupPort[] = []
	const outerTriggerEdges: TriggerEdge[] = []
	const outerDataEdges: DataEdge[] = []
	const innerTriggerEdges: TriggerEdge[] = []
	const innerDataEdges: DataEdge[] = []

	// Per (kind, direction) name reservations — keeps dedup scoped so a
	// data-in "input" and a data-out "output" can coexist even if a
	// hypothetical trigger-in shared the same desired label.
	const takenDataIn = new Set<string>()
	const takenDataOut = new Set<string>()
	const takenTriggerIn = new Set<string>()
	const takenTriggerOut = new Set<string>()

	// We need sentinel ids that match the ones syncSentinels will (re)use.
	// Generate them up front so the inner edges below can reference them;
	// then we splat them into the subgraph and let syncSentinels see them
	// already in place.
	const groupInputId = newId()
	const groupOutputId = newId()

	for (const e of g.triggerEdges) {
		const fromIn = selection.has(e.from.node)
		const toIn = selection.has(e.to.node)
		if (fromIn === toIn) continue // both inside or both outside → not cut
		if (fromIn && !toIn) {
			// Cut: source inside, target outside → declare trigger-out port.
			const name = uniqueName(
				desiredPortNameForTrigger(e.from.branch),
				takenTriggerOut,
			)
			ports.push({ kind: 'trigger', direction: 'out', name })
			// Outer: new edge from the OUTER group node's trigger-out handle
			// to the original target node. `from.branch` IS the port name —
			// matches how connect parses `group-trigger-out-<port>`.
			outerTriggerEdges.push({
				id: newId(),
				from: { node: groupId, branch: name },
				to: { node: e.to.node },
			})
			// Inner: original source node fires into groupOutput. Source-side
			// branch is preserved verbatim (for if/switch routing); target
			// port name lives on `to.branch` so the renderer can pick the
			// right `groupOutput-trigger-in-<port>` handle.
			innerTriggerEdges.push({
				id: newId(),
				from: { node: e.from.node, branch: e.from.branch },
				to: { node: groupOutputId, branch: name },
			})
		} else {
			// Cut: source outside, target inside → declare trigger-in port.
			const name = uniqueName(
				desiredPortNameForTrigger(e.from.branch),
				takenTriggerIn,
			)
			ports.push({ kind: 'trigger', direction: 'in', name })
			// Outer: original source node fires into OUTER group node's
			// trigger-in handle. Port name lives on `to.branch` (rendered as
			// `group-trigger-in-<port>` via the renderer).
			outerTriggerEdges.push({
				id: newId(),
				from: { node: e.from.node, branch: e.from.branch },
				to: { node: groupId, branch: name },
			})
			// Inner: groupInput fires into original target. Port name lives
			// on `from.branch` — matches the syncSentinels filter for
			// trigger edges out of groupInput.
			innerTriggerEdges.push({
				id: newId(),
				from: { node: groupInputId, branch: name },
				to: { node: e.to.node },
			})
		}
	}

	for (const e of g.dataEdges) {
		const fromIn = selection.has(e.from.node)
		const toIn = selection.has(e.to.node)
		if (fromIn === toIn) continue
		if (fromIn && !toIn) {
			// Cut: source inside, target outside → declare data-out port.
			const name = uniqueName(e.from.port, takenDataOut)
			ports.push({
				kind: 'data',
				direction: 'out',
				name,
				schema: findSchemaForDataSourcePort(e.from.node, e.from.port),
			})
			// Outer: group node's data-out → original target field.
			outerDataEdges.push({
				id: newId(),
				from: { node: groupId, port: name },
				to: { node: e.to.node, field: e.to.field },
			})
			// Inner: original source → groupOutput's data-in port (name).
			innerDataEdges.push({
				id: newId(),
				from: { node: e.from.node, port: e.from.port },
				to: { node: groupOutputId, field: name },
			})
		} else {
			// Cut: source outside, target inside → declare data-in port.
			const name = uniqueName(e.to.field, takenDataIn)
			ports.push({
				kind: 'data',
				direction: 'in',
				name,
				schema: findSchemaForDataTargetField(e.to.node, e.to.field),
			})
			// Outer: original source → group node's data-in port.
			outerDataEdges.push({
				id: newId(),
				from: { node: e.from.node, port: e.from.port },
				to: { node: groupId, field: name },
			})
			// Inner: groupInput's data-out → original target field.
			innerDataEdges.push({
				id: newId(),
				from: { node: groupInputId, port: name },
				to: { node: e.to.node, field: e.to.field },
			})
		}
	}

	return {
		groupId,
		groupPorts: ports,
		groupInputId,
		groupOutputId,
		outerTriggerEdges,
		outerDataEdges,
		innerTriggerEdges,
		innerDataEdges,
	}
}

function createGroupFromSelection() {
	if (!canGroupSelection.value) return
	const g = currentGraph.value
	if (!g) return
	const ids = selectedNodeIds.value.slice()
	if (ids.length === 0) return

	// The group gets a default name, then the inspector opens on it with its
	// name field focused: renaming is one keystroke away, nothing blocks.
	const inputName = t('dms_automation.editor.groupDefaultName')

	const selection = new Set(ids)
	const groupId = newId()

	const plan = planNewGroup(g, selection, groupId)

	// Position the new group at the centroid of the selection. We also
	// shift the selected nodes' positions into the subgraph's coordinate
	// space: subtract the selection min, then add a left-margin so the
	// groupInput sentinel can sit at x ≈ 0.
	const SUBGRAPH_LEFT_MARGIN = 220 // groupInput sits at x = 0 with room
	const SUBGRAPH_RIGHT_MARGIN = 220
	const selectedNodes = g.nodes.filter((n) => selection.has(n.id))
	const xs = selectedNodes.map((n) => n.position.x)
	const ys = selectedNodes.map((n) => n.position.y)
	const minX = xs.length ? Math.min(...xs) : 0
	const maxX = xs.length ? Math.max(...xs) : 0
	const minY = ys.length ? Math.min(...ys) : 0
	const maxY = ys.length ? Math.max(...ys) : 0
	const centerX = xs.length ? (minX + maxX) / 2 : 200
	const centerY = ys.length ? (minY + maxY) / 2 : 200

	const innerNodes: GraphNode[] = selectedNodes.map((n) => ({
		...JSON.parse(JSON.stringify(n)),
		position: {
			x: n.position.x - minX + SUBGRAPH_LEFT_MARGIN,
			y: n.position.y - minY,
		},
	}))

	const innerHeight = Math.max(maxY - minY, 0)
	const innerWidth = Math.max(maxX - minX, 0)

	const groupInputNode: GraphNode = {
		id: plan.groupInputId,
		kind: 'groupInput',
		config: {},
		position: { x: 0, y: innerHeight / 2 },
	}
	const groupOutputNode: GraphNode = {
		id: plan.groupOutputId,
		kind: 'groupOutput',
		config: {},
		position: {
			x: innerWidth + SUBGRAPH_LEFT_MARGIN + SUBGRAPH_RIGHT_MARGIN,
			y: innerHeight / 2,
		},
	}

	// Inner edges fully inside the selection — keep them verbatim (re-id
	// not required since we keep node ids stable; ids only need to be
	// unique within their containing graph and these are all from the
	// outer graph we just stripped them from).
	const innerOriginalTriggerEdges = g.triggerEdges.filter(
		(e) => selection.has(e.from.node) && selection.has(e.to.node),
	)
	const innerOriginalDataEdges = g.dataEdges.filter(
		(e) => selection.has(e.from.node) && selection.has(e.to.node),
	)

	const newGroupNode: GraphNode = {
		id: groupId,
		kind: 'group',
		config: { name: inputName },
		position: { x: centerX, y: centerY },
		ports: plan.groupPorts,
		subgraph: {
			nodes: [...innerNodes, groupInputNode, groupOutputNode],
			triggerEdges: [...innerOriginalTriggerEdges, ...plan.innerTriggerEdges],
			dataEdges: [...innerOriginalDataEdges, ...plan.innerDataEdges],
		},
	}

	// Build the new outer graph: drop the selected nodes + every edge that
	// touches them (cut OR fully-inside), then add the new group + the
	// replacement outer edges.
	const remainingOuterNodes = g.nodes.filter((n) => !selection.has(n.id))
	const remainingOuterTriggerEdges = g.triggerEdges.filter(
		(e) => !selection.has(e.from.node) && !selection.has(e.to.node),
	)
	const remainingOuterDataEdges = g.dataEdges.filter(
		(e) => !selection.has(e.from.node) && !selection.has(e.to.node),
	)

	const nextGraph: ProcedureGraph = {
		nodes: [...remainingOuterNodes, newGroupNode],
		triggerEdges: [...remainingOuterTriggerEdges, ...plan.outerTriggerEdges],
		dataEdges: [...remainingOuterDataEdges, ...plan.outerDataEdges],
	}

	// Clear stale selection — the original ids no longer exist in the
	// outer graph. Select the newly-created group.
	selectedNodeIds.value = []
	selectedNodeId.value = groupId

	onGraphUpdate(nextGraph)
	void focusInspectorName()
}

const inspectorRef = ref<HTMLElement | null>(null)

/** Focuses the inspector's first field, the step name, and selects its text. */
async function focusInspectorName() {
	await nextTick()
	const input = inspectorRef.value?.querySelector('input')
	input?.focus()
	input?.select()
}

const procedureName = computed<string>({
	get: () => selected.value?.name ?? '',
	set: (v: string) => {
		if (selected.value) selected.value.name = v
	},
})

// Titles and toasts about what is stored name it as stored, not as the
// draft spells it (possibly blank) at that moment.
const savedName = computed<string>(() => savedSnapshot.value?.name || selected.value?.name || '')

// The name is the one field outside the graph a save checks: a blank one is
// said under the name, and Save waits for it.
const NAME_INPUT_ID = 'builder-procedure-name'
const nameMissing = computed<boolean>(() => !!selected.value && !selected.value.name.trim())

const procedureEnabled = computed<boolean>({
	get: () => selected.value?.enabled ?? false,
	set: (v: boolean) => {
		if (selected.value) selected.value.enabled = v
	},
})

// ---------------------------------------------------------------------------
// The builder's bar: state, saving, problems (AU-03, AU-04, AU-16)
// ---------------------------------------------------------------------------

// Each procedure's state, for the bar's badge and the switcher (procedure
// mode only).
const summariesRead = useApiData<ProcedureSummaryRow[]>(() =>
	editorMode.value === 'procedure' ? `${props.apiUrl}/procedures/summary` : null,
)
const summaries = computed(() => summariesRead.data.value ?? [])

const currentSummary = computed(() => summaries.value.find((s) => s.procedureId === selectedId.value) ?? null)

const STATE_TONES = {
	failing: 'error',
	degraded: 'warning',
	healthy: 'success',
	paused: 'neutral',
	draft: 'info',
} as const

/** How many things changed since the last save, for "2 unsaved changes". */
const changeCount = computed<number>(() => {
	const current = selected.value
	const saved = savedSnapshot.value
	if (!current || !saved) return 0
	let count = 0
	if (current.name !== saved.name) count++
	if (current.enabled !== saved.enabled) count++
	if (saved.ports && JSON.stringify(saved.ports) !== JSON.stringify(templatePorts.value)) count++
	const before = new Map(saved.graph.nodes.map((n) => [n.id, JSON.stringify(n)]))
	const after = new Map(current.graph.nodes.map((n) => [n.id, JSON.stringify(n)]))
	for (const [id, value] of after) if (before.get(id) !== value) count++
	for (const id of before.keys()) if (!after.has(id)) count++
	const edges = (g: ProcedureGraph) => JSON.stringify([g.triggerEdges, g.dataEdges])
	if (edges(current.graph) !== edges(saved.graph)) count++
	return count
})

// Problems of the draft, asked of the server (the same validator a save
// runs) a moment after each change.
// Each issue carries a `code` (and its `params`) the locale words; its English
// `message` is the fallback for a code the locale does not know.
interface GraphIssue {
	severity: 'error' | 'warning'
	message: string
	code?: string
	params?: Record<string, unknown>
	nodeId?: string
}
const issues = ref<GraphIssue[]>([])
// The draft's triggers, worded by the server with its problems: the canvas
// and the test dock name them.
const draftTriggers = ref<WordedTrigger[]>([])
let validateTimer: ReturnType<typeof setTimeout> | undefined
const VALIDATE_DELAY_MS = 500

async function validateDraft() {
	const current = selected.value
	if (!current || editorMode.value !== 'procedure') {
		issues.value = []
		draftTriggers.value = []
		return
	}
	try {
		const res = await $authFetch<{ issues: typeof issues.value; triggers?: WordedTrigger[] }>(`${props.apiUrl}/procedures/validate`, {
			method: 'POST',
			// With the procedure and its name, the server also checks what other
			// procedures hold (a webhook path, a name).
			body: { graph: current.graph, enabled: current.enabled, procedureId: current._id, name: current.name },
		})
		issues.value = res.issues ?? []
		draftTriggers.value = res.triggers ?? []
	} catch {
		// A graph the schema refuses is reported on save.
	}
}

function scheduleValidation() {
	clearTimeout(validateTimer)
	validateTimer = setTimeout(() => void validateDraft(), VALIDATE_DELAY_MS)
}
watch(
	() => (selected.value ? [structuralKey(selected.value.graph), selected.value.name, selected.value.enabled].join('|') : ''),
	scheduleValidation,
)
// The draft as opened is checked in the browser: a server render has no
// draft to check, and its timer would outlive the render.
onMounted(scheduleValidation)
onBeforeUnmount(() => clearTimeout(validateTimer))

const blockingIssues = computed(() => issues.value.filter((i) => i.severity === 'error'))

/** How the builder names a node: its label, else its type's name. */
function nodeDisplayName(id: string): string {
	const node = walkAll(selected.value?.graph).find((n) => n.id === id)
	if (!node) return id
	if (node.kind === 'group') return groupName(node)
	if (node.label) return node.label
	const typeName =
		node.kind === 'trigger'
			? triggerTypes.value.find((x) => x.id === node.typeId)?.name
			: node.kind === 'action'
				? actionTypes.value.find((x) => x.id === node.typeId)?.name
				: node.kind === 'data'
					? dataNodeTypes.value.find((x) => x.id === node.typeId)?.name
					: nodeKinds.value.find((k) => k.kind === node.kind)?.meta.ui?.label
	return typeName ? processI18n(typeName) : (node.config?.name as string | undefined) ?? node.kind
}

function walkAll(graph: ProcedureGraph | undefined): GraphNode[] {
	if (!graph) return []
	return graph.nodes.flatMap((n) => [n, ...walkAll(n.subgraph)])
}

/** An issue in the user's language. */
function issueText(issue: GraphIssue): string {
	const key = `dms_automation.editor.problems.codes.${issue.code}`
	return issue.code && te(key) ? t(key, issue.params ?? {}) : issue.message
}

const dockIssues = computed<DockIssue[]>(() =>
	issues.value.map((issue) => ({
		...issue,
		message: issueText(issue),
		nodeName: issue.nodeId ? nodeDisplayName(issue.nodeId) : undefined,
	})),
)

// Code and params travel along: the inspector names a setting as its form does.
const issuesByNode = computed<Record<string, Omit<GraphIssue, 'nodeId'>>>(() => {
	const out: Record<string, Omit<GraphIssue, 'nodeId'>> = {}
	for (const issue of issues.value) {
		if (!issue.nodeId) continue
		if (!out[issue.nodeId] || issue.severity === 'error')
			out[issue.nodeId] = { severity: issue.severity, message: issueText(issue), code: issue.code, params: issue.params }
	}
	return out
})

const dockTab = ref<DockTab>('problems')
// The dock stays out of the canvas's way until it has something to say: it
// opens on its own for a problem that blocks enabling (a warning only counts
// on its tab), and closes again once that is fixed, unless the user has
// taken it over in between.
const dockCollapsed = ref(true)
let dockOpenedForProblems = false
watch(
	() => blockingIssues.value.length,
	(count, before) => {
		if (count > 0 && !before) {
			dockTab.value = 'problems'
			dockCollapsed.value = false
			dockOpenedForProblems = true
		} else if (count === 0 && dockOpenedForProblems && dockTab.value === 'problems') {
			dockCollapsed.value = true
		}
	},
)
watch([dockTab, dockCollapsed], () => {
	if (dockCollapsed.value || dockTab.value !== 'problems') dockOpenedForProblems = false
})

function selectNode(id: string) {
	// A node inside a group is named by its top-level group in the issues.
	subgraphPath.value = subgraphPath.value.slice(0, 1)
	selectedNodeId.value = id
}

interface ProcedureTriggers {
	triggers: Array<WordedTrigger & { nextAt: string | null }>
}

/**
 * A URL of the procedure open, for the reads that follow it: none in
 * template mode or while no procedure is open.
 */
function selectedProcedureUrl(path: string): () => string | null {
	return () => (selectedId.value && editorMode.value === 'procedure' ? `${props.apiUrl}/procedures/${selectedId.value}/${path}` : null)
}

/**
 * Data of the procedure open, or nothing while another one's is still on
 * screen or once its read failed.
 */
function ofSelected<T>(read: { data: Ref<T | null>; placeholder: Readonly<Ref<boolean>>; error: Ref<unknown> }): T | null {
	return read.placeholder.value || read.error.value ? null : read.data.value
}

// The saved triggers: what a paused procedure will not fire, and what Run
// now offers.
const savedTriggersRead = useApiData<ProcedureTriggers>(selectedProcedureUrl('triggers'))
const savedTriggers = computed(() => ofSelected(savedTriggersRead)?.triggers ?? [])

/** The banner of a disabled procedure names what will not fire (AU-16). */
const pausedBanner = computed(() => {
	const current = selected.value
	if (!current || current.enabled || editorMode.value !== 'procedure') return null
	const triggers = savedTriggers.value.filter((tr) => tr.typeId !== 'manual')
	if (triggers.length === 0) return null
	const first = triggers[0]!
	const what = processText(first.text)
	const isDraft = currentSummary.value?.status === 'draft'
	return {
		title: t(isDraft ? 'dms_automation.editor.paused.draftTitle' : 'dms_automation.editor.paused.title', { name: savedName.value }),
		description: first.nextAt
			? t('dms_automation.editor.paused.schedule', {
					what,
					next: describeDateTime(first.nextAt, dateTimeFormat, first.timeZone),
				})
			: t('dms_automation.editor.paused.other', { what }),
	}
})

async function enableNow() {
	if (!selected.value) return
	selected.value.enabled = true
	await onSave()
}

const saveState = computed(() => {
	if (saving.value) return t('dms_automation.editor.saving')
	if (changeCount.value > 0) return t('dms_automation.editor.unsaved', { count: changeCount.value })
	return t('dms_automation.editor.saved')
})

// ---------------------------------------------------------------------------
// Create, delete, export
// ---------------------------------------------------------------------------

async function onCreated(id: string) {
	await Promise.all([loadList(), summariesRead.refresh()])
	selectedId.value = id
	void router.replace(`${builderPath()}?selected=${id}`)
}

async function onCreate() {
	if (!(await confirmDiscard())) return
	newProcedureOpen.value = true
}

async function onDelete() {
	const current = selected.value
	if (!current) return
	const name = savedName.value
	// The server words the dialog, as the procedures table's delete does.
	await confirmFrom(`${props.apiUrl}/procedures/{id}/delete-confirm`, {
		params: { id: current._id },
		onConfirm: async () => {
			await $authFetch(`${props.apiUrl}/procedures/${current._id}`, { method: 'DELETE' })
			procedures.value = procedures.value.filter((p) => p._id !== current._id)
			selectedId.value = procedures.value[0]?._id ?? null
			void router.replace(selectedId.value ? `${builderPath()}?selected=${selectedId.value}` : builderPath())
			toast.add({ title: t('dms_automation.editor.deleted', { name }), color: 'success', icon: 'i-ph-check-circle' })
			void summariesRead.refresh()
		},
	})
}

async function onExport() {
	const current = selected.value
	if (!current) return
	const data = await $authFetch<unknown>(`${props.apiUrl}/procedures/${current._id}/export`)
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = `${current.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'procedure'}.json`
	link.click()
	URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Questions with more than a yes and a no: switching procedure with unsaved
// changes (AU-04), running the saved version, a save refused for a newer one
// ---------------------------------------------------------------------------

interface Choice<C extends string> {
	value: C
	label: string
	color?: 'primary' | 'neutral' | 'error' | 'warning'
	variant?: 'solid' | 'outline' | 'ghost' | 'soft'
}

interface ChoiceQuestion<C extends string> {
	title: string
	description: string
	choices: Choice<C>[]
	/** The answer of a dialog closed without choosing (Escape, ✕, a click outside). */
	dismiss: C
}

const choiceDialog = ref<ChoiceQuestion<string> & { open: boolean; resolve?: (choice: string) => void }>({
	open: false,
	title: '',
	description: '',
	choices: [],
	dismiss: '',
})

function askChoice<C extends string>(question: ChoiceQuestion<C>): Promise<C> {
	return new Promise((resolve) => {
		choiceDialog.value = { ...question, open: true, resolve: resolve as (choice: string) => void }
	})
}

/** The dialog opens on its safe answer: Enter keeps the draft, runs nothing. */
function focusSafeChoice(event: Event) {
	event.preventDefault()
	void nextTick(() => document.querySelector<HTMLElement>('[data-safe-choice]')?.focus())
}

/** Escape, ✕ or a click outside answers the question's `dismiss`. */
function onChoiceDialogOpen(open: boolean) {
	if (!open && choiceDialog.value.open) answerChoice(choiceDialog.value.dismiss)
}

function answerChoice(choice: string) {
	const resolve = choiceDialog.value.resolve
	choiceDialog.value = { ...choiceDialog.value, open: false, resolve: undefined }
	resolve?.(choice)
}

/** Resolves `true` when the draft may be left: saved, discarded or clean. */
async function confirmDiscard(): Promise<boolean> {
	if (!isDirty.value) return true
	const choice = await askChoice({
		title: t('dms_automation.editor.leave.title', { name: savedName.value }),
		description: t('dms_automation.editor.leave.description', { count: changeCount.value }),
		choices: [
			{ value: 'discard', label: t('dms_automation.editor.discard'), color: 'error', variant: 'ghost' },
			{ value: 'stay', label: t('dms_automation.editor.leave.keep'), color: 'neutral', variant: 'outline' },
			{ value: 'save', label: t('dms_automation.editor.leave.save'), color: 'primary' },
		],
		dismiss: 'stay',
	})
	if (choice === 'stay') return false
	if (choice === 'save') return await onSave()
	onCancel()
	return true
}

async function onPickProcedure(id: string) {
	if (!(await confirmDiscard())) return
	selectedId.value = id
	void router.replace(`${builderPath()}?selected=${id}`)
}

// The template editor guards its draft like the procedure editor.
watch(isDirty, (dirty) => (unsavedDraft.value = dirty), { immediate: true })

// The DMS leave guard only holds a visit to another path. A visit to the
// builder itself that remounts it (the sidebar's "Builder", a link with
// another ?selected=), or that keeps it mounted but opens another procedure,
// loses the draft just the same: it is held here and run again once the
// draft is saved or discarded. The builder's own URL updates go through.
interface PendingVisit {
	url?: URL
	method?: string
	prefetch?: boolean
	preserveState?: unknown
	replace?: boolean
}

function onInertiaBefore(event: Event) {
	const visit = (event as CustomEvent<{ visit?: PendingVisit }>).detail?.visit
	if (!visit?.url || visit.prefetch) return
	if (visit.method && visit.method.toLowerCase() !== 'get') return
	if (visit.url.pathname !== builderPath() || !isDirty.value) return
	const keepsPage = visit.preserveState === true
	if (keepsPage && !opensAnotherProcedure(visit.url.searchParams.get('selected'))) return
	event.preventDefault()
	const href = `${visit.url.pathname}${visit.url.search}${visit.url.hash}`
	void confirmDiscard().then((leave) => {
		if (leave) void navigateDms(href, { preserveState: keepsPage, replace: visit.replace })
	})
}

function opensAnotherProcedure(id: string | null): id is string {
	return editorMode.value === 'procedure' && !!id && id !== selectedId.value
}

// Back and Forward between two addresses of the builder: the DMS guard lets
// them through (same path). Where the browser announces them before they
// happen (Navigation API), the draft is asked about first and the step is
// taken again once it is saved or discarded. A browser without it remounts
// the page on the step: the DMS guard has the same gap.
interface TraverseEvent extends Event {
	navigationType?: string
	destination?: { url: string; key: string; sameDocument: boolean }
}

interface NavigationLike extends EventTarget {
	traverseTo: (key: string) => unknown
}

function browserNavigation(): NavigationLike | undefined {
	return typeof window === 'undefined' ? undefined : (window as unknown as { navigation?: NavigationLike }).navigation
}

// Set while the history step the user chose to take is taken again.
let traverseAllowed = false

function onNavigate(event: Event) {
	const { navigationType, destination } = event as TraverseEvent
	if (navigationType !== 'traverse' || !destination) return
	if (traverseAllowed) {
		traverseAllowed = false
		return
	}
	if (!destination.sameDocument || !event.cancelable || !isDirty.value) return
	if (new URL(destination.url).pathname !== builderPath()) return
	event.preventDefault()
	void confirmDiscard().then((leave) => {
		if (!leave) return
		traverseAllowed = true
		void browserNavigation()?.traverseTo(destination.key)
	})
}

// ?selected= changed while the page stayed mounted (a visit that keeps it,
// such as a link to the builder from the builder): the builder opens that
// procedure. A draft is asked about first; keeping it puts the address back.
watch(
	() => queryValue('selected'),
	async (id) => {
		if (!opensAnotherProcedure(id)) return
		if (!(await confirmDiscard())) {
			void router.replace(`${builderPath()}?selected=${selectedId.value}`)
			return
		}
		if (procedures.value.some((p) => p._id === id)) {
			selectedId.value = id
			return
		}
		missingProcedureId.value = id
		selectedId.value = null
		switcherOpen.value = true
	},
)

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

interface SaveRefusal {
	data?: {
		issues?: Array<
			| { severity?: string; message?: string; code?: string; params?: Record<string, unknown>; nodeId?: string; path?: unknown[] }
			| string
		>
	}
}

function issuesOf(error: unknown): GraphIssue[] | null {
	const raw = (error as SaveRefusal)?.data?.issues
	if (!Array.isArray(raw)) return null
	// A field of the body other than the graph (zod issues carry its path) is
	// not a problem of the graph.
	if (raw.some((issue) => typeof issue === 'object' && Array.isArray(issue.path) && issue.path[0] !== 'graph')) return null
	return raw.map((issue) =>
		typeof issue === 'string'
			? { severity: 'error' as const, message: issue }
			: {
					severity: issue.severity === 'warning' ? 'warning' : 'error',
					message: issue.message ?? '',
					code: issue.code,
					params: issue.params,
					nodeId: issue.nodeId,
				},
	)
}

/** Save the open procedure (or template). Resolves whether it was saved. */
async function onSave(): Promise<boolean> {
	if (!selected.value) return false
	if (nameMissing.value) {
		document.getElementById(NAME_INPUT_ID)?.focus()
		return false
	}
	saving.value = true
	const current = selected.value
	// What is sent is what counts as saved: a change made while the request
	// runs stays an unsaved change.
	const sent = takeSnapshot(current)
	try {
		if (editorMode.value === 'template') {
			await $authFetch(`${props.apiUrl}/templates/${current._id}`, {
				method: 'PUT',
				body: {
					name: sent.name,
					description: current.description,
					icon: templateIcon.value,
					ports: sent.ports ?? [],
					subgraph: sent.graph,
				},
			})
			savedSnapshot.value = sent
			toast.add({ title: t('dms_automation.templates.saved', { name: sent.name }), color: 'success', icon: 'i-ph-check-circle' })
			return true
		}
		const res = await $authFetch<{ version: number; revision: number; issues?: GraphIssue[] }>(`${props.apiUrl}/procedures/${current._id}`, {
			method: 'PUT',
			body: {
				name: sent.name,
				description: current.description,
				enabled: sent.enabled,
				graph: sent.graph,
				expectedRevision: current.revision,
			},
		})
		current.version = res.version
		current.revision = res.revision
		savedSnapshot.value = sent
		if (res.issues) issues.value = res.issues
		toast.add({
			title: t('dms_automation.editor.savedToast', { name: sent.name }),
			description: res.issues?.length ? t('dms_automation.editor.savedWithProblems', { count: res.issues.length }) : undefined,
			color: 'success',
			icon: 'i-ph-check-circle',
			actions: [{ label: t('dms_automation.editor.testRun'), onClick: () => void onTestRun() }],
		})
		void summariesRead.refresh()
		void savedTriggersRead.refresh()
		return true
	} catch (e) {
		if (editorMode.value === 'procedure' && apiErrorStatus(e) === 409) return await resolveStale(current, e)
		const refused = issuesOf(e)
		if (refused) {
			issues.value = refused
			saveBlocked.value = true
			dockTab.value = 'problems'
			dockCollapsed.value = false
		} else {
			toast.add({
				title: editorMode.value === 'template' ? t('dms_automation.templates.saveError') : t('dms_automation.editor.saveError'),
				description: describeApiError(e),
				color: 'error',
				icon: 'i-ph-warning',
			})
		}
		return false
	} finally {
		saving.value = false
	}
}

/**
 * The procedure was saved elsewhere (another tab, a pause from the list)
 * since this draft was loaded, and the server refused to overwrite it:
 * reload what is saved now, or overwrite it with the draft.
 */
async function resolveStale(current: ProcedureRecord, error: unknown): Promise<boolean> {
	saving.value = false
	let latest = (error as { data: { revision: number } }).data.revision
	const choice = await askChoice({
		title: t('dms_automation.editor.stale.title', { name: savedName.value }),
		description: t('dms_automation.editor.stale.description'),
		choices: [
			{ value: 'stay', label: t('dms_automation.editor.stale.keep'), color: 'neutral', variant: 'ghost' },
			{ value: 'reload', label: t('dms_automation.editor.stale.reload'), color: 'neutral', variant: 'outline' },
			{ value: 'overwrite', label: t('dms_automation.editor.stale.overwrite'), color: 'warning' },
		],
		dismiss: 'stay',
	})
	if (choice === 'overwrite') {
		// Overwriting puts the draft's edits over what was saved elsewhere, not
		// its on/off state over a pause or a resume made elsewhere: unless the
		// switch was flipped in this draft, the procedure stays as it is now.
		if (current.enabled === savedSnapshot.value?.enabled) {
			try {
				const saved = await $authFetch<{ enabled: boolean; revision: number }>(`${props.apiUrl}/procedures/${current._id}`)
				current.enabled = saved.enabled
				latest = saved.revision
			} catch {
				// Unreadable: the draft's state is saved, as before.
			}
		}
		current.revision = latest
		return await onSave()
	}
	if (choice === 'reload') await reloadSelected()
	return false
}

/** Replaces the draft with the procedure as it is saved now. */
async function reloadSelected() {
	const current = selected.value
	if (!current) return
	try {
		const fresh = await $authFetch<ProcedureRecord>(`${props.apiUrl}/procedures/${current._id}`)
		procedures.value = procedures.value.map((p) => (p._id === fresh._id ? fresh : p))
		selectedNodeId.value = null
		initHistoryAndSaved()
		seedSubgraphPath()
		saveBlocked.value = false
		void summariesRead.refresh()
		void savedTriggersRead.refresh()
	} catch (e) {
		toast.add({ title: t('dms_automation.editor.loadProceduresError'), description: describeApiError(e), color: 'error', icon: 'i-ph-warning' })
	}
}

/** Set when a save was refused for problems: the banner offers the way out. */
const saveBlocked = ref(false)
watch(blockingIssues, (list) => {
	if (list.length === 0) saveBlocked.value = false
})

async function saveAsDraft() {
	if (!selected.value) return
	selected.value.enabled = false
	if (await onSave()) saveBlocked.value = false
}

function goToFirstProblem() {
	const first = blockingIssues.value.find((i) => i.nodeId) ?? issues.value.find((i) => i.nodeId)
	if (first?.nodeId) selectNode(first.nodeId)
}


// ---------------------------------------------------------------------------
// Save-as-template
// ---------------------------------------------------------------------------
// Visible when the user has selected a single local group (kind === 'group',
// no templateId). On submit:
//   1. POST /api/automation/templates with { name, description, icon, ports,
//      subgraph } from the local group.
//   2. On success: mutate the in-graph node — set templateId = res._id, drop
//      subgraph. The save flow (onGraphUpdate → onSave by user) propagates.
//   3. On failure (Zod or template cycle): render the error body inline in
//      the modal; the graph is NOT touched.
const selectedLocalGroupNode = computed<GraphNode | null>(() => {
	const n = selectedNode.value
	if (!n || n.kind !== 'group') return null
	if (n.templateId) return null
	return n
})

const canSaveAsTemplate = computed<boolean>(() => {
	if (!selected.value) return false
	if (isCurrentGraphReadOnly.value) return false
	return selectedLocalGroupNode.value !== null
})

const saveAsTemplateOpen = ref<boolean>(false)
const saveAsTemplateName = ref<string>('')
const saveAsTemplateDescription = ref<string>('')
const saveAsTemplateIcon = ref<string>('i-ph-package')
const saveAsTemplateSubmitting = ref<boolean>(false)
const saveAsTemplateError = ref<string | null>(null)
const TEMPLATE_NAME_ID = 'save-template-name'
const TEMPLATE_ROW = { layout: 'form', spacing: 'list', inset: false } as const
// A missing name shows under its field; what the server refuses (issues, a
// reference cycle) stays in the banner above the buttons.
const templateFieldErrors = useFieldErrors({ fields: { name: TEMPLATE_NAME_ID } })
watch(saveAsTemplateName, () => templateFieldErrors.clear('name'))

function openSaveAsTemplate() {
	const n = selectedLocalGroupNode.value
	if (!n) return
	saveAsTemplateName.value = groupName(n)
	saveAsTemplateDescription.value = ''
	saveAsTemplateIcon.value = 'i-ph-package'
	saveAsTemplateError.value = null
	templateFieldErrors.clear()
	saveAsTemplateSubmitting.value = false
	saveAsTemplateOpen.value = true
}

// Render the 400 body from src/routes/templates.ts:
//   - Zod failure → { error: 'invalid body', issues: ZodIssue[] }
//   - validateGraph failure → { error: 'invalid graph', issues: string[] }
//   - cycle → { error: 'template reference cycle', cycle: string[] }
// Other errors (network, 401, 500) fall back to the message string.
function formatTemplateError(err: unknown): string {
	const data = (err as { data?: unknown; message?: string } | undefined)?.data as
		| {
				error?: string
				issues?: Array<{ path?: Array<string | number>; message?: string } | string>
				cycle?: string[]
		  }
		| undefined
	if (data && typeof data === 'object') {
		const head = data.error ?? 'Request failed'
		if (Array.isArray(data.issues) && data.issues.length > 0) {
			const lines = data.issues.map((iss) => {
				if (typeof iss === 'string') return iss
				const path = Array.isArray(iss.path) ? iss.path.join('.') : ''
				const msg = iss.message ?? 'invalid'
				return path ? `${path}: ${msg}` : msg
			})
			return `${head}\n${lines.join('\n')}`
		}
		if (Array.isArray(data.cycle) && data.cycle.length > 0) {
			return `${head}: ${data.cycle.join(' → ')}`
		}
		return head
	}
	return describeApiError(err)
}

function convertLocalGroupToTemplateInstance(
	nodeId: string,
	templateId: string,
): void {
	const g = currentGraph.value
	if (!g) return
	const existing = g.nodes.find((n) => n.id === nodeId && n.kind === 'group')
	if (!existing) return
	const updated: GraphNode = { ...existing, templateId }
	delete updated.subgraph
	onUpdateNode(updated)
}

async function submitSaveAsTemplate() {
	const n = selectedLocalGroupNode.value
	if (!n) return
	const name = saveAsTemplateName.value.trim()
	if (!name) {
		await templateFieldErrors.setError('name', t('dms_automation.editor.saveTemplateModal.nameRequired'))
		return
	}
	if (!n.subgraph) {
		saveAsTemplateError.value = t('dms_automation.editor.saveTemplateModal.noSubgraph')
		return
	}
	saveAsTemplateSubmitting.value = true
	saveAsTemplateError.value = null
	try {
		const body = {
			name,
			description: saveAsTemplateDescription.value.trim(),
			icon: saveAsTemplateIcon.value.trim() || 'i-ph-package',
			ports: Array.isArray(n.ports) ? n.ports : [],
			subgraph: n.subgraph,
		}
		const created = await $authFetch<{ _id: string }>(
			'/api/automation/templates',
			{ method: 'POST', body },
		)
		// The template exists now: the procedure links to it once saved. A
		// draft with nothing else unsaved is saved at once; one with other
		// changes is left to the user, who is told.
		const linkOnly = !isDirty.value
		convertLocalGroupToTemplateInstance(n.id, created._id)
		saveAsTemplateOpen.value = false
		void templatesRead.refresh()
		toast.add({
			title: t('dms_automation.templates.saved', { name }),
			description: linkOnly ? undefined : t('dms_automation.editor.saveTemplateModal.saveToLink'),
			color: 'success',
			icon: 'i-ph-check-circle',
		})
		if (linkOnly) await onSave()
	} catch (e) {
		saveAsTemplateError.value = formatTemplateError(e)
	} finally {
		saveAsTemplateSubmitting.value = false
	}
}

// ---------------------------------------------------------------------------
// Fork-to-local-group
// ---------------------------------------------------------------------------
// Visible when a template-instance group node is selected — i.e. kind === 'group'
// AND templateId is set. The fork is the escape hatch from the live-link
// model: it converts the instance back to a local group by deep-cloning the
// template's current subgraph into the node and dropping templateId.
//
// Selection rules:
//   • Allowed even from the read-only inner-subgraph view of a template
//     instance — this is the "Fork to edit" CTA flow. The action mutates
//     the OUTER graph (the procedure root or whichever container holds
//     the template instance), not the inner subgraph being viewed.
//   • To make that work, the selection target for the fork is the deepest
//     currentParentGroup when we're inside a template-instance subgraph,
//     OR the selectedNode otherwise.
//
// The deep-clone uses a JSON parse/stringify round-trip: structuredClone
// throws on Vue's reactive proxies (see the inline note at the clone site).
//
// Edge case: if the template was deleted between selection and confirm,
// GET /:id returns 404 → we surface that as an error in the modal so the
// user can dismiss and stop trying.
interface ForkTarget {
	// The group node to convert (the template instance).
	node: GraphNode
	// The graph in which that node lives. May be the procedure root or any
	// outer subgraph (when the user is viewing the inner read-only graph of
	// an instance, the instance node lives one frame up).
	containerGraph: ProcedureGraph
}

const forkTarget = computed<ForkTarget | null>(() => {
	if (!selected.value) return null
	const frames = subgraphFrames.value
	// Case A: user is INSIDE a template-instance subgraph (read-only view).
	// The instance node is the parent group; its container is the previous
	// frame's graph.
	if (isCurrentGraphReadOnly.value && frames.length >= 2) {
		const parent = frames[frames.length - 1]!.groupNode
		const container = frames[frames.length - 2]!.graph
		if (parent && parent.kind === 'group' && parent.templateId) {
			return { node: parent, containerGraph: container }
		}
	}
	// Case B: user has a template-instance node selected in the current
	// (editable) graph.
	const sel = selectedNode.value
	const g = currentGraph.value
	if (sel && g && sel.kind === 'group' && sel.templateId) {
		return { node: sel, containerGraph: g }
	}
	return null
})

const canForkToLocal = computed<boolean>(() => forkTarget.value !== null)

const forkOpen = ref<boolean>(false)
const forkSubmitting = ref<boolean>(false)
const forkError = ref<string | null>(null)

function openFork() {
	if (!canForkToLocal.value) return
	forkError.value = null
	forkSubmitting.value = false
	forkOpen.value = true
}

interface FetchedTemplate {
	_id: string
	name: string
	description: string
	icon: string
	ports: GroupPort[]
	subgraph: ProcedureGraph
}

// Replace the template instance node with a forked local copy. Mirrors the
// shape of convertLocalGroupToTemplateInstance but in reverse: drops
// templateId, installs subgraph from the fetched template, and writes back
// through onUpdateNode / onGraphUpdate (so history + dirty-snapshot stay
// consistent). The replacement uses a fresh node object so Vue reactivity
// sees a real change.
function convertTemplateInstanceToLocal(
	target: ForkTarget,
	template: FetchedTemplate,
): void {
	const { node, containerGraph } = target
	const idx = containerGraph.nodes.findIndex(
		(n) => n.id === node.id && n.kind === 'group',
	)
	if (idx === -1) return
	const updated: GraphNode = {
		...node,
		// Deep-clone the template's subgraph so subsequent edits to the
		// template (or to this fork) don't alias each other. JSON round-trip
		// strips Vue's reactive proxy — structuredClone throws on proxies.
		subgraph: JSON.parse(JSON.stringify(template.subgraph)) as ProcedureGraph,
		// Preserve the local ports if the instance carries them (it should
		// — palette drops clone template.ports onto the instance); fall back
		// to the template's port list otherwise.
		ports: Array.isArray(node.ports) && node.ports.length > 0
			? node.ports.map((p) => ({ ...p }))
			: template.ports.map((p) => ({ ...p })),
	}
	delete updated.templateId

	// If the user was inside the template instance's subgraph (Case A in
	// forkTarget), pop the read-only path segment first so the canvas
	// re-binds to the (now editable) outer graph. The user can re-enter
	// the local subgraph fresh via dblclick if they want.
	if (isCurrentGraphReadOnly.value && subgraphPath.value.length > 1) {
		subgraphPath.value = subgraphPath.value.slice(0, -1)
		selectedNodeId.value = updated.id
	}

	// Use onUpdateNode — it walks subgraphPath and rewrites the correct
	// container graph (root or any depth). Because we just popped above
	// when needed, currentGraph now points at containerGraph.
	onUpdateNode(updated)
}

function formatForkError(err: unknown): string {
	const status = (err as { statusCode?: number; status?: number } | undefined)
	const code = status?.statusCode ?? status?.status
	if (code === 404) {
		return 'This template no longer exists. It may have been deleted by another user.'
	}
	const data = (err as { data?: { error?: string } } | undefined)?.data
	if (data?.error) return data.error
	return describeApiError(err)
}

async function submitFork() {
	const target = forkTarget.value
	if (!target) return
	const templateId = target.node.templateId
	if (!templateId) return
	forkSubmitting.value = true
	forkError.value = null
	try {
		const tpl = await $authFetch<FetchedTemplate>(
			`/api/automation/templates/${templateId}`,
		)
		convertTemplateInstanceToLocal(target, tpl)
		forkOpen.value = false
		toast.add({
			title: t('dms_automation.editor.forked', {
				name: target.node.label || (target.node.config?.name as string | undefined) || tpl.name,
			}),
			color: 'success',
			icon: 'i-ph-check-circle',
		})
	} catch (e) {
		forkError.value = formatForkError(e)
	} finally {
		forkSubmitting.value = false
	}
}

// Keyboard. With Ctrl (⌘ on macOS): S saves, Enter runs a test, P opens the
// switcher, Z / Shift+Z / Y undo and redo, D duplicates the selected step, C
// and V copy and paste the selection. Enter enters the selected group, Escape
// leaves the debug view, then the group, then the selection. Tab is left to
// the focus. Keys typed in a field, or while a dialog or a menu is open,
// belong to them.
function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false
	const tag = target.tagName
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
	if (target.isContentEditable) return true
	return false
}

// Open overlays only: a closing dialog stays in the page while it animates
// out, and a non-modal card (the DMS star prompt) has no state at all.
const OVERLAY_SELECTOR = ':is([role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"])[data-state="open"]'

function isOverlayOpen(): boolean {
	return (
		saveAsTemplateOpen.value ||
		forkOpen.value ||
		switcherOpen.value ||
		runNowOpen.value ||
		newProcedureOpen.value ||
		choiceDialog.value.open ||
		document.querySelector(OVERLAY_SELECTOR) !== null
	)
}

/**
 * Blurs the focused field so it commits what is typed in it (a JSON setting
 * or the step name only do on blur), and returns it to focus again after.
 */
async function commitFocusedField(): Promise<HTMLElement | null> {
	const field = document.activeElement
	if (!(field instanceof HTMLElement) || !isEditableTarget(field)) return null
	field.blur()
	await nextTick()
	return field
}

async function saveFromKeyboard() {
	const field = await commitFocusedField()
	if (isDirty.value) await onSave()
	field?.focus()
}

async function testRunFromKeyboard() {
	const field = await commitFocusedField()
	await onTestRun()
	field?.focus()
}

// Ctrl+C / Ctrl+V: the selected steps and the wires between them, pasted as
// new steps beside the originals, in this graph or another one.
let clipboard: ProcedureGraph | null = null

function copySelection(): boolean {
	const g = currentGraph.value
	const ids = new Set(selectedNodeIds.value.length > 0 ? selectedNodeIds.value : selectedNodeId.value ? [selectedNodeId.value] : [])
	if (!g || ids.size === 0) return false
	const nodes = g.nodes.filter((n) => ids.has(n.id) && n.kind !== 'groupInput' && n.kind !== 'groupOutput')
	if (nodes.length === 0) return false
	const kept = new Set(nodes.map((n) => n.id))
	clipboard = cloneGraph({
		nodes,
		triggerEdges: g.triggerEdges.filter((e) => kept.has(e.from.node) && kept.has(e.to.node)),
		dataEdges: g.dataEdges.filter((e) => kept.has(e.from.node) && kept.has(e.to.node)),
	})
	return true
}

function pasteClipboard(): boolean {
	const g = currentGraph.value
	if (!g || !clipboard || isCurrentGraphReadOnly.value) return false
	// Triggers only live at the top level of a procedure.
	const triggersAllowed = editorMode.value === 'procedure' && subgraphPath.value.length <= 1
	// Each paste lands one step further, like Duplicate.
	clipboard.nodes = clipboard.nodes.map((n) => ({ ...n, position: { x: n.position.x + 40, y: n.position.y + 60 } }))
	const source = cloneGraph(clipboard)
	const nodes = source.nodes.filter((n) => triggersAllowed || n.kind !== 'trigger')
	if (nodes.length === 0) return false
	const ids = new Map(nodes.map((n) => [n.id, newId()]))
	const idOf = (id: string) => ids.get(id)!
	const pasted = nodes.map((n) => ({ ...n, id: idOf(n.id) }))
	const triggerEdges = source.triggerEdges
		.filter((e) => ids.has(e.from.node) && ids.has(e.to.node))
		.map((e) => ({ ...e, id: newId(), from: { ...e.from, node: idOf(e.from.node) }, to: { ...e.to, node: idOf(e.to.node) } }))
	const dataEdges = source.dataEdges
		.filter((e) => ids.has(e.from.node) && ids.has(e.to.node))
		.map((e) => ({ ...e, id: newId(), from: { ...e.from, node: idOf(e.from.node) }, to: { ...e.to, node: idOf(e.to.node) } }))
	onGraphUpdate({
		...g,
		nodes: [...g.nodes, ...pasted],
		triggerEdges: [...g.triggerEdges, ...triggerEdges],
		dataEdges: [...g.dataEdges, ...dataEdges],
	})
	selectedNodeId.value = pasted.at(-1)!.id
	return true
}

/** The editing shortcuts, on the canvas: whatever is not typed in a field. */
function onEditShortcut(ev: KeyboardEvent, key: string): boolean {
	if (isEditableTarget(ev.target)) return false
	if (key === 'z' || key === 'y') {
		if (key === 'y' || ev.shiftKey) onRedo()
		else onUndo()
		return true
	}
	if (key === 'd') {
		const node = selectedNode.value
		if (node && node.kind !== 'groupInput' && node.kind !== 'groupOutput') onDuplicateNode({ id: node.id })
		return true
	}
	// A text selected on the page is copied as text.
	if (key === 'c') return !window.getSelection()?.toString() && copySelection()
	if (key === 'v') return pasteClipboard()
	return false
}

// Listened to in the capture phase, so a focused field (a select opens on
// Enter) never sees a shortcut meant for the builder.
function onShortcut(ev: KeyboardEvent): boolean {
	if (!(ev.metaKey || ev.ctrlKey) || ev.altKey) return false
	const key = ev.key.toLowerCase()
	// The browser's "Save page" is never what Ctrl+S means here.
	if (key === 's') ev.preventDefault()
	if (isOverlayOpen()) return false
	if (['s', 'enter', 'p'].includes(key)) ev.stopPropagation()
	if (key === 's') {
		void saveFromKeyboard()
		return true
	}
	if (key === 'enter' && editorMode.value === 'procedure') {
		ev.preventDefault()
		void testRunFromKeyboard()
		return true
	}
	if (key === 'p' && editorMode.value === 'procedure') {
		ev.preventDefault()
		switcherOpen.value = true
		return true
	}
	if (onEditShortcut(ev, key)) {
		ev.preventDefault()
		ev.stopPropagation()
		return true
	}
	return false
}

/** Enter belongs to a focused button or link; elsewhere it enters a group. */
function isActivatable(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest('button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"]') !== null
}

function onKeyDown(ev: KeyboardEvent) {
	if (onShortcut(ev)) return
	if (isEditableTarget(ev.target) || isOverlayOpen()) return
	if (ev.key === 'Enter' && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
		if (!canEnterGroup.value || isActivatable(ev.target)) return
		ev.preventDefault()
		enterSelectedGroup()
		return
	}
	if (ev.key !== 'Escape') return
	if (overlayRun.value && subgraphPath.value.length <= 1) {
		ev.preventDefault()
		exitDebug()
	} else if (subgraphPath.value.length > 1) {
		ev.preventDefault()
		exitSubgraph()
	} else if (selectedNodeId.value) {
		ev.preventDefault()
		selectedNodeId.value = null
	}
}

onMounted(() => {
	if (typeof window === 'undefined') return
	window.addEventListener('keydown', onKeyDown, { capture: true })
	document.addEventListener('inertia:before', onInertiaBefore)
	browserNavigation()?.addEventListener('navigate', onNavigate)
})
onBeforeUnmount(() => {
	if (typeof window === 'undefined') return
	window.removeEventListener('keydown', onKeyDown, { capture: true })
	document.removeEventListener('inertia:before', onInertiaBefore)
	browserNavigation()?.removeEventListener('navigate', onNavigate)
})

// ---------------------------------------------------------------------------
// Runs over the canvas: Test run of the draft, debugging a stored run (AU-05)
// ---------------------------------------------------------------------------

// The dock's last runs: its tab counts the failed ones, folded too.
const RECENT_RUNS = 8
const recentRunsRead = useApiData<DockRun[]>(selectedProcedureUrl('runs'), { query: { limit: RECENT_RUNS } })
const recentRuns = computed(() => {
	const list = ofSelected(recentRunsRead)
	return Array.isArray(list) ? list.slice(0, RECENT_RUNS) : []
})

/** The run shown over the canvas, and whether it is a test of the draft. */
const overlayRun = ref<RunDetail | null>(null)
const overlayIsTest = ref(false)
const testing = ref(false)
const testPayload = ref('{}')
const testPayloadSource = ref<string | null>(null)
// The trigger a Test run starts from, chosen in the dock (see the watch on
// the draft's triggers at the end).
const testTriggerNodeId = ref<string | undefined>(undefined)

// The last real payload of the trigger a Test run starts from, which fills
// the test payload the user then edits. Left to the browser: it is shown
// only once the dock's payload tab is opened, and may be large.
const lastPayloadRead = useApiData<{ last: { runId: string; payload: unknown } | null }>(selectedProcedureUrl('last-payload'), {
	query: () => (testTriggerNodeId.value ? { triggerNodeId: testTriggerNodeId.value } : {}),
	server: false,
	// Copied into an editable field: the page's refreshes leave the draft alone.
	refreshOnPageRefresh: false,
})
// Each answer (or failure) of another procedure or trigger replaces the
// payload; the previous procedure's, still on screen meanwhile, does not.
watch([() => lastPayloadRead.data.value, () => lastPayloadRead.error.value], ([answer, error]) => {
	if (!error && lastPayloadRead.placeholder.value) return
	const last = error ? null : answer?.last
	testPayload.value = JSON.stringify(last?.payload ?? {}, null, 2)
	testPayloadSource.value = last?.runId ?? null
})

const runStates = computed<Record<string, NodeRunState> | undefined>(() => {
	const run = overlayRun.value
	if (!run || subgraphPath.value.length > 1) return undefined
	const out: Record<string, NodeRunState> = {}
	for (const step of run.trace.steps) {
		const id = step.nodeId.split('__')[0]!
		const previous = out[id]
		const status = step.status === 'failed' ? 'failed' : 'ok'
		if (!previous || status === 'failed') {
			out[id] = { status, durationMs: (previous?.durationMs ?? 0) + (step.durationMs ?? 0) }
		}
	}
	for (const skipped of run.trace.skipped) out[skipped.nodeId] = { status: 'skipped' }
	return out
})

const overlaySteps = computed<TraceStep[] | null>(() => (overlayIsTest.value ? (overlayRun.value?.trace.steps ?? null) : null))

// The dock's "Test run" tab only exists while a test run is on screen.
watch(overlaySteps, (steps) => {
	if (!steps && dockTab.value === 'test') dockTab.value = 'problems'
})

/** The step of the selected node in the run on screen, for the inspector. */
const selectedRunStep = computed<TraceStep | null>(() => {
	const id = selectedNodeId.value
	const steps = overlayRun.value?.trace.steps ?? []
	if (!id) return null
	const own = steps.filter((s) => s.nodeId === id || s.nodeId.startsWith(`${id}__`))
	return own.find((s) => s.status === 'failed') ?? own.at(-1) ?? null
})

const overlayLabel = computed(() => {
	const run = overlayRun.value
	if (!run) return ''
	const when = describeTime(run.startedAt, dateTimeFormat)
	return overlayIsTest.value
		? t('dms_automation.editor.debug.testLabel', { when })
		: t('dms_automation.editor.debug.runLabel', { run: run._id.slice(-6), when })
})

/** A real run of an older version than the one open says so. */
const overlayDescription = computed(() => {
	const run = overlayRun.value
	const version = selected.value?.version
	if (!run || overlayIsTest.value || !run.procedureVersion || !version || run.procedureVersion === version) return overlayLabel.value
	return `${overlayLabel.value} · ${t('dms_automation.editor.debug.olderVersion', { run: run.procedureVersion, current: version })}`
})

const overlaySummary = computed(() => {
	const run = overlayRun.value
	if (!run) return ''
	const duration = describeDuration(run.durationMs, locale.value)
	if (run.status === 'cancelled') return t('dms_automation.editor.debug.cancelled', { duration })
	if (run.status === 'failed') {
		const step = stepTitle(run.failedStep, processI18n)
		return step
			? t('dms_automation.editor.debug.failedAt', { step, duration })
			: t('dms_automation.editor.debug.failed', { duration })
	}
	return t('dms_automation.editor.debug.passed', { duration })
})

/** The overlay banner's tone and icon, by how the run ended. */
const overlayLook = computed(() => {
	const status = overlayRun.value?.status
	if (status === 'failed') return { tone: 'error', icon: 'i-ph-bug' } as const
	if (status === 'cancelled') return { tone: 'warning', icon: 'i-ph-prohibit' } as const
	return { tone: 'success', icon: 'i-ph-check-circle' } as const
})

/** Shows a stored run over the canvas; a test run is told by its kind. */
function displayRun(run: RunDetail) {
	overlayRun.value = run
	overlayIsTest.value = run.kind === 'test'
	if (run.failedNodeId) selectNode(run.failedNodeId.split('__')[0]!)
}

async function showRun(runId: string): Promise<RunDetail> {
	const run = await runsApi.getRun(runId)
	displayRun(run)
	return run
}

/**
 * `?run=`: the run is shown over the procedure it ran, which the builder
 * opens if another one is asked; a run that no longer exists is said.
 */
async function openRunFromUrl(runId: string) {
	const notFound = () => {
		toast.add({ title: t('dms_automation.editor.debug.runNotFound'), color: 'warning', icon: 'i-ph-warning' })
		exitDebug()
	}
	let run: RunDetail
	try {
		run = await runsApi.getRun(runId)
	} catch {
		notFound()
		return
	}
	if (run.procedureId !== selectedId.value) {
		if (!procedures.value.some((p) => p._id === run.procedureId)) {
			notFound()
			return
		}
		selectedId.value = run.procedureId
		// Switching clears the run on screen: show this one after it.
		await nextTick()
	}
	displayRun(run)
}

function exitDebug() {
	overlayRun.value = null
	overlayIsTest.value = false
	if (queryValue('run')) void router.replace(`${builderPath()}?selected=${selectedId.value}`)
}

async function onTestRun() {
	const current = selected.value
	// One test at a time: Ctrl+Enter pressed again waits for it.
	if (!current || editorMode.value !== 'procedure' || testing.value) return
	let payload: unknown
	try {
		payload = JSON.parse(testPayload.value || 'null')
	} catch {
		dockTab.value = 'payload'
		dockCollapsed.value = false
		toast.add({ title: t('dms_automation.editor.dock.invalidJson'), color: 'error', icon: 'i-ph-warning' })
		return
	}
	testing.value = true
	// The previous result leaves the canvas while this test runs.
	overlayRun.value = null
	overlayIsTest.value = false
	try {
		const res = await $authFetch<{ runId: string }>(`${props.apiUrl}/procedures/${current._id}/test`, {
			method: 'POST',
			body: { graph: current.graph, payload, triggerNodeId: testTriggerNodeId.value },
		})
		await showRun(res.runId)
		dockTab.value = 'test'
		dockCollapsed.value = false
		void recentRunsRead.refresh()
	} catch (e) {
		const refused = issuesOf(e)
		if (refused) {
			issues.value = refused
			dockTab.value = 'problems'
			dockCollapsed.value = false
		}
		toast.add({ title: t('dms_automation.editor.testRunError'), description: describeApiError(e), color: 'error', icon: 'i-ph-warning' })
	} finally {
		testing.value = false
	}
}

/** Run now runs the saved graph: with unsaved changes, say so first. */
async function openRunNow() {
	if (!selected.value) return
	if (isDirty.value) {
		// Closing the question (Escape, ✕, a click outside) runs nothing.
		const choice = await askChoice({
			title: t('dms_automation.editor.runSaved.title'),
			description: t('dms_automation.editor.runSaved.description', { count: changeCount.value }),
			choices: [
				{ value: 'cancel', label: t('dms_automation.common.cancel'), color: 'neutral', variant: 'ghost' },
				{ value: 'test', label: t('dms_automation.editor.runSaved.testDraft'), color: 'neutral', variant: 'outline' },
				{ value: 'saved', label: t('dms_automation.editor.runSaved.runSaved'), color: 'warning' },
			],
			dismiss: 'cancel',
		})
		if (choice === 'cancel') return
		if (choice === 'test') {
			await onTestRun()
			return
		}
	}
	runNowOpen.value = true
}

/** A run of the saved version ended: show it, and say how it went. */
async function onRunStarted(runId: string) {
	const name = savedName.value
	const trace = { label: t('dms_automation.runs.trace'), onClick: () => void router.push(`${props.traceUrl}?run=${runId}`) }
	void recentRunsRead.refresh()
	void summariesRead.refresh()
	let run: RunDetail
	try {
		run = await showRun(runId)
	} catch {
		toast.add({ title: t('dms_automation.editor.runStarted', { name }), color: 'neutral', icon: 'i-ph-play-circle', actions: [trace] })
		return
	}
	if (run.status === 'cancelled') {
		toast.add({ title: t('dms_automation.editor.runCancelled', { name }), description: run.errorMessage, color: 'warning', icon: 'i-ph-prohibit', actions: [trace] })
		return
	}
	const step = stepTitle(run.failedStep, processI18n)
	const failed = run.status === 'failed'
	toast.add({
		title: failed
			? step
				? t('dms_automation.editor.runFailedAt', { name, step })
				: t('dms_automation.editor.runFailed', { name })
			: t('dms_automation.editor.runSucceeded', { name }),
		color: failed ? 'error' : 'success',
		icon: failed ? 'i-ph-x-circle' : 'i-ph-check-circle',
		actions: [trace],
	})
}

/**
 * Debugging a real run: once the fix is saved, run it again with the payload
 * it received, on the saved version, and show the new run in its place.
 */
async function rerunOverlay() {
	const run = overlayRun.value
	if (!run || overlayIsTest.value) return
	let newRunId: string | null = null
	const confirmed = await confirm({
		title: t('dms_automation.runs.rerunConfirmTitle'),
		description: t('dms_automation.runs.rerunConfirmDescription'),
		color: 'warning',
		icon: 'i-ph-arrow-clockwise',
		confirmLabel: t('dms_automation.runs.rerun'),
		onConfirm: async () => {
			newRunId = (await runsApi.rerun(run._id)).runId
		},
	})
	if (!confirmed || !newRunId) return
	await onRunStarted(newRunId)
	if (queryValue('run')) void router.replace(`${builderPath()}?selected=${selectedId.value}&run=${newRunId}`)
}

function openTrace(runId: string) {
	void router.push(`${props.traceUrl}?run=${runId}`)
}

// ---------------------------------------------------------------------------
// Node actions from the inspector
// ---------------------------------------------------------------------------

function onDuplicateNode(payload: { id: string }) {
	const g = currentGraph.value
	if (!g || isCurrentGraphReadOnly.value) return
	const node = g.nodes.find((n) => n.id === payload.id)
	if (!node) return
	const copy: GraphNode = {
		...cloneGraph({ nodes: [node], triggerEdges: [], dataEdges: [] }).nodes[0]!,
		id: newId(),
		position: { x: node.position.x + 40, y: node.position.y + 60 },
	}
	onGraphUpdate({ ...g, nodes: [...g.nodes, copy] })
	selectedNodeId.value = copy.id
}

/** Put a Retry in front of a step: it now runs inside the Retry's body. */
function onWrapInRetry(payload: { id: string }) {
	const g = currentGraph.value
	if (!g || isCurrentGraphReadOnly.value) return
	const node = g.nodes.find((n) => n.id === payload.id)
	if (!node) return
	const retry: GraphNode = {
		id: newId(),
		kind: 'retry',
		config: { maxAttempts: 3 },
		position: { x: node.position.x - 40, y: node.position.y - 140 },
	}
	const triggerEdges = g.triggerEdges.map((e) => {
		if (e.to.node === node.id) return { ...e, to: { ...e.to, node: retry.id } }
		if (e.from.node === node.id && (!e.from.branch || e.from.branch === 'main')) {
			return { ...e, from: { node: retry.id, branch: 'main' } }
		}
		return e
	})
	triggerEdges.push({ id: newId(), from: { node: retry.id, branch: 'body' }, to: { node: node.id } })
	onGraphUpdate({ ...g, nodes: [...g.nodes, retry], triggerEdges })
	selectedNodeId.value = retry.id
}

// ---------------------------------------------------------------------------
// Loading what the bar and the dock show, per procedure
// ---------------------------------------------------------------------------

// Another procedure opened: what the bar and the dock show follows it
// through their reads' URLs.
watch(selectedId, (id) => {
	if (id) missingProcedureId.value = null
	overlayRun.value = null
})

/** `?path=g1,g2`: the groups to enter, outermost first, before `?node=`. */
function enterPathFromUrl(): boolean {
	const ids = (queryValue('path') ?? '').split(',').filter(Boolean)
	for (const id of ids) {
		const depth = subgraphPath.value.length
		onGroupEnter({ id })
		if (subgraphPath.value.length === depth) break
	}
	return subgraphPath.value.length > 1
}

onMounted(async () => {
	if (missingProcedureId.value) switcherOpen.value = true
	const runId = queryValue('run')
	if (runId) await openRunFromUrl(runId)
	const nodeId = queryValue('node')
	if (nodeId) {
		if (enterPathFromUrl()) selectedNodeId.value = nodeId
		else selectNode(nodeId)
	}
	// The URL names the procedure on screen, to share or reload it.
	if (editorMode.value === 'procedure' && selectedId.value && queryValue('selected') !== selectedId.value) {
		void router.replace({ path: builderPath(), query: { ...route.query, selected: selectedId.value } })
	}
})

const selectedTriggerSummaries = computed<TriggerSummary[]>(() =>
	(selected.value?.graph.nodes ?? [])
		.filter((n) => n.kind === 'trigger' && n.typeId)
		.map((n) => ({
			nodeId: n.id,
			typeId: n.typeId!,
			typeName: triggerTypes.value.find((x) => x.id === n.typeId)?.name ?? n.typeId!,
			path: typeof n.config?.path === 'string' ? n.config.path : undefined,
			method: typeof n.config?.method === 'string' ? n.config.method : undefined,
			cron: typeof n.config?.cron === 'string' ? n.config.cron : undefined,
		})),
)

// A draft trigger as the server words it, its type's name until it has.
function triggerLabel(trigger: TriggerSummary): string {
	const worded = draftTriggers.value.find((tr) => tr.nodeId === trigger.nodeId)
	return worded ? processText(worded.text) : processI18n(trigger.typeName)
}

// Test run starts from the trigger picked in the dock: the manual one, else
// the first, until the user picks another; its last real payload prefills
// the test payload.
const testTriggerItems = computed(() =>
	selectedTriggerSummaries.value.map((trigger) => ({ label: triggerLabel(trigger), value: trigger.nodeId ?? '' })),
)
watch(
	selectedTriggerSummaries,
	(triggers) => {
		if (triggers.some((trigger) => trigger.nodeId === testTriggerNodeId.value)) return
		testTriggerNodeId.value = triggers.find((trigger) => trigger.typeId === 'manual')?.nodeId ?? triggers[0]?.nodeId
	},
	{ immediate: true },
)

// Below xl the inspector floats over the canvas instead of narrowing it; the
// palette can be put away. Remembered per browser.
const PALETTE_HIDDEN_KEY = 'dms-automation:builder-palette-hidden'
const PALETTE_FOLDED_BELOW_PX = 1280
const paletteHidden = ref(false)
onMounted(() => {
	// Folded by default below xl, where it would leave the canvas too little.
	let stored: string | null = null
	try {
		stored = window.localStorage.getItem(PALETTE_HIDDEN_KEY)
	} catch {
		// Storage blocked: the default for the width applies.
	}
	paletteHidden.value = stored === null ? window.innerWidth < PALETTE_FOLDED_BELOW_PX : stored === '1'
})
function togglePalette() {
	paletteHidden.value = !paletteHidden.value
	try {
		window.localStorage.setItem(PALETTE_HIDDEN_KEY, paletteHidden.value ? '1' : '0')
	} catch {
		// Storage blocked: the choice lasts until the page is left.
	}
}

// Template mode: the template's own ports are edited at its root, where its
// Group input / Group output steps show them. Shown when no step, or
// one of those two, is selected.
const showTemplatePorts = computed<boolean>(
	() =>
		editorMode.value === 'template' &&
		subgraphPath.value.length <= 1 &&
		(!selectedNode.value || selectedNode.value.kind === 'groupInput' || selectedNode.value.kind === 'groupOutput'),
)

function onTemplatePortsUpdate(next: GroupPort[]) {
	const root = selected.value?.graph
	if (!root) return
	// The root graph is the template's subgraph: renames and removals go
	// through the same path as a group's ports.
	const template: GraphNode = {
		id: '',
		kind: 'group',
		config: {},
		position: { x: 0, y: 0 },
		ports: next.map((p) => ({ ...p })),
		subgraph: cloneGraph(root),
	}
	const renames = detectPortRenames(templatePorts.value, next)
	const gi = template.subgraph!.nodes.find((n) => n.kind === 'groupInput')
	const go = template.subgraph!.nodes.find((n) => n.kind === 'groupOutput')
	const inRenames = renames.filter((r) => r.direction === 'in')
	const outRenames = renames.filter((r) => r.direction === 'out')
	if (gi && inRenames.length > 0) applyPortRenamesToEdges(template.subgraph!.triggerEdges, template.subgraph!.dataEdges, gi.id, inRenames, true)
	if (go && outRenames.length > 0) applyPortRenamesToEdges(template.subgraph!.triggerEdges, template.subgraph!.dataEdges, go.id, outRenames, true)
	syncSentinels(template)
	templatePorts.value = template.ports!
	onGraphUpdate(template.subgraph!)
}


</script>

<template>
	<!--
		The builder is one tool: the page hides its header (src/pages/builder.ts)
		and the editor fills the panel. One bar holds the procedure's identity,
		state and actions; the palette, the canvas and the inspector share the
		height; the dock under them lists problems, runs and the test payload.
	-->
	<div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-default bg-default">
		<header class="flex min-h-13 flex-wrap items-center gap-2 border-b border-default px-3 py-2">
			<template v-if="editorMode === 'procedure'">
				<UTooltip :text="$t('dms_automation.editor.switcher.title')" :kbds="['meta', 'p']">
					<UButton
						icon="i-ph-flow-arrow"
						variant="ghost"
						color="neutral"
						:aria-label="$t('dms_automation.editor.switcher.title')"
						@click="switcherOpen = true"
					/>
				</UTooltip>
			</template>
			<template v-else>
				<UButton icon="i-ph-arrow-left" variant="ghost" color="neutral" :to="libraryBackUrl">
					{{ $t('dms_automation.library.title') }}
				</UButton>
				<UBadge color="info" variant="subtle">{{ $t('dms_automation.editor.templateBadge') }}</UBadge>
			</template>
			<UTooltip v-if="selected && currentGraph && !isCurrentGraphReadOnly" :text="paletteHidden ? $t('dms_automation.editor.showBlocks') : $t('dms_automation.editor.hideBlocks')">
				<UButton
					:icon="paletteHidden ? 'i-ph-sidebar-simple' : 'i-ph-sidebar-simple-fill'"
					variant="ghost"
					color="neutral"
					:aria-label="paletteHidden ? $t('dms_automation.editor.showBlocks') : $t('dms_automation.editor.hideBlocks')"
					:aria-pressed="!paletteHidden"
					@click="togglePalette"
				/>
			</UTooltip>
			<UInput
				v-if="selected"
				:id="NAME_INPUT_ID"
				v-model="procedureName"
				variant="ghost"
				:color="nameMissing ? 'error' : undefined"
				:highlight="nameMissing"
				:placeholder="editorMode === 'template' ? $t('dms_automation.editor.templateName') : $t('dms_automation.editor.procedureName')"
				:aria-label="editorMode === 'template' ? $t('dms_automation.editor.templateName') : $t('dms_automation.editor.procedureName')"
				:aria-invalid="nameMissing || undefined"
				:aria-describedby="nameMissing ? `${NAME_INPUT_ID}-error` : undefined"
				class="min-w-[12rem] max-w-sm flex-1 font-medium"
			/>
			<DmsFieldError v-if="nameMissing" :id="`${NAME_INPUT_ID}-error`" :message="$t('dms_automation.editor.nameRequired')" />
			<DmsStatusPill
				v-if="currentSummary && editorMode === 'procedure'"
				:tone="STATE_TONES[currentSummary.status]"
				:label="$t(`dms_automation.procedures.status.${currentSummary.status}`)"
				size="sm"
			/>
			<label v-if="selected && editorMode === 'procedure'" class="flex items-center gap-2 text-sm text-muted">
				<USwitch v-model="procedureEnabled" size="sm" />
				{{ procedureEnabled ? $t('dms_automation.editor.enabled') : $t('dms_automation.editor.disabled') }}
			</label>
			<span v-if="selected" class="ml-1 inline-flex items-center gap-1 whitespace-nowrap text-xs" :class="changeCount > 0 ? 'text-warning' : 'text-dimmed'">
				<UIcon :name="changeCount > 0 ? 'i-ph-circle-fill' : 'i-ph-check'" class="size-2.5 shrink-0" />
				{{ saveState }}
			</span>
			<div class="ml-auto flex flex-wrap items-center gap-2">
				<UButton
					v-if="selected"
					variant="ghost"
					color="neutral"
					:disabled="!isDirty || saving"
					@click="onCancel"
				>
					{{ $t('dms_automation.editor.discard') }}
				</UButton>
				<template v-if="selected && editorMode === 'procedure'">
					<UButton variant="outline" color="neutral" icon="i-ph-play" @click="openRunNow">
						{{ $t('dms_automation.editor.runNowButton') }}
					</UButton>
					<UButton variant="outline" color="neutral" icon="i-ph-flask" :loading="testing" @click="onTestRun">
						{{ $t('dms_automation.editor.testRun') }}
						<UKbd :value="formatShortcut(['meta', '↵'])" size="sm" class="ml-1" />
					</UButton>
				</template>
				<UButton v-if="selected" color="primary" icon="i-ph-floppy-disk" :disabled="!isDirty || nameMissing" :loading="saving" @click="onSave">
					{{ $t('dms_automation.common.save') }}
					<UKbd :value="formatShortcut(['meta', 's'])" size="sm" class="ml-1" />
				</UButton>
				<UDropdownMenu
					v-if="selected && editorMode === 'procedure'"
					:items="[
						[
							{ label: $t('dms_automation.newProcedure.title'), icon: 'i-ph-plus', onSelect: onCreate },
							{ label: $t('dms_automation.editor.exportJson'), icon: 'i-ph-download-simple', onSelect: onExport },
							{ label: $t('dms_automation.editor.viewRuns'), icon: 'i-ph-list-bullets', to: `${runsUrl}?procedure=${selectedId}` },
						],
						[{ label: $t('dms_automation.editor.delete'), icon: 'i-ph-trash', color: 'error', onSelect: onDelete }],
					]"
				>
					<UButton icon="i-ph-dots-three" variant="ghost" color="neutral" :aria-label="$t('dms_automation.editor.more')" />
				</UDropdownMenu>
			</div>
		</header>

		<div class="flex flex-col gap-2 empty:hidden" :class="loadError || saveBlocked || pausedBanner || overlayRun || testing || isCurrentGraphReadOnly ? 'border-b border-default p-2' : ''">
			<DmsBanner
				v-if="loadError"
				size="sm"
				tone="error"
				icon="i-ph-warning"
				:title="editorMode === 'template' ? $t('dms_automation.editor.loadTemplateError') : $t('dms_automation.editor.loadProceduresError')"
				:description="loadError"
			>
				<template v-if="templateNotFound" #actions>
					<UButton size="xs" color="error" variant="soft" icon="i-ph-arrow-left" :to="libraryBackUrl">{{ $t('dms_automation.editor.backToTemplates') }}</UButton>
				</template>
			</DmsBanner>
			<DmsBanner
				v-if="saveBlocked && blockingIssues.length"
				size="sm"
				tone="error"
				icon="i-ph-warning-octagon"
				:title="$t('dms_automation.editor.problems.title', { count: blockingIssues.length })"
				:description="$t('dms_automation.editor.problems.description')"
			>
				<template #actions>
					<UButton size="xs" color="error" variant="soft" @click="goToFirstProblem">{{ $t('dms_automation.editor.problems.first') }}</UButton>
					<UButton size="xs" color="neutral" variant="outline" :loading="saving" @click="saveAsDraft">{{ $t('dms_automation.editor.problems.saveDraft') }}</UButton>
				</template>
			</DmsBanner>
			<DmsBanner v-if="pausedBanner && !saveBlocked" size="sm" tone="warning" icon="i-ph-pause-circle" :title="pausedBanner.title" :description="pausedBanner.description">
				<template #actions>
					<UButton size="xs" color="warning" variant="soft" :loading="saving" :disabled="blockingIssues.length > 0" @click="enableNow">
						{{ $t('dms_automation.editor.paused.enable') }}
					</UButton>
				</template>
			</DmsBanner>
			<DmsBanner
				v-if="testing"
				size="sm"
				tone="info"
				icon="i-ph-flask"
				:title="$t('dms_automation.editor.debug.testing')"
				:description="$t('dms_automation.editor.debug.testingHint')"
			/>
			<DmsBanner
				v-if="overlayRun && !testing"
				size="sm"
				:tone="overlayLook.tone"
				:icon="overlayLook.icon"
				:title="overlaySummary"
				:description="overlayDescription"
			>
				<template #actions>
					<UTooltip v-if="!overlayIsTest" :text="isDirty ? $t('dms_automation.editor.debug.rerunSaveFirst') : $t('dms_automation.editor.debug.rerunHint')">
						<UButton size="xs" variant="soft" color="neutral" icon="i-ph-arrow-clockwise" :disabled="isDirty" @click="rerunOverlay">
							{{ $t('dms_automation.runs.rerunWithPayload') }}
						</UButton>
					</UTooltip>
					<UButton v-if="overlayIsTest" size="xs" variant="soft" color="neutral" icon="i-ph-arrow-clockwise" :loading="testing" @click="onTestRun">
						{{ $t('dms_automation.editor.debug.again') }}
					</UButton>
					<UButton size="xs" variant="ghost" color="neutral" icon="i-ph-path" @click="openTrace(overlayRun._id)">
						{{ $t('dms_automation.runs.trace') }}
					</UButton>
					<UButton size="xs" variant="ghost" color="neutral" @click="exitDebug">
						{{ $t('dms_automation.editor.debug.exit') }}
						<UKbd value="Esc" size="sm" class="ml-1" />
					</UButton>
				</template>
			</DmsBanner>
			<DmsBanner
				v-if="isCurrentGraphReadOnly"
				size="sm"
				tone="info"
				icon="i-ph-link"
				:title="$t('dms_automation.editor.linkedTitle')"
				:description="$t('dms_automation.editor.linkedDescription')"
			>
				<template v-if="canForkToLocal" #actions>
					<UButton size="xs" color="info" variant="soft" icon="i-ph-git-fork" @click="openFork">
						{{ $t('dms_automation.editor.forkToEdit') }}
					</UButton>
				</template>
			</DmsBanner>
		</div>

		<DmsEmptyState
			v-if="!selected && !loading && editorMode === 'procedure' && missingProcedureId"
			class="m-auto"
			size="lg"
			icon="i-ph-question"
			:title="$t('dms_automation.editor.missingTitle')"
			:description="$t('dms_automation.editor.missingDescription')"
			:actions="[
				{ label: $t('dms_automation.editor.missingPick'), icon: 'i-ph-flow-arrow', onClick: () => (switcherOpen = true) },
				{ label: $t('dms_automation.newProcedure.title'), icon: 'i-ph-plus', variant: 'outline', onClick: () => (newProcedureOpen = true) },
			]"
		/>
		<DmsEmptyState
			v-else-if="!selected && !loading && editorMode === 'procedure'"
			class="m-auto"
			size="lg"
			icon="i-ph-flow-arrow"
			:title="$t('dms_automation.editor.noProcedureTitle')"
			:description="$t('dms_automation.editor.noProcedure')"
			:actions="[{ label: $t('dms_automation.newProcedure.title'), icon: 'i-ph-plus', onClick: () => (newProcedureOpen = true) }]"
		/>

		<div v-if="selected" class="relative flex min-h-0 flex-1">
			<DmsAutomationBuilderPalette
				v-if="currentGraph && !isCurrentGraphReadOnly && !paletteHidden"
				:node-kinds="nodeKinds"
				:trigger-types="paletteTriggerTypes"
				:action-types="actionTypes"
				:data-node-types="dataNodeTypes"
				:templates="palettesTemplates"
				class="w-60 shrink-0 border-r border-default"
				@add-node="onPaletteAddNode"
				@add-template="onPaletteAddTemplate"
			/>
			<div class="h-full min-w-0 flex-1">
				<DmsClientOnly>
					<DmsAutomationGraphCanvas
						v-if="currentGraph"
						ref="graphCanvasRef"
						:graph="currentGraph"
						:trigger-types="triggerTypes"
						:action-types="actionTypes"
						:data-node-types="dataNodeTypes"
						:node-kinds="nodeKinds"
						:can-undo="canUndo"
						:can-redo="canRedo"
						:parent-group-ports="currentParentGroupPorts"
						:read-only="isCurrentGraphReadOnly"
						:run-states="runStates"
						:issues="subgraphPath.length <= 1 ? issuesByNode : undefined"
						:selected-node-id="selectedNodeId"
						:view-key="canvasViewKey"
						:covered-by="inspectorRef"
						:triggers="draftTriggers"
						class="[&_.graph-canvas-wrap]:rounded-none [&_.graph-canvas-wrap]:border-0"
						@update:graph="onGraphUpdate"
						@select:node="onSelectNode"
						@selection-change="onSelectionChange"
						@undo="onUndo"
						@redo="onRedo"
						@group:enter="onGroupEnter"
					>
						<template #breadcrumb>
							<div class="flex items-center gap-2 rounded-lg border border-default bg-elevated/90 px-2 py-1 shadow-sm">
								<UBreadcrumb :items="breadcrumbItems" />
								<UButton
									v-if="subgraphPath.length > 1"
									size="xs"
									variant="ghost"
									color="neutral"
									icon="i-ph-arrow-up-left"
									@click="exitSubgraph"
								>
									{{ $t('dms_automation.editor.exitSubgraph') }}
								</UButton>
							</div>
						</template>
						<template
							v-if="canGroupSelection || canSaveAsTemplate || canForkToLocal || canEnterGroup"
							#groupActions
						>
							<span v-if="selectedNodeIds.length > 1" class="px-1 text-xs text-muted">
								{{ $t('dms_automation.editor.selected', { count: selectedNodeIds.length }) }}
							</span>
							<UButton v-if="canEnterGroup" size="sm" color="primary" icon="i-ph-arrow-square-in" variant="ghost" @click="enterSelectedGroup">
								{{ $t('dms_automation.editor.enterGroup') }}
							</UButton>
							<UButton v-if="canGroupSelection" size="sm" color="primary" icon="i-ph-stack" variant="ghost" @click="createGroupFromSelection">
								{{ $t('dms_automation.editor.groupSelection', { n: selectedNodeIds.length }) }}
							</UButton>
							<UButton v-if="canSaveAsTemplate" size="sm" color="primary" icon="i-ph-floppy-disk" variant="ghost" @click="openSaveAsTemplate">
								{{ $t('dms_automation.editor.saveAsTemplate') }}
							</UButton>
							<UButton v-if="canForkToLocal" size="sm" color="primary" icon="i-ph-git-fork" variant="ghost" @click="openFork">
								{{ $t('dms_automation.editor.forkToLocal') }}
							</UButton>
						</template>
					</DmsAutomationGraphCanvas>
					<template #fallback>
						<div class="flex h-full items-center justify-center text-sm text-dimmed">
							{{ $t('dms_automation.editor.loading') }}
						</div>
					</template>
				</DmsClientOnly>
			</div>
			<aside v-if="showTemplatePorts" ref="inspectorRef" :class="ASIDE_CLASS">
				<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
					<p class="text-xs text-muted">{{ $t('dms_automation.editor.templatePortsHint') }}</p>
					<DmsAutomationGroupPortEditor :ports="templatePorts" @ports:update="onTemplatePortsUpdate" />
				</div>
			</aside>
			<aside v-else-if="selectedNode" ref="inspectorRef" :class="ASIDE_CLASS">
				<DmsAutomationNodeInspector
					:node="selectedNode"
					:data-edges="currentGraph?.dataEdges ?? []"
					:trigger-type="selectedNodeTriggerType"
					:action-type="selectedNodeActionType"
					:data-node-types="dataNodeTypes"
					:node-kinds="nodeKinds"
					:read-only="isCurrentGraphReadOnly"
					:run-step="subgraphPath.length <= 1 ? selectedRunStep : null"
					:run-label="overlayLabel"
					:run-trace-url="overlayRun ? `${traceUrl}?run=${overlayRun._id}` : undefined"
					:issue="issuesByNode[selectedNode.id] ?? null"
					:node-name="nodeDisplayName"
					:saved-triggers="savedTriggers"
					@update:node="onUpdateNode"
					@unwire="onUnwireField"
					@ports:update="onPortsUpdate"
					@group:enter="onGroupEnter"
					@delete:node="onDeleteNode"
					@duplicate:node="onDuplicateNode"
					@wrap:retry="onWrapInRetry"
					@close="selectedNodeId = null"
				/>
			</aside>
		</div>

		<DmsAutomationBottomDock
			v-if="selected && editorMode === 'procedure'"
			v-model:tab="dockTab"
			v-model:payload="testPayload"
			v-model:collapsed="dockCollapsed"
			:issues="dockIssues"
			:runs="recentRuns"
			:test-steps="overlaySteps"
			:payload-source="testPayloadSource"
			:triggers="testTriggerItems"
			v-model:trigger="testTriggerNodeId"
			:runs-url="`${runsUrl}?procedure=${selectedId}`"
			@select-node="selectNode"
			@open-trace="openTrace"
		/>

		<DmsAutomationProcedureSwitcher
			v-if="editorMode === 'procedure'"
			v-model:open="switcherOpen"
			:procedures="summaries"
			:current-id="selectedId"
			proceduresUrl="/modules/automation/procedures"
			@pick="onPickProcedure"
			@create="onCreate"
		/>
		<DmsAutomationNewProcedureDialog v-model:open="newProcedureOpen" :api-url="apiUrl" @created="onCreated" />
		<DmsAutomationRunNowDialog
			v-if="selected && editorMode === 'procedure'"
			v-model:open="runNowOpen"
			:api-url="apiUrl"
			:procedure-id="selected._id"
			:procedure-name="savedName"
			:triggers="savedTriggers"
			@started="onRunStarted"
		/>

		<UModal
			:open="choiceDialog.open"
			:title="choiceDialog.title"
			:content="{ onOpenAutoFocus: focusSafeChoice }"
			@update:open="onChoiceDialogOpen"
		>
			<template #body>
				<p class="text-sm text-toned">{{ choiceDialog.description }}</p>
			</template>
			<template #footer>
				<div class="flex w-full justify-end gap-2">
					<UButton
						v-for="choice in choiceDialog.choices"
						:key="choice.value"
						:color="choice.color ?? 'neutral'"
						:variant="choice.variant ?? 'solid'"
						:data-safe-choice="choice.value === choiceDialog.dismiss || undefined"
						@click="answerChoice(choice.value)"
					>
						{{ choice.label }}
					</UButton>
				</div>
			</template>
		</UModal>

		<UModal
			v-model:open="saveAsTemplateOpen"
			:title="$t('dms_automation.editor.saveTemplateModal.title')"
		>
			<template #body>
				<div class="flex flex-col gap-3">
					<DmsFieldRow
						v-bind="TEMPLATE_ROW"
						:label="$t('dms_automation.editor.saveTemplateModal.name')"
						:label-for="TEMPLATE_NAME_ID"
						required
					>
						<div class="grid gap-1.5">
							<DmsInputText
								:id="TEMPLATE_NAME_ID"
								v-model="saveAsTemplateName"
								:placeholder="$t('dms_automation.editor.saveTemplateModal.namePlaceholder')"
								class="w-full"
								:disabled="saveAsTemplateSubmitting"
								v-bind="templateFieldErrors.aria('name')"
							/>
							<DmsFieldError :id="templateFieldErrors.errorId('name')" :message="templateFieldErrors.errors.name" />
						</div>
					</DmsFieldRow>
					<DmsFieldRow
						v-bind="TEMPLATE_ROW"
						:label="$t('dms_automation.editor.saveTemplateModal.description')"
						label-for="save-template-description"
					>
						<DmsTextarea
							id="save-template-description"
							v-model="saveAsTemplateDescription"
							:placeholder="$t('dms_automation.editor.saveTemplateModal.descriptionPlaceholder')"
							class="w-full"
							:rows="3"
							:disabled="saveAsTemplateSubmitting"
						/>
					</DmsFieldRow>
					<DmsFieldRow v-bind="TEMPLATE_ROW" :label="$t('dms_automation.editor.saveTemplateModal.icon')">
						<DmsAutomationIconPicker v-model="saveAsTemplateIcon" />
					</DmsFieldRow>
					<div v-if="selectedLocalGroupNode?.ports?.length" class="flex flex-col gap-1">
						<span class="text-xs font-medium text-highlighted">{{ $t('dms_automation.editor.saveTemplateModal.ports') }}</span>
						<div class="overflow-hidden rounded-md border border-default">
							<div
								v-for="port in selectedLocalGroupNode.ports"
								:key="`${port.direction}-${port.kind}-${port.name}`"
								class="flex items-center gap-2 border-b border-default px-2 py-1 font-mono text-xs last:border-0"
							>
								<UBadge size="sm" variant="subtle" :color="port.kind === 'trigger' ? 'info' : 'success'">{{ $t(`dms_automation.templates.ports.kind.${port.kind}`) }}</UBadge>
								<span class="text-muted">{{ $t(`dms_automation.templates.ports.direction.${port.direction}`) }}</span>
								<span class="text-highlighted">{{ port.name }}</span>
								<span v-if="port.schema?.type" class="ml-auto text-dimmed">{{ port.schema.type }}</span>
							</div>
						</div>
					</div>
					<DmsBanner
						v-if="saveAsTemplateError"
						size="sm"
						tone="error"
						:title="$t('dms_automation.editor.saveTemplateModal.error')"
						:description="saveAsTemplateError"
					/>
					<DmsFormRequiredLegend />
				</div>
			</template>
			<template #footer>
				<div class="flex w-full justify-end gap-2">
					<UButton
						:label="$t('dms_automation.editor.saveTemplateModal.cancel')"
						variant="outline"
						color="neutral"
						:disabled="saveAsTemplateSubmitting"
						@click="saveAsTemplateOpen = false"
					/>
					<UButton
						:label="$t('dms_automation.editor.saveTemplateModal.submit')"
						color="primary"
						:loading="saveAsTemplateSubmitting"
						@click="submitSaveAsTemplate"
					/>
				</div>
			</template>
		</UModal>

		<UModal
			v-model:open="forkOpen"
			:title="$t('dms_automation.editor.forkModal.title')"
		>
			<template #body>
				<div class="flex flex-col gap-3">
					<p class="text-sm text-toned">
						{{ $t('dms_automation.editor.forkModal.body') }}
					</p>
					<DmsBanner
						v-if="forkError"
						size="sm"
						tone="error"
						:title="$t('dms_automation.editor.forkModal.error')"
						:description="forkError"
					/>
				</div>
			</template>
			<template #footer>
				<div class="flex w-full justify-end gap-2">
					<UButton
						:label="$t('dms_automation.editor.forkModal.cancel')"
						variant="outline"
						color="neutral"
						:disabled="forkSubmitting"
						@click="forkOpen = false"
					/>
					<UButton
						:label="$t('dms_automation.editor.forkModal.submit')"
						color="primary"
						icon="i-ph-git-fork"
						:loading="forkSubmitting"
						@click="submitFork"
					/>
				</div>
			</template>
		</UModal>
	</div>
</template>
