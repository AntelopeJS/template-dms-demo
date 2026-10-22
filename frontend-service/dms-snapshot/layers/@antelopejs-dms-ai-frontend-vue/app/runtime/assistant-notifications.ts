import { type Ref, watch } from "vue";
import type { Translate } from "../chat/composables/useChatI18n";
import type { ChangeSetSummary } from "../chat/types/protocol";
import type { ChatTransport } from "./chat-transport";
import { TOAST_DURATION_MS } from "./constants";
import { isTypedMessage } from "./typed-message";

/** One button of a toast, as Nuxt UI's `useToast().add` takes it. */
interface ToastAction {
	label: string;
	color?: "secondary" | "neutral";
	variant?: "solid" | "outline";
	onClick: () => void;
}

interface ToastInput {
	title: string;
	description?: string;
	icon: string;
	color: "secondary";
	duration: number;
	actions: ToastAction[];
}

export interface AssistantNotificationsOptions {
	chat: ChatTransport;
	isPanelOpen: Readonly<Ref<boolean>>;
	pendingApprovals: Readonly<Ref<number>>;
	t: Translate;
	toast: (input: ToastInput) => void;
	reviewApprovals: (conversationId?: string) => void;
	undoChangeSet: (changeSet: ChangeSetSummary) => void;
	reviewChangeSet: (changeSetId: string) => void;
}

interface PermissionRequestFrame {
	type: "permission_request";
	conversationId?: string;
	summary?: string;
}

interface ChangeSetFrame {
	type: "change_set";
	changeSet?: ChangeSetSummary;
}

interface SettingsFrame {
	type: "settings_update";
	settings?: SettingsFlags;
}

interface SettingsFlags {
	notifyRequests?: boolean;
}

const ICON = "i-ph-sparkle";

interface NotifierState {
	options: AssistantNotificationsOptions;
	isEnabled: boolean;
	announcedApprovals: number;
	seenChangeSets: Set<string>;
}

function approvalToast(
	state: NotifierState,
	title: string,
	conversationId?: string,
): void {
	const { t, toast, reviewApprovals, pendingApprovals } = state.options;
	const count = Math.max(pendingApprovals.value, 1);
	state.announcedApprovals = count;
	toast({
		title,
		description: t("dms_ai.panel.toast.approvals_waiting", { count }, count),
		icon: ICON,
		color: "secondary",
		duration: TOAST_DURATION_MS,
		actions: [
			{
				label: t("dms_ai.panel.toast.review"),
				color: "secondary",
				onClick: () => reviewApprovals(conversationId),
			},
			{
				label: t("dms_ai.panel.toast.later"),
				color: "neutral",
				variant: "outline",
				onClick: () => undefined,
			},
		],
	});
}

function onPermissionRequest(
	state: NotifierState,
	frame: PermissionRequestFrame,
): void {
	if (state.options.isPanelOpen.value || !state.isEnabled) return;
	const title = frame.summary
		? t(state, "dms_ai.panel.toast.request_title", { summary: frame.summary })
		: t(state, "dms_ai.panel.toast.request_generic");
	approvalToast(state, title, frame.conversationId);
}

function t(
	state: NotifierState,
	key: string,
	params?: Record<string, string | number>,
): string {
	return state.options.t(key, params);
}

function onChangeSet(state: NotifierState, frame: ChangeSetFrame): void {
	const set = frame.changeSet;
	if (set === undefined || state.seenChangeSets.has(set.id)) return;
	state.seenChangeSets.add(set.id);
	if (set.state !== "applied" || state.options.isPanelOpen.value) return;
	const { toast, undoChangeSet, reviewChangeSet } = state.options;
	toast({
		title: t(state, "dms_ai.panel.toast.applied", { number: set.number }),
		description: set.title,
		icon: ICON,
		color: "secondary",
		duration: TOAST_DURATION_MS,
		actions: [
			{
				label: t(state, "dms_ai.panel.change.undo"),
				color: "neutral",
				variant: "outline",
				onClick: () => undoChangeSet(set),
			},
			{
				label: t(state, "dms_ai.panel.change.review"),
				color: "secondary",
				onClick: () => reviewChangeSet(set.id),
			},
		],
	});
}

const FRAME_HANDLERS: Record<
	string,
	(state: NotifierState, frame: never) => void
> = {
	permission_request: onPermissionRequest,
	change_set: onChangeSet,
	settings_update: (state, frame: SettingsFrame) => {
		state.isEnabled = frame.settings?.notifyRequests !== false;
	},
};

/**
 * DMS toasts for what happens while the panel is closed: a request waiting
 * for the user (when the settings allow it) and a change set just applied,
 * with Undo. A request the stream did not carry is caught by the polled count.
 */
export function installAssistantNotifications(
	options: AssistantNotificationsOptions,
): () => void {
	const state: NotifierState = {
		options,
		isEnabled: true,
		announcedApprovals: options.pendingApprovals.value,
		seenChangeSets: new Set(),
	};
	const stopListening = options.chat.onMessage((msg) => {
		if (!isTypedMessage(msg)) return;
		FRAME_HANDLERS[msg.type]?.(state, msg as never);
	});
	const stopWatching = watch(options.pendingApprovals, (count) => {
		const isNew = count > state.announcedApprovals;
		if (!isNew) state.announcedApprovals = count;
		if (!isNew || options.isPanelOpen.value || !state.isEnabled) return;
		approvalToast(state, t(state, "dms_ai.panel.toast.request_generic"));
	});
	return () => {
		stopListening();
		stopWatching();
	};
}
