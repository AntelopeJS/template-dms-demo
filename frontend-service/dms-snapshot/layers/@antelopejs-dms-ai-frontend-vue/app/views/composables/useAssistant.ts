import { getCurrentInstance, inject, onMounted, ref } from "vue";
import { useDmsRouter } from "#dms/frontend-module";
import { ASSISTANT_SESSION_KEY } from "../../runtime/assistant-session";

export interface AssistantActions {
	/** The assistant runs in this tab: its buttons can be offered. Reactive. */
	readonly isAvailable: boolean;
	openPanel: () => void;
	openConversation: (conversationId: string) => void;
	startConversation: (prompt?: string) => void;
	/** Opens a dashboard page, as its own links do. */
	goTo: (path: string) => void;
}

/**
 * The tab's assistant session as the workspace views use it. Until it runs
 * (its first probe pending) and without one (production, sidecar disabled) the
 * actions do nothing and `isAvailable` hides the buttons that need them.
 *
 * A view only offers them once mounted: the server never has a session, and a
 * probe that answered before the view hydrated would otherwise make the
 * browser render buttons the server's HTML lacks.
 */
export function useAssistant(): AssistantActions {
	const session = inject(ASSISTANT_SESSION_KEY, null);
	const router = useDmsRouter();
	const isMounted = ref(!getCurrentInstance());
	if (!isMounted.value) onMounted(() => (isMounted.value = true));
	return {
		get isAvailable() {
			return isMounted.value && (session?.value ?? null) !== null;
		},
		openPanel: () => session?.value?.panel.open(),
		openConversation: (conversationId) =>
			session?.value?.openConversation(conversationId),
		startConversation: (prompt) => session?.value?.startConversation(prompt),
		goTo: (path) => void router.push(path),
	};
}
