interface UserAgentData {
	platform?: string;
}

interface NavigatorUserAgentData {
	userAgentData?: UserAgentData;
}

const APPLE_PLATFORM = /mac|iphone|ipad|ipod/i;
const APPLE_MODIFIER = "⌘";
const OTHER_MODIFIER = "Ctrl+";
const APPLE_SHIFT = "⇧";
const OTHER_SHIFT = "Shift+";

/**
 * Shortcuts accept meta or ctrl, so hints show the modifier each platform
 * actually uses: ⌘ on Apple, Ctrl elsewhere.
 */
function isApplePlatform(): boolean {
	const nav = globalThis.navigator as
		| (Navigator & NavigatorUserAgentData)
		| undefined;
	if (nav === undefined) return false;
	const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
	return APPLE_PLATFORM.test(platform);
}

/** "⌘J" or "Ctrl+J"; with `withShift`, "⌘⇧K" or "Ctrl+Shift+K". */
export function shortcutLabel(key: string, withShift = false): string {
	const isApple = isApplePlatform();
	const modifier = isApple ? APPLE_MODIFIER : OTHER_MODIFIER;
	const shift = withShift ? (isApple ? APPLE_SHIFT : OTHER_SHIFT) : "";
	return `${modifier}${shift}${key.toUpperCase()}`;
}
