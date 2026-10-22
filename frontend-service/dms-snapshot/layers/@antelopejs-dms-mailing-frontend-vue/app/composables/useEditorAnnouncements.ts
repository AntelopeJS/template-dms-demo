import { watch } from 'vue'
import type { EditorAnnouncement, EditorState } from './useTemplateEditor'
import { blockLabelKey } from '../utils/blocks'

const KEY = 'dms_mailing.editor'
const UNDO_KEY = 'dms_mailing.editor.save_state.undo'

/**
 * Turns the editor's announcements into toasts: a deleted block (with an Undo
 * action), an undo or redo that switched to another locale.
 */
export function useEditorAnnouncements(editor: EditorState): void {
	const { t } = useI18n()
	const toast = useToast()

	function messageOf(announcement: EditorAnnouncement): string {
		const count = announcement.count ?? 0
		const params = {
			block: announcement.blockType
				? t(blockLabelKey(announcement.blockType))
				: '',
			locale: (announcement.locale ?? '').toUpperCase(),
			count,
		}
		return t(`${KEY}.${announcement.kind}`, params, count)
	}

	function undoAction(present: string) {
		return {
			label: t(UNDO_KEY),
			color: 'neutral' as const,
			variant: 'outline' as const,
			onClick: () => editor.undoIfLatest(present),
		}
	}

	watch(
		() => editor.announcement?.serial,
		() => {
			const announcement = editor.announcement
			if (!announcement) return
			toast.add({
				title: messageOf(announcement),
				color: 'neutral',
				...(announcement.undoable
					? { actions: [undoAction(announcement.undoable)] }
					: {}),
			})
		},
	)
}
