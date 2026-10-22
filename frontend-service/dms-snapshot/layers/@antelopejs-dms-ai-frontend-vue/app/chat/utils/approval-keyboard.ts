export type ApprovalKeyAction = "allow" | "deny" | "next" | "previous";

/** The slice of a keyboard event the approvals dock reads. */
export interface ApprovalKeyInput {
	key: string;
	shiftKey: boolean;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	/** The key went to a text field (a suggestion, a name to type): it is text. */
	isTextTarget: boolean;
}

const ACTION_BY_KEY: Record<string, ApprovalKeyAction> = {
	enter: "allow",
	n: "deny",
	j: "next",
	k: "previous",
};

/** ↵ allows, N denies, J and K move between requests; anything else is not ours. */
export function approvalKeyAction(
	input: ApprovalKeyInput,
): ApprovalKeyAction | null {
	if (input.isTextTarget) return null;
	if (input.metaKey || input.ctrlKey || input.altKey || input.shiftKey)
		return null;
	return ACTION_BY_KEY[input.key.toLowerCase()] ?? null;
}

const TEXT_TARGET_SELECTOR =
	"input, textarea, select, [contenteditable='true']";

/** Whether the element takes typed text, so the dock's letter keys stay text. */
export function isTextTarget(target: EventTarget | null): boolean {
	return (
		target instanceof Element && target.closest(TEXT_TARGET_SELECTOR) !== null
	);
}

/** The index after moving by `step` within `total`, wrapping around. */
export function stepIndex(
	current: number,
	step: number,
	total: number,
): number {
	if (total === 0) return 0;
	return (((current + step) % total) + total) % total;
}
