import { ref, type Ref } from "vue";
import { AI_ROUTES } from "../constants";
import type { ChangeSetSummary } from "../types";
import { classifyFailure, errorMessage } from "./useAiData";

export interface ChangeSetActions {
	isBusy: Ref<boolean>;
	/** Asks the undo dialog the server words, then undoes from inside it. */
	undo: (changeSet: ChangeSetSummary) => Promise<void>;
	redo: (changeSet: ChangeSetSummary) => Promise<void>;
}

const AI_COLOR = "secondary";

interface UndoResult {
	undone: string[];
}

function changeSetPath(changeSetId: string, action: string): string {
	return `${AI_ROUTES.changes}/${encodeURIComponent(changeSetId)}/${action}`;
}

/**
 * Undo and redo of a change set, each confirmed by a toast; the page is read
 * again once the sidecar has restored the files, and the action stays busy
 * until it is: the set shows its new state before it can be acted on again.
 */
export function useChangeSetActions(): ChangeSetActions {
	const { t } = useI18n();
	const toast = useToast();
	const { $authFetch } = useAuthFetch();
	const { confirmFrom } = useConfirmFrom();
	const isBusy = ref(false);

	function failureToast(error: unknown): void {
		const failure = classifyFailure(error);
		toast.add({
			title: t(`dms_ai.views.${failure}.title`),
			description:
				failure === "error"
					? errorMessage(error)
					: t("dms_ai.views.unavailable.description"),
			color: "error",
			icon: "i-ph-warning-circle",
		});
	}

	async function redo(changeSet: ChangeSetSummary): Promise<void> {
		isBusy.value = true;
		try {
			await $authFetch(changeSetPath(changeSet.id, "redo"), {
				method: "POST",
				body: {},
			});
			toast.add({
				title: t("dms_ai.views.toast.redone", { number: changeSet.number }),
				color: AI_COLOR,
				icon: "i-ph-arrow-clockwise",
			});
			await refreshPageBlocks();
		} catch (error) {
			failureToast(error);
		} finally {
			isBusy.value = false;
		}
	}

	async function sendUndo(
		changeSet: ChangeSetSummary,
		values: Record<string, unknown>,
	): Promise<void> {
		const result = await $authFetch<UndoResult>(
			changeSetPath(changeSet.id, "undo"),
			{ method: "POST", body: values },
		);
		const count = result.undone.length;
		toast.add({
			title: t("dms_ai.views.toast.undone", { number: changeSet.number }),
			description: t("dms_ai.views.toast.undone_description", { count }, count),
			color: AI_COLOR,
			icon: "i-ph-arrow-counter-clockwise",
			actions: [
				{
					label: t("dms_ai.views.changes.redo"),
					icon: "i-ph-arrow-clockwise",
					color: "neutral",
					variant: "outline",
					onClick: () => void redo(changeSet),
				},
			],
		});
		await refreshPageBlocks();
	}

	async function undo(changeSet: ChangeSetSummary): Promise<void> {
		await confirmFrom(AI_ROUTES.changeUndoConfirm, {
			params: { id: changeSet.id, number: changeSet.number },
			onConfirm: (values) => sendUndo(changeSet, values),
		});
	}

	return { isBusy, undo, redo };
}
