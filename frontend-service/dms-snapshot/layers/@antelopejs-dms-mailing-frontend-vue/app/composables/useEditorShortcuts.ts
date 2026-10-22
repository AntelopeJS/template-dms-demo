import { onBeforeUnmount, onMounted } from 'vue'
import type { EditorActions } from './useEditorActions'
import type { EditorSession } from './useEditorSession'
import type { EditorState } from './useTemplateEditor'
import type { EditorShortcut } from '../utils/shortcuts'
import { isTypingTarget, matchShortcut } from '../utils/shortcuts'
import { TEMPLATES_PATH } from '../utils/pages'

const OPEN_DIALOG_SELECTOR =
	'[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'

type ShortcutHandlers = Record<EditorShortcut, () => void>

function handlersFor(
	editor: EditorState,
	actions: EditorActions,
): ShortcutHandlers {
	const withSelection = (run: (id: string) => void) => () => {
		if (editor.selectedId) run(editor.selectedId)
	}
	return {
		save: () => void actions.save(),
		publish: () => void actions.publish(),
		test: actions.test,
		search: editor.requestSearch,
		delete: withSelection(editor.removeBlockById),
		duplicate: withSelection(editor.duplicateBlockById),
		undo: editor.undo,
		redo: editor.redo,
		escape: () =>
			editor.selectedId
				? editor.select(null)
				: void navigateDms(TEMPLATES_PATH),
	}
}

/**
 * The editor's keyboard (ML-08): ⌘S, ⌘↵, T, /, ⌫, ⌘D, ⌘Z, Esc. Nothing fires
 * while a dialog is open, and single keys leave text fields alone.
 */
export function useEditorShortcuts(
	editor: EditorState,
	actions: EditorActions,
): void {
	const handlers = handlersFor(editor, actions)
	function onKeydown(event: KeyboardEvent): void {
		if (event.defaultPrevented || document.querySelector(OPEN_DIALOG_SELECTOR))
			return
		const shortcut = matchShortcut(event, isTypingTarget(event.target))
		if (!shortcut) return
		event.preventDefault()
		handlers[shortcut]()
	}
	onMounted(() => window.addEventListener('keydown', onKeydown))
	onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}

/**
 * Leaving the editor never loses work silently. A draft waiting for its
 * autosave is written on the way out (on unmount, or by a request outliving
 * a closed tab, after the browser's own prompt); a save that failed, a
 * conflict or unsaved test data ask the DMS "Discard unsaved changes?" first,
 * whether the user follows a link, goes back or reloads.
 */
export function useEditorLeaveGuard(session: EditorSession): void {
	useUnsavedChanges({ dirty: () => session.hasUnsavedWork })
	function onBeforeUnload(event: BeforeUnloadEvent): void {
		if (!session.isSaving) return
		event.preventDefault()
		event.returnValue = ''
	}
	const onPageHide = (): void => session.flush()
	onMounted(() => {
		window.addEventListener('beforeunload', onBeforeUnload)
		window.addEventListener('pagehide', onPageHide)
	})
	onBeforeUnmount(() => {
		window.removeEventListener('beforeunload', onBeforeUnload)
		window.removeEventListener('pagehide', onPageHide)
	})
}
