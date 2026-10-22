import { inject, provide } from 'vue'
import type { InjectionKey } from 'vue'
import type { MailingApi } from './useMailingApi'
import type { EditorActions } from './useEditorActions'
import type { EditorSession } from './useEditorSession'
import type { EditorState } from './useTemplateEditor'
import { RECORD_LABEL_STATE_KEY, recordLabelFor } from '../utils/editor-route'
import type { RecordLabel } from '../utils/editor-route'

/** What the focused token field exposes to the Variables tab. */
export interface TokenFieldHandle {
	insert: (path: string) => void
}

export interface EditorContext {
	editor: EditorState
	session: EditorSession
	actions: EditorActions
	api: MailingApi
	templateId: string
}

const EDITOR_KEY: InjectionKey<EditorContext> = Symbol('dms-mailing-editor')
const MISSING_CONTEXT = 'useEditorContext() must be called inside MailingEditor'

export function provideEditorContext(context: EditorContext): void {
	provide(EDITOR_KEY, context)
}

export function useEditorContext(): EditorContext {
	const context = inject(EDITOR_KEY, null)
	if (!context) throw new Error(MISSING_CONTEXT)
	return context
}

/**
 * Names the editor's page in the DMS breadcrumb (Mailing › Templates ›
 * <name>), through the record label state the core's breadcrumb reads. The
 * one place that knows that key, so a public DMS composable can replace it.
 */
export function useRecordLabel(): (name: string | undefined) => void {
	const route = useDmsRoute()
	const path = route.path
	const state = useDmsState<RecordLabel | null>(
		RECORD_LABEL_STATE_KEY,
		() => null,
	)
	return (name) => {
		state.value = recordLabelFor(path, name)
	}
}
