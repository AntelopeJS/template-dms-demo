import type { AppSettings } from "../types/settings";

const DEFAULT_REQUEST_TIMEOUT_MINUTES = 5;

export const DEFAULT_SETTINGS: AppSettings = {
	provider: "claude",
	mode: "normal",
	thinking: "medium",
	generationMode: "safe",
	allowLocalSkills: false,
	notifyRequests: true,
	requestTimeoutMinutes: DEFAULT_REQUEST_TIMEOUT_MINUTES,
	builderAvailable: false,
	providers: {
		claude: { available: true },
		codex: { available: false },
	},
};
