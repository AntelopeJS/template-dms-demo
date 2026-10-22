import type { BlockContext } from '../utils/blocks'
import { useEditorContext } from './useEditorContext'

/**
 * What a block added from the palette or an insertion point borrows from the
 * template: its declared and detected variables and its category (the locale
 * comes from the editor itself).
 */
export function useBlockContext(): () => BlockContext {
	const { editor, session } = useEditorContext()
	return () => ({
		variables: editor.variables,
		detected: session.detected,
		category: session.state.template.category,
	})
}
