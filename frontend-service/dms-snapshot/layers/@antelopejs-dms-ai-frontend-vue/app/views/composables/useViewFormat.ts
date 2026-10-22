import { formatClock, formatMoment, type MomentOptions } from "../utils/moment";
import { bareToolName, readableToolName } from "../utils/tools";

const TOOL_LEXICON_PREFIX = "dms_ai.tools";
const I18N_PATH_SEPARATOR = ".";
const I18N_KEY_SIGIL = "$";

export interface ViewFormat {
	/** "Today 14:02", "Mon 17:20", "Sep 24". */
	moment: (ms: number, withSeconds?: boolean) => string;
	/** "09:58". */
	clock: (ms: number) => string;
	/** The tool's name in the panel's lexicon, else a readable form of it. */
	toolLabel: (tool: string) => string;
	/** A server message, translated when it is an i18n key (`$` or bare). */
	serverMessage: (message: string) => string;
}

/**
 * The formatters every workspace view shares, bound to the user's language
 * and regional preferences.
 */
export function useViewFormat(): ViewFormat {
	const { t, te } = useI18n();
	const regional = useRegionalFormat();

	function momentOptions(withSeconds: boolean): MomentOptions {
		return {
			format: (options) => regional.dateTimeFormat(options),
			t: (key, params) => t(key, params ?? {}),
			nowMs: Date.now(),
			withSeconds,
		};
	}

	function toolLabel(tool: string): string {
		const name = bareToolName(tool);
		if (name.includes(I18N_PATH_SEPARATOR)) return readableToolName(tool);
		const key = `${TOOL_LEXICON_PREFIX}.${name}.label`;
		return te(key) ? t(key) : readableToolName(tool);
	}

	function serverMessage(message: string): string {
		const key = message.startsWith(I18N_KEY_SIGIL) ? message.slice(1) : message;
		return te(key) ? t(key) : message;
	}

	return {
		serverMessage,
		moment: (ms, withSeconds = false) =>
			formatMoment(ms, momentOptions(withSeconds)),
		clock: (ms) => formatClock(ms, momentOptions(false)),
		toolLabel,
	};
}
