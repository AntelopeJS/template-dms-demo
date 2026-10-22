import { type Ref, ref } from "vue";

/** Opens the panel on a stored conversation. */
interface OpenConversationIntent {
	kind: "open";
	conversationId: string;
}

/** Opens the panel on a new conversation, the composer optionally prefilled. */
interface StartConversationIntent {
	kind: "start";
	prompt?: string;
}

/** Puts the caret in the composer of the current conversation. */
interface FocusComposerIntent {
	kind: "focus";
}

/** Brings the approvals dock forward. */
interface ReviewApprovalsIntent {
	kind: "approvals";
}

export type PanelIntent =
	| OpenConversationIntent
	| StartConversationIntent
	| FocusComposerIntent
	| ReviewApprovalsIntent;

/**
 * What the dashboard asked the panel to do: open a chat, start one, focus the
 * composer. The chat may not be mounted yet when it is asked, so the latest
 * request waits here until the chat takes it.
 */
export interface PanelIntents {
	pending: Readonly<Ref<PanelIntent | null>>;
	push: (intent: PanelIntent) => void;
	take: () => PanelIntent | null;
}

export function createPanelIntents(): PanelIntents {
	const pending = ref<PanelIntent | null>(null);
	return {
		pending,
		push: (intent) => {
			pending.value = intent;
		},
		take: () => {
			const intent = pending.value;
			pending.value = null;
			return intent;
		},
	};
}
