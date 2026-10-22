import { ref } from "vue";
import type {
	ChatI18n,
	TranslateParams,
} from "../../app/chat/composables/useChatI18n";
import en from "../../i18n/locales/dms-ai-panel-en-GB.json";

type Messages = Record<string, unknown>;

const PLURAL_SEPARATOR = " | ";

function lookup(messages: Messages, key: string): string | null {
	const value = key
		.split(".")
		.reduce<unknown>(
			(node, part) =>
				node !== null && typeof node === "object"
					? (node as Messages)[part]
					: undefined,
			messages,
		);
	return typeof value === "string" ? value : null;
}

/** vue-i18n's default choice: two forms are singular/plural, three add zero. */
function choose(forms: string[], count: number): string {
	if (forms.length === 2) return forms[count === 1 ? 0 : 1];
	return forms[Math.min(count, forms.length - 1)];
}

function interpolate(text: string, params: TranslateParams = {}): string {
	return text.replace(/\{(\w+)\}/g, (match, name: string) =>
		name in params ? String(params[name]) : match,
	);
}

/** The panel's English strings behind the chat's translator, as in the dashboard. */
export function createTestI18n(messages: Messages = en): ChatI18n {
	return {
		t: (key, params, plural) => {
			const text = lookup(messages, key);
			if (text === null) return key;
			const forms = text.split(PLURAL_SEPARATOR);
			const form = plural === undefined ? forms[0] : choose(forms, plural);
			return interpolate(form, params);
		},
		locale: ref("en-GB"),
	};
}
