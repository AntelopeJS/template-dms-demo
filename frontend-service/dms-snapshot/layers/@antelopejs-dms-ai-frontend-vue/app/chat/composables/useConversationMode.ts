import { computed, type ComputedRef, type Ref } from "vue";
import { CLIENT_MESSAGE_TYPES } from "../constants/protocol";
import type {
	ApprovalMode,
	ConversationModeState,
	FullAutoDuration,
	Scope,
} from "../types/protocol";
import type { AppSettings } from "../types/settings";

export interface UseConversationModeOptions {
	activeId: Ref<string>;
	/** What the sidecar last said of this chat's mode; null before it did. */
	mode: Ref<ConversationModeState | null>;
	settings: Ref<AppSettings>;
	send: (msg: object) => boolean;
}

export interface UseConversationModeResult {
	/** The chat's mode, its scope and Full auto, defaults until the sidecar says. */
	current: ComputedRef<ConversationModeState>;
	setMode: (mode: ApprovalMode) => void;
	setScope: (scope: Scope) => void;
	startFullAuto: (duration: FullAutoDuration) => void;
	stopFullAuto: () => void;
}

function effectiveScope(scope: Scope, builderAvailable: boolean): Scope {
	return builderAvailable ? scope : "vibe";
}

/**
 * The active chat's approval mode, scope and Full auto: what the sidecar says,
 * or the defaults for new chats from the settings until it has. Changes apply
 * at once here and are sent for the sidecar to confirm.
 */
export function useConversationMode(
	options: UseConversationModeOptions,
): UseConversationModeResult {
	const current = computed<ConversationModeState>(() => {
		const { settings, mode } = options;
		const base: ConversationModeState = mode.value ?? {
			mode: settings.value.mode,
			generationMode: settings.value.generationMode,
			fullAuto: null,
		};
		return {
			...base,
			generationMode: effectiveScope(
				base.generationMode,
				settings.value.builderAvailable,
			),
		};
	});

	const change = (patch: Partial<ConversationModeState>): void => {
		const isSent = options.send({
			type: CLIENT_MESSAGE_TYPES.SET_CONVERSATION_MODE,
			conversationId: options.activeId.value,
			...patch,
		});
		if (!isSent) return;
		options.mode.value = { ...current.value, ...patch };
	};

	return {
		current,
		setMode: (mode) => change({ mode }),
		setScope: (generationMode) => change({ generationMode }),
		startFullAuto: (duration) => change({ fullAuto: { duration } }),
		stopFullAuto: () => change({ fullAuto: null }),
	};
}
