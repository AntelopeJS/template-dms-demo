import { type Ref, ref } from "vue";
import { DEFAULT_SETTINGS } from "../constants/settings";
import { SERVER_EVENT_TYPES } from "../constants/protocol";
import type {
	AppSettings,
	ProviderAvailability,
	ProviderName,
} from "../types/settings";

export interface UseSettingsOptions {
	onMessage: (handler: (msg: unknown) => void) => () => void;
}

export interface UseSettingsResult {
	settings: Ref<AppSettings>;
}

interface SettingsUpdateEvent {
	type: typeof SERVER_EVENT_TYPES.SETTINGS_UPDATE;
	settings?: Partial<AppSettings>;
	builderAvailable?: boolean;
	providers?: Record<ProviderName, ProviderAvailability>;
}

function isSettingsUpdate(msg: unknown): msg is SettingsUpdateEvent {
	if (msg === null || typeof msg !== "object") return false;
	return Reflect.get(msg, "type") === SERVER_EVENT_TYPES.SETTINGS_UPDATE;
}

/** The pushed settings over the defaults. */
function readSettings(event: SettingsUpdateEvent): AppSettings {
	return {
		...DEFAULT_SETTINGS,
		...event.settings,
		builderAvailable: event.builderAvailable ?? false,
		providers: event.providers ?? DEFAULT_SETTINGS.providers,
	};
}

/** The sidecar's settings, as it pushes them; the Settings page edits them. */
export function useSettings(options: UseSettingsOptions): UseSettingsResult {
	const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS });

	options.onMessage((msg: unknown): void => {
		if (!isSettingsUpdate(msg)) return;
		settings.value = readSettings(msg);
	});

	return { settings };
}
