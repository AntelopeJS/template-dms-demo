import { computed, reactive, toRefs } from 'vue'
import type {
	Block,
	BlockType,
	LocaleContent,
	TemplateContent,
	VariableDefinition,
} from '../types/mailing'
import {
	cloneWithNewIds,
	createBlock,
	duplicateBlock,
	findBlock,
	findParentList,
	flattenBlocks,
	insertionAfter,
	localizeFooters,
	moveBlock,
	neighbourOf,
	removeBlock,
} from '../utils/blocks'
import type { BlockContext } from '../utils/blocks'
import { deepClone } from '../utils/clone'
import { renameVariablePath } from '../utils/variables'
import {
	createHistory,
	recordChange,
	redoChange,
	undoChange,
} from '../utils/history'
import type { EditorHistory } from '../utils/history'

export type IfBranch = 'children' | 'elseChildren'

export interface InsertTarget {
	parentId: string
	branch: IfBranch
}

export type LeftTab = 'blocks' | 'outline' | 'variables'
export type RightTab = 'block' | 'data' | 'template'
export type EditorDevice = 'desktop' | 'mobile'
export type PreviewMode = 'variables' | 'data'
export type LocalePatch = Partial<Pick<LocaleContent, 'subject' | 'preheader'>>

/** A clock, injectable so the history's coalescing is testable. */
export type EditorClock = () => number

export type AnnouncementKind =
	'block_removed' | 'undone_in_locale' | 'redone_in_locale'

/**
 * Something the editor tells the author after the fact (a toast): a block
 * deleted, an undo that landed in another locale. `serial` grows with each.
 */
export interface EditorAnnouncement {
	serial: number
	kind: AnnouncementKind
	blockType?: BlockType
	count?: number
	locale?: string
	/** The history state an "Undo" action reverts, when the toast offers one. */
	undoable?: string
}

export type AnnouncementInput = Omit<EditorAnnouncement, 'serial'>
export type Announce = (announcement: AnnouncementInput) => void

interface EditorCore {
	content: TemplateContent
	/** The draft's variable declarations: saved, undone and published with it. */
	variables: VariableDefinition[]
	locale: string
	locales: string[]
	revision: number
	savedRevision: number
	selectedId: string | null
	leftTab: LeftTab
	rightTab: RightTab
	device: EditorDevice
	previewMode: PreviewMode
	simulation: Record<string, boolean>
	isSearchRequested: boolean
	history: EditorHistory
	announcement: EditorAnnouncement | null
}

/**
 * A new page in `locale`: blank, but with the footer every e-mail needs, its
 * links following the template's category like a footer from the palette.
 */
const blankLocale = (
	locale: string,
	context: BlockContext = {},
): LocaleContent => ({
	subject: '',
	preheader: '',
	blocks: [createBlock('footer', { ...context, locale })],
})

function copyLocale(
	source: LocaleContent,
	from: string,
	to: string,
): LocaleContent {
	const copy = {
		...deepClone(source),
		blocks: source.blocks.map(cloneWithNewIds),
	}
	localizeFooters(copy.blocks, from, to)
	return copy
}

/** What one undo step restores: the content and the declarations. */
interface DraftSnapshot {
	content: TemplateContent
	variables: VariableDefinition[]
}

const snapshotOf = (draft: DraftSnapshot): string =>
	JSON.stringify({ content: draft.content, variables: draft.variables })

/** A declared variable renamed in the content too, as one change. */
export interface VariableRename {
	from: string
	to: string
}

function createCore(
	content: TemplateContent,
	variables: VariableDefinition[],
	locale: string,
	locales: string[],
): EditorCore {
	return reactive({
		content: deepClone(content),
		variables: deepClone(variables),
		locale,
		locales,
		revision: 0,
		savedRevision: 0,
		selectedId: null,
		leftTab: 'blocks',
		rightTab: 'block',
		device: 'desktop',
		previewMode: 'variables',
		simulation: {},
		isSearchRequested: false,
		history: createHistory(snapshotOf({ content, variables })),
		announcement: null,
	}) as EditorCore
}

function createViews(core: EditorCore) {
	const current = computed<LocaleContent | null>(
		() => core.content.locales[core.locale] ?? null,
	)
	return {
		current,
		selected: computed<Block | null>(() =>
			current.value && core.selectedId
				? findBlock(current.value.blocks, core.selectedId)
				: null,
		),
		missingLocales: computed(() =>
			core.locales.filter((code) => !core.content.locales[code]),
		),
		dirty: computed(() => core.revision - core.savedRevision),
		canUndo: computed(() => core.history.past.length > 0),
		canRedo: computed(() => core.history.future.length > 0),
		isDataMode: computed(() => core.previewMode === 'data'),
	}
}

type EditorViews = ReturnType<typeof createViews>

interface MutationDeps {
	core: EditorCore
	views: EditorViews
	select: (id: string | null) => void
	touch: (isDiscrete?: boolean) => void
	announce: Announce
}

function blocksOf(views: EditorViews): Block[] | null {
	return views.current.value?.blocks ?? null
}

function createSelectionActions(core: EditorCore) {
	function select(id: string | null): void {
		core.selectedId = id
		if (id) core.rightTab = 'block'
	}
	return {
		select,
		setLocale(code: string): void {
			core.locale = code
			select(null)
		},
		requestSearch(): void {
			core.leftTab = 'blocks'
			core.isSearchRequested = true
		},
	}
}

function listFor(views: EditorViews, target?: InsertTarget): Block[] | null {
	const blocks = blocksOf(views)
	if (!blocks || !target) return blocks
	const parent = findBlock(blocks, target.parentId)
	if (parent?.type !== 'if') return null
	if (target.branch === 'elseChildren' && !parent.elseChildren)
		parent.elseChildren = []
	return parent[target.branch]
}

function createInsertActions({ views, select, touch, core }: MutationDeps) {
	function insertInto(
		list: Block[],
		index: number,
		type: BlockType,
		context: BlockContext = {},
	): Block {
		const block = createBlock(type, { ...context, locale: core.locale })
		list.splice(Math.min(index, list.length), 0, block)
		select(block.id)
		touch(true)
		return block
	}
	return {
		insertInto,
		addBlock(type: BlockType, target?: InsertTarget, index?: number): Block {
			const list = listFor(views, target) ?? []
			return insertInto(list, index ?? list.length, type)
		},
		addBlockUnderSelected(
			type: BlockType,
			context?: BlockContext,
		): Block | null {
			const blocks = blocksOf(views)
			if (!blocks) return null
			const point = insertionAfter(blocks, core.selectedId, type)
			return insertInto(point.list, point.index, type, context)
		},
	}
}

function createRemoval({ views, select, touch, core, announce }: MutationDeps) {
	return (id: string): void => {
		const blocks = blocksOf(views)
		const block = blocks ? findBlock(blocks, id) : null
		if (!blocks || !block) return
		const neighbour = neighbourOf(blocks, id)
		removeBlock(blocks, id)
		touch(true)
		if (core.selectedId === id) select(neighbour)
		announce({
			kind: 'block_removed',
			blockType: block.type,
			count: flattenBlocks([block]).length - 1,
			undoable: core.history.present,
		})
	}
}

function createBlockActions(deps: MutationDeps) {
	const { views, select, touch } = deps
	const find = (id: string): Block | null => {
		const blocks = blocksOf(views)
		return blocks ? findBlock(blocks, id) : null
	}
	const mutateTree = (change: (blocks: Block[]) => unknown): void => {
		const blocks = blocksOf(views)
		if (blocks && change(blocks)) touch(true)
	}
	return {
		findBlock: find,
		parentListOf: (id: string) => {
			const blocks = blocksOf(views)
			return blocks ? findParentList(blocks, id) : null
		},
		updateBlock(id: string, patch: Partial<Block>): void {
			const block = find(id)
			if (!block) return
			Object.assign(block, patch)
			touch()
		},
		removeBlockById: createRemoval(deps),
		duplicateBlockById(id: string): void {
			mutateTree((blocks) => {
				const copy = duplicateBlock(blocks, id)
				if (copy) select(copy.id)
				return copy
			})
		},
		moveBlockById(id: string, direction: -1 | 1): void {
			mutateTree((blocks) => moveBlock(blocks, id, direction))
		},
	}
}

function createBranchActions({ views, touch, core }: MutationDeps) {
	const findIf = (id: string) => {
		const blocks = blocksOf(views)
		const block = blocks ? findBlock(blocks, id) : null
		return block?.type === 'if' ? block : null
	}
	return {
		setElse(id: string, isEnabled: boolean): void {
			const block = findIf(id)
			if (!block || Boolean(block.elseChildren) === isEnabled) return
			block.elseChildren = isEnabled
				? [createBlock('paragraph', { locale: core.locale })]
				: null
			touch()
		},
		updateLocale(patch: LocalePatch): void {
			if (!views.current.value) return
			Object.assign(views.current.value, patch)
			touch()
		},
	}
}

/** The locales whose content differs between two versions of it. */
function changedLocales(
	before: TemplateContent,
	after: TemplateContent,
): string[] {
	const codes = new Set([
		...Object.keys(before.locales),
		...Object.keys(after.locales),
	])
	return [...codes].filter(
		(code) =>
			JSON.stringify(before.locales[code]) !==
			JSON.stringify(after.locales[code]),
	)
}

/**
 * An undo or redo that only touches another locale switches to it, so the
 * author sees what changed; `true` when it did.
 */
function followChangedLocale(core: EditorCore, changed: string[]): boolean {
	if (changed.length === 0 || changed.includes(core.locale)) return false
	const target = changed.find((code) => core.content.locales[code])
	if (!target) return false
	core.locale = target
	return true
}

function createHistoryActions(
	core: EditorCore,
	select: (id: string | null) => void,
	announce: Announce,
) {
	function restore(snapshot: string | null, kind: AnnouncementKind): void {
		if (snapshot === null) return
		const next = JSON.parse(snapshot) as DraftSnapshot
		const changed = changedLocales(core.content, next.content)
		core.content = next.content
		core.variables = next.variables
		core.revision += 1
		if (followChangedLocale(core, changed))
			announce({ kind, locale: core.locale })
		const blocks = core.content.locales[core.locale]?.blocks ?? []
		if (core.selectedId && !findBlock(blocks, core.selectedId)) select(null)
	}
	const undo = (): void => restore(undoChange(core.history), 'undone_in_locale')
	return {
		undo,
		redo: () => restore(redoChange(core.history), 'redone_in_locale'),
		/** Undoes only when nothing changed since `present` was recorded. */
		undoIfLatest(present: string): void {
			if (core.history.present === present) undo()
		},
	}
}

function createLifecycleActions({ core, select, touch }: MutationDeps) {
	return {
		touch,
		/** Adds `code`, copied from `from` or blank in the template's `context`. */
		createLocale(code: string, from?: string, context?: BlockContext): void {
			const source = from ? core.content.locales[from] : undefined
			core.content.locales[code] =
				source && from
					? copyLocale(source, from, code)
					: blankLocale(code, context)
			core.locale = code
			touch(true)
		},
		/**
		 * Replaces the draft's declarations; a rename also points every
		 * reference to `from` at `to`, all locales. One undoable step either way.
		 */
		setVariables(next: VariableDefinition[], rename?: VariableRename): void {
			if (rename) renameVariablePath(core.content, rename.from, rename.to)
			core.variables = deepClone(next)
			touch(true)
		},
		/** Marks the content up to `revision` as saved (the latest by default). */
		markSaved(revision?: number): void {
			core.savedRevision = revision ?? core.revision
		},
		reset(content: TemplateContent, variables = core.variables): void {
			core.content = deepClone(content)
			core.variables = deepClone(variables)
			core.history = createHistory(snapshotOf(core))
			core.savedRevision = core.revision
			select(null)
		},
	}
}

/**
 * The editor's state: the draft being edited (content and variable
 * declarations), the selection and panes, and the history. Every mutation
 * goes through `touch()`, which bumps the revision autosave watches and
 * records an undo step.
 */
export function createEditorState(
	content: TemplateContent,
	locale: string,
	locales: string[],
	clock: EditorClock = Date.now,
	variables: VariableDefinition[] = [],
) {
	const core = createCore(content, variables, locale, locales)
	const views = createViews(core)
	const selection = createSelectionActions(core)
	const touch = (isDiscrete = false): void => {
		core.revision += 1
		recordChange(core.history, snapshotOf(core), clock(), isDiscrete)
	}
	const announce: Announce = (announcement) => {
		const serial = (core.announcement?.serial ?? 0) + 1
		core.announcement = { ...announcement, serial }
	}
	const deps: MutationDeps = {
		core,
		views,
		select: selection.select,
		touch,
		announce,
	}
	return reactive({
		...toRefs(core),
		...views,
		...selection,
		...createInsertActions(deps),
		...createBlockActions(deps),
		...createBranchActions(deps),
		...createHistoryActions(core, selection.select, announce),
		...createLifecycleActions(deps),
	})
}

export type EditorState = ReturnType<typeof createEditorState>
