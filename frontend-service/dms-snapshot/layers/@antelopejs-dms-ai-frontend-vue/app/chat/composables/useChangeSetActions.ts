import { type Ref, ref, watch } from "vue";
import { CLIENT_MESSAGE_TYPES } from "../constants/protocol";
import type { ChangeSetSummary } from "../types/protocol";

/** What the dashboard's authenticated fetch gives the chat. */
export interface ChatApi {
	get: <T>(path: string) => Promise<T>;
	post: <T>(path: string, body?: unknown) => Promise<T>;
}

export interface UndoConflict {
	changeSetId: string;
	number: number;
	title: string;
	files: string[];
}

interface UndoPreview {
	conflicts?: UndoConflict[];
}

/** An undo waiting on the user: later sets touch the same files. */
interface PendingUndo {
	changeSetId: string;
	number: number;
	conflicts: UndoConflict[];
}

export interface UseChangeSetActionsOptions {
	activeId: Ref<string>;
	changeSets: Ref<Record<string, ChangeSetSummary>>;
	send: (msg: object) => boolean;
	api: ChatApi | null;
}

export interface UseChangeSetActionsResult {
	busyIds: Ref<ReadonlySet<string>>;
	pendingUndo: Ref<PendingUndo | null>;
	undo: (changeSetId: string) => Promise<void>;
	redo: (changeSetId: string) => void;
	/** Answers the conflict question: with the later sets, or this one alone. */
	confirmUndo: (includeLater: boolean) => void;
	cancelUndo: () => void;
}

const BUSY_TIMEOUT_MS = 10_000;

function undoPreviewPath(changeSetId: string): string {
	return `/ai/changes/${encodeURIComponent(changeSetId)}/undo-preview`;
}

/**
 * Undo and Redo from the chat's change set cards. Undo first asks the backend
 * which later sets touch the same files, and lets the user choose when some
 * do, since undoing one alone may leave code that does not compile.
 */
export function useChangeSetActions(
	options: UseChangeSetActionsOptions,
): UseChangeSetActionsResult {
	const busyIds = ref<ReadonlySet<string>>(new Set());
	const stateAtAction = new Map<string, string | undefined>();
	const pendingUndo = ref<PendingUndo | null>(null);

	const setBusy = (id: string, isBusy: boolean): void => {
		const next = new Set(busyIds.value);
		if (isBusy) next.add(id);
		else next.delete(id);
		busyIds.value = next;
	};

	const act = (
		changeSetId: string,
		action: "undo" | "redo",
		includeLater = false,
	): void => {
		const isSent = options.send({
			type: CLIENT_MESSAGE_TYPES.CHANGE_SET_ACTION,
			conversationId: options.activeId.value,
			changeSetId,
			action,
			...(includeLater ? { includeLater: true } : {}),
		});
		if (!isSent) return;
		stateAtAction.set(
			changeSetId,
			options.changeSets.value[changeSetId]?.state,
		);
		setBusy(changeSetId, true);
		setTimeout(() => setBusy(changeSetId, false), BUSY_TIMEOUT_MS);
	};

	watch(options.changeSets, (sets) => {
		const settled = [...busyIds.value].filter(
			(id) => sets[id]?.state !== stateAtAction.get(id),
		);
		settled.forEach((id) => setBusy(id, false));
	});

	const conflictsOf = async (changeSetId: string): Promise<UndoConflict[]> => {
		if (options.api === null) return [];
		try {
			const preview = await options.api.get<UndoPreview>(
				undoPreviewPath(changeSetId),
			);
			return preview.conflicts ?? [];
		} catch {
			return [];
		}
	};

	const undo = async (changeSetId: string): Promise<void> => {
		const conflicts = await conflictsOf(changeSetId);
		if (conflicts.length === 0) {
			act(changeSetId, "undo");
			return;
		}
		const number = options.changeSets.value[changeSetId]?.number ?? 0;
		pendingUndo.value = { changeSetId, number, conflicts };
	};

	return {
		busyIds,
		pendingUndo,
		undo,
		redo: (changeSetId) => act(changeSetId, "redo"),
		confirmUndo: (includeLater) => {
			const pending = pendingUndo.value;
			pendingUndo.value = null;
			if (pending !== null) act(pending.changeSetId, "undo", includeLater);
		},
		cancelUndo: () => {
			pendingUndo.value = null;
		},
	};
}
