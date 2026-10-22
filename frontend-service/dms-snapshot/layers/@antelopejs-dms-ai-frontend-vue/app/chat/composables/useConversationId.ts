import { STORAGE_CONVERSATION_ID_KEY } from "../constants/conversation";
import { newUuid } from "../utils/ids";

function readPersisted(): string | null {
	try {
		return window.localStorage.getItem(STORAGE_CONVERSATION_ID_KEY);
	} catch {
		return null;
	}
}

export function persistConversationId(id: string): void {
	try {
		window.localStorage.setItem(STORAGE_CONVERSATION_ID_KEY, id);
	} catch {
		return;
	}
}

export function resolveConversationId(): string {
	const existing = readPersisted();
	if (existing !== null && existing.length > 0) return existing;
	const next = newUuid();
	persistConversationId(next);
	return next;
}
