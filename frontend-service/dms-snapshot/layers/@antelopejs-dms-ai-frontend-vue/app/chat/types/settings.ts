import type { ApprovalMode, ProviderName, Scope } from "./protocol";

export type ThinkingLevel = "off" | "low" | "medium" | "high";
export type { ProviderName };

export interface ProviderAvailability {
	available: boolean;
	/** Why the provider cannot be picked; absent when it is available. */
	reason?: string;
}

export interface AppSettings {
	provider: ProviderName;
	/** The default approval mode of new chats. */
	mode: ApprovalMode;
	thinking: ThinkingLevel;
	/** The default scope of new chats. */
	generationMode: Scope;
	allowLocalSkills: boolean;
	notifyRequests: boolean;
	requestTimeoutMinutes: number;
	/**
	 * Read-only capability pushed by the sidecar: whether the Builder is present.
	 */
	builderAvailable: boolean;
	/**
	 * Read-only capability pushed by the sidecar: which backends this install can
	 * actually drive.
	 */
	providers: Record<ProviderName, ProviderAvailability>;
}
