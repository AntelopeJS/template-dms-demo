import { computed, onBeforeUnmount, reactive, watch } from 'vue'
import type {
	TemplateCategory,
	TemplateChange,
	TemplateContent,
	TemplateContentResponse,
	TemplatePerformance,
	TemplateRow,
} from '../types/mailing'
import type { MailingApi, TemplateDetails } from './useMailingApi'
import type { EditorReads } from './useMailingReads'
import type { EditorState } from './useTemplateEditor'
import type { TokenFieldHandle } from './useEditorContext'
import { deepClone } from '../utils/clone'
import { collectContentPaths } from '../utils/paths'
import { parseTestData } from '../utils/testData'
import type { SaveStatus } from '../utils/lifecycle'
import { noticeFor, statusKeyOf } from '../utils/lifecycle'
import {
	apiErrorMessage,
	apiErrorStatus,
	HTTP_CONFLICT,
} from '../utils/api-error'

export type { SaveStatus } from '../utils/lifecycle'

/** The draft is written this long after the last change. */
export const AUTOSAVE_DELAY_MS = 1500

/** A failed save is tried again after this, doubling up to the maximum. */
export const RETRY_BASE_DELAY_MS = 2000
export const RETRY_MAX_DELAY_MS = 60_000

/** Browsers refuse a `keepalive` request whose body passes 64 KiB. */
const KEEPALIVE_MAX_LENGTH = 60_000
const SERVER_ERROR_STATUS = 500
const NETWORK_ERROR_STATUS = 0
const DRAFT_CONFLICT = '$dms_mailing.errors.draft_conflict'
const DRAFT_CONFLICT_KEY = 'draft_conflict'

const JSON_INDENT = 2

/**
 * Everything the editor knows about the template besides its draft (the
 * content and the variable declarations live in the editor state).
 */
export interface SessionState {
	template: TemplateRow
	version: number
	/** The draft revision the next save or publish carries back. */
	revision: number
	publishedContent: TemplateContent | null
	changes: TemplateChange[]
	serverDetected: string[]
	testDataSource: string
	savedTestDataSource: string
	categories: TemplateCategory[]
	fallbackLocale: string
	blockOnMissingVariables: boolean
	performance: TemplatePerformance | null
	saveStatus: SaveStatus
	activeField: TokenFieldHandle | null
}

export interface SessionDeps {
	editor: EditorState
	api: MailingApi
	reads: EditorReads
	templateId: string
	loaded: TemplateContentResponse
	onError: (error: unknown) => void
}

function createState(loaded: TemplateContentResponse): SessionState {
	const testData = JSON.stringify(loaded.testData, null, JSON_INDENT)
	return reactive({
		template: { ...loaded.template },
		version: loaded.version,
		revision: loaded.revision,
		publishedContent: loaded.publishedContent,
		changes: loaded.changes,
		serverDetected: loaded.detectedVariables,
		testDataSource: testData,
		savedTestDataSource: testData,
		categories: loaded.categories,
		fallbackLocale: loaded.fallbackLocale,
		blockOnMissingVariables: loaded.blockOnMissingVariables,
		performance: null,
		saveStatus: 'idle',
		activeField: null,
	}) as SessionState
}

function createViews(state: SessionState, editor: EditorState) {
	return {
		detected: computed(() => [
			...new Set([
				...state.serverDetected,
				...collectContentPaths(editor.content),
			]),
		]),
		testData: computed(() => parseTestData(state.testDataSource)),
		isTestDataDirty: computed(
			() => state.testDataSource !== state.savedTestDataSource,
		),
		isSaving: computed(() => state.saveStatus === 'saving' || editor.dirty > 0),
		/** Work leaving the editor would lose: a failed save, a conflict, test data. */
		hasUnsavedWork: computed(
			() =>
				state.saveStatus === 'error' ||
				state.saveStatus === 'conflict' ||
				state.testDataSource !== state.savedTestDataSource,
		),
		statusKey: computed(() =>
			statusKeyOf(state.template.status, state.version),
		),
		notice: computed(() =>
			noticeFor({
				status: state.template.status,
				version: state.version,
				changeCount: state.changes.length,
				saveStatus: state.saveStatus,
			}),
		),
	}
}

/** Whether a failed call is the server refusing a draft moved on elsewhere. */
export function isDraftConflict(error: unknown): boolean {
	return (
		apiErrorStatus(error) === HTTP_CONFLICT &&
		apiErrorMessage(error).includes(DRAFT_CONFLICT_KEY)
	)
}

/** A failure worth trying again on its own: the network or the server. */
function isTransient(error: unknown): boolean {
	const status = apiErrorStatus(error)
	return status === NETWORK_ERROR_STATUS || status >= SERVER_ERROR_STATUS
}

export function retryDelay(failures: number): number {
	return Math.min(RETRY_BASE_DELAY_MS * 2 ** (failures - 1), RETRY_MAX_DELAY_MS)
}

function createSaver(deps: SessionDeps, state: SessionState) {
	const { editor, api, reads, templateId, onError } = deps
	let timer: ReturnType<typeof setTimeout> | null = null
	let inFlight: Promise<boolean> | null = null
	let failures = 0
	let isDisposed = false
	const cancel = (): void => {
		if (timer) clearTimeout(timer)
		timer = null
	}
	function schedule(delay = AUTOSAVE_DELAY_MS): void {
		cancel()
		if (isDisposed) return
		timer = setTimeout(() => void save(), delay)
	}
	function markConflict(): void {
		cancel()
		if (state.saveStatus !== 'conflict') onError(DRAFT_CONFLICT)
		state.saveStatus = 'conflict'
	}
	function onFailure(error: unknown): void {
		if (isDraftConflict(error)) return markConflict()
		failures += 1
		state.saveStatus = 'error'
		if (failures === 1) onError(error)
		if (isTransient(error)) schedule(retryDelay(failures))
	}
	async function write(): Promise<boolean> {
		const revision = editor.revision
		state.saveStatus = 'saving'
		try {
			const response = await api.saveContent(templateId, {
				content: deepClone(editor.content),
				variables: deepClone(editor.variables),
				revision: state.revision,
			})
			state.revision = response.revision
			state.changes = response.changes
			state.serverDetected = response.detectedVariables
			editor.markSaved(revision)
			failures = 0
			state.saveStatus = 'idle'
			return true
		} catch (error) {
			onFailure(error)
			return false
		}
	}
	async function run(): Promise<boolean> {
		inFlight = write()
		const isSaved = await inFlight
		inFlight = null
		if (isSaved && editor.dirty > 0) schedule()
		return isSaved
	}
	async function save(): Promise<boolean> {
		cancel()
		if (inFlight) await inFlight
		if (state.saveStatus === 'conflict') return false
		if (editor.dirty === 0) return state.saveStatus !== 'error'
		return run()
	}
	/** Writes this editor's content over the draft saved elsewhere. */
	async function overwrite(): Promise<boolean> {
		cancel()
		if (inFlight) await inFlight
		const latest = await reads.changes().catch(() => null)
		if (!latest) return false
		state.revision = latest.revision
		return run()
	}
	/** The page is going away: hands the pending draft to a request that outlives it. */
	function flush(): void {
		if (editor.dirty === 0 || state.saveStatus === 'conflict') return
		cancel()
		const draft = {
			content: deepClone(editor.content),
			variables: deepClone(editor.variables),
		}
		const keepalive = JSON.stringify(draft).length < KEEPALIVE_MAX_LENGTH
		void api
			.saveContent(templateId, {
				...draft,
				revision: state.revision,
				keepalive,
			})
			.catch(() => undefined)
	}
	watch(
		() => editor.revision,
		() => (editor.dirty > 0 ? schedule() : undefined),
	)
	onBeforeUnmount(() => {
		if (editor.dirty > 0) void save()
		isDisposed = true
		cancel()
	})
	return {
		save,
		cancel,
		overwrite,
		flush,
		markConflict,
		settle: () => inFlight ?? Promise.resolve(true),
	}
}

function createRecordActions(
	{ api, reads, templateId }: SessionDeps,
	state: SessionState,
) {
	return {
		async saveDetails(patch: Partial<TemplateDetails>): Promise<void> {
			const details: TemplateDetails = {
				name: state.template.name,
				slug: state.template.slug,
				category: state.template.category || null,
				...patch,
			}
			await api.saveTemplateDetails(templateId, details)
			state.template = { ...state.template, ...details }
		},
		async saveTestData(): Promise<boolean> {
			const data = parseTestData(state.testDataSource)
			if (!data) return false
			await api.saveTestData(templateId, data)
			state.savedTestDataSource = state.testDataSource
			return true
		},
		resetTestData(): void {
			state.testDataSource = state.savedTestDataSource
		},
		async loadPerformance(): Promise<void> {
			state.performance = await reads.performance().catch(() => null)
		},
	}
}

/**
 * The editor's link to the server: the template record, autosave of the
 * draft (content and variable declarations), test data and performance.
 * Publishing, discarding, restoring and the dialogs live in
 * `useEditorActions`.
 */
export function useEditorSession(deps: SessionDeps) {
	const state = createState(deps.loaded)
	return reactive({
		state,
		reportError: deps.onError,
		...createViews(state, deps.editor),
		...createSaver(deps, state),
		...createRecordActions(deps, state),
	})
}

export type EditorSession = ReturnType<typeof useEditorSession>
