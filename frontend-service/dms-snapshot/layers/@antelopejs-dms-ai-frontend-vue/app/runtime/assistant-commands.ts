import type { Ref } from "vue";
import type { Translate } from "../chat/composables/useChatI18n";
import type { CurrentPage } from "../chat/types/conversation";
import { shortcutLabel } from "../chat/utils/platform";
import {
	type PageSuggestion,
	pageName,
	pageSuggestions,
} from "../chat/utils/suggestions";
import {
	CHAT_PANEL_COMPONENT_NAME,
	COMMAND_PALETTE_ASSISTANT_ID,
	COMMAND_PALETTE_ORDER,
	COMMAND_PALETTE_SOURCE_ID,
	LAUNCHER_ACTION_ID,
	LAUNCHER_ICON,
	LAUNCHER_LABEL_KEY,
	LAUNCHER_ORDER,
	PALETTE_ANSWER_COMPONENT_NAME,
	PALETTE_ASSISTANT_LABEL,
	PALETTE_ASSISTANT_PLACEHOLDER,
	PANEL_ARIA_LABEL,
	PANEL_DEFAULT_WIDTH_PX,
	PANEL_MAX_WIDTH_PX,
	PANEL_MIN_WIDTH_PX,
	SIDE_PANEL_ID,
	TOGGLE_SHORTCUT_KEY,
} from "./constants";

/** The panel, in the shape `registerSidePanel` takes. */
export interface AssistantSidePanel {
	id: string;
	component: string;
	ariaLabel: string;
	defaultWidth: number;
	minWidth: number;
	maxWidth: number;
}

/** The header button, in the shape `registerHeaderAction` takes. */
export interface LauncherAction {
	id: string;
	icon: string;
	label: string;
	order: number;
	sidePanelId: string;
}

/** One entry of the command palette. */
interface PaletteItem {
	id: string;
	label: string;
	icon: string;
	suffix?: string;
	onSelect: () => void;
}

interface PaletteGroup {
	id: string;
	label: string;
	items: PaletteItem[];
}

/** A command palette source, in the shape `registerCommandPaletteSource` takes. */
export interface PaletteSource {
	id: string;
	order: number;
	groups: () => PaletteGroup[];
}

/** A first prompt the palette's assistant mode offers. */
interface PaletteSuggestion {
	label: string;
	icon: string;
}

/** The palette's assistant mode, in the shape `registerCommandPaletteAssistant` takes. */
export interface PaletteAssistant {
	id: string;
	label: string;
	icon: string;
	placeholder: string;
	suggestions: () => PaletteSuggestion[];
	answerComponent: string;
}

/** What the palette's entries do. */
export interface AssistantCommandActions {
	ask: () => void;
	startConversation: () => void;
	reviewApprovals: () => void;
	openChanges: () => void;
}

/** The panel docked on the right of the dashboard; the DMS owns its state. */
export function assistantSidePanel(): AssistantSidePanel {
	return {
		id: SIDE_PANEL_ID,
		component: CHAT_PANEL_COMPONENT_NAME,
		ariaLabel: PANEL_ARIA_LABEL,
		defaultWidth: PANEL_DEFAULT_WIDTH_PX,
		minWidth: PANEL_MIN_WIDTH_PX,
		maxWidth: PANEL_MAX_WIDTH_PX,
	};
}

/**
 * "Assistant (⌘⇧K)": the launcher's label with its shortcut. The DMS toggles
 * the panel from it and draws it engaged while the panel is open.
 */
export function launcherAction(t: Translate): LauncherAction {
	return {
		id: LAUNCHER_ACTION_ID,
		icon: LAUNCHER_ICON,
		label: `${t(LAUNCHER_LABEL_KEY)} (${shortcutLabel(TOGGLE_SHORTCUT_KEY, true)})`,
		order: LAUNCHER_ORDER,
		sidePanelId: SIDE_PANEL_ID,
	};
}

/** The palette answers read-only: what it can answer in place comes first. */
function byReadOnlyFirst(
	suggestions: readonly PageSuggestion[],
): PageSuggestion[] {
	return [...suggestions].sort(
		(left, right) => Number(right.isReadOnly) - Number(left.isReadOnly),
	);
}

/**
 * The palette's assistant mode (Tab in ⌘K): first prompts that fit the page on
 * screen, as the panel's empty chat offers them, and an answer drawn by
 * `DmsAiPaletteAnswer`.
 */
export function paletteAssistant(
	t: Translate,
	currentPage: Readonly<Ref<CurrentPage | null>>,
): PaletteAssistant {
	return {
		id: COMMAND_PALETTE_ASSISTANT_ID,
		label: PALETTE_ASSISTANT_LABEL,
		icon: LAUNCHER_ICON,
		placeholder: PALETTE_ASSISTANT_PLACEHOLDER,
		suggestions: () => {
			const page = currentPage.value;
			return byReadOnlyFirst(pageSuggestions(page)).map((suggestion) => ({
				label: t(suggestion.textKey, { page: pageName(page) }),
				icon: suggestion.icon,
			}));
		},
		answerComponent: PALETTE_ANSWER_COMPONENT_NAME,
	};
}

/**
 * The assistant's commands among the palette's search results: ways into the
 * panel and its pages. Asking a question inline is the palette's assistant
 * mode, registered apart.
 */
export function paletteSource(
	t: Translate,
	pendingApprovals: Readonly<Ref<number>>,
	actions: AssistantCommandActions,
): PaletteSource {
	return {
		id: COMMAND_PALETTE_SOURCE_ID,
		order: COMMAND_PALETTE_ORDER,
		groups: () => [
			{
				id: `${COMMAND_PALETTE_SOURCE_ID}-assistant`,
				label: t("dms_ai.panel.palette.group"),
				items: [
					{
						id: "dms-ai-ask",
						label: t("dms_ai.panel.palette.ask"),
						icon: "i-ph-sparkle",
						suffix: shortcutLabel(TOGGLE_SHORTCUT_KEY, true),
						onSelect: actions.ask,
					},
					{
						id: "dms-ai-new",
						label: t("dms_ai.panel.palette.new"),
						icon: "i-ph-note-pencil",
						onSelect: actions.startConversation,
					},
					{
						id: "dms-ai-approvals",
						label: t("dms_ai.panel.palette.approvals"),
						icon: "i-ph-hand-palm",
						suffix:
							pendingApprovals.value > 0
								? t(
										"dms_ai.panel.palette.waiting",
										{ count: pendingApprovals.value },
										pendingApprovals.value,
									)
								: undefined,
						onSelect: actions.reviewApprovals,
					},
					{
						id: "dms-ai-changes",
						label: t("dms_ai.panel.palette.changes"),
						icon: "i-ph-git-diff",
						onSelect: actions.openChanges,
					},
				],
			},
		],
	};
}
