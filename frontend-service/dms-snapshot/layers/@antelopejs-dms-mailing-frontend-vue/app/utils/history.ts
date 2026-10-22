/** Undo / redo over serialized content snapshots. */
export interface EditorHistory {
	past: string[]
	future: string[]
	present: string
	lastChangeAt: number
}

/** Snapshots kept behind the present one. */
export const HISTORY_LIMIT = 50

/** Changes closer than this merge into one step (a word typed, a drag). */
export const HISTORY_COALESCE_MS = 700

export function createHistory(snapshot: string): EditorHistory {
	return { past: [], future: [], present: snapshot, lastChangeAt: 0 }
}

/** No change merges into a step closed with this timestamp. */
const CLOSED_STEP = Number.NEGATIVE_INFINITY

/**
 * Records the content after a change. A change within the coalescing window
 * of the previous one extends its step instead of opening a new one; the
 * oldest steps fall off past the limit. A discrete change (a deletion, a
 * move) always is a step of its own, so one undo reverts exactly it.
 */
export function recordChange(
	history: EditorHistory,
	snapshot: string,
	now: number,
	isDiscrete = false,
): void {
	if (snapshot === history.present) return
	const isNewStep =
		isDiscrete ||
		now - history.lastChangeAt >= HISTORY_COALESCE_MS ||
		history.past.length === 0
	if (isNewStep) {
		history.past.push(history.present)
		if (history.past.length > HISTORY_LIMIT) history.past.shift()
	}
	history.present = snapshot
	history.future = []
	history.lastChangeAt = isDiscrete ? CLOSED_STEP : now
}

/** Steps back; the snapshot to restore, or `null` at the oldest one. */
export function undoChange(history: EditorHistory): string | null {
	const previous = history.past.pop()
	if (previous === undefined) return null
	history.future.push(history.present)
	history.present = previous
	history.lastChangeAt = 0
	return previous
}

/** Steps forward again; `null` when nothing was undone. */
export function redoChange(history: EditorHistory): string | null {
	const next = history.future.pop()
	if (next === undefined) return null
	history.past.push(history.present)
	history.present = next
	history.lastChangeAt = 0
	return next
}
