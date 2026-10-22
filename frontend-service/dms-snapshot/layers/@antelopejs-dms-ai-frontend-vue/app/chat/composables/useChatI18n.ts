import { type InjectionKey, inject, type Ref, ref } from "vue";

export type TranslateParams = Record<string, string | number>;

/** `t` of the dashboard's vue-i18n: a key, named parameters, a plural count. */
export type Translate = (
	key: string,
	params?: TranslateParams,
	plural?: number,
) => string;

/**
 * The chat's view of the dashboard's i18n. The plugin provides it from the DMS
 * runtime, so the chat itself imports nothing of the DMS and stays testable on
 * its own.
 */
export interface ChatI18n {
	t: Translate;
	/** The interface language, for dates and numbers. */
	locale: Readonly<Ref<string>>;
}

export const CHAT_I18N_KEY: InjectionKey<ChatI18n> = Symbol("dms-ai:i18n");

const FALLBACK_LOCALE = "en-GB";

const keyOnly: ChatI18n = {
	t: (key) => key,
	locale: ref(FALLBACK_LOCALE),
};

/** The chat's translator: the dashboard's when provided, the bare keys otherwise. */
export function useChatI18n(): ChatI18n {
	return inject(CHAT_I18N_KEY, keyOnly);
}
