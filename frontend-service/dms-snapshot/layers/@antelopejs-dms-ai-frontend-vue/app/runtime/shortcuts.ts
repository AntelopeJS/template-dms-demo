import { MODAL_OPEN_SELECTOR, TOGGLE_SHORTCUT_KEY } from "./constants";

export interface InstallToggleShortcutOptions {
	onToggle: () => void;
}

function isModalOpen(): boolean {
	return document.querySelector(MODAL_OPEN_SELECTOR) !== null;
}

function isToggleCombo(event: KeyboardEvent): boolean {
	const isModifierPressed = event.metaKey || event.ctrlKey;
	const isTargetKey = event.key.toLowerCase() === TOGGLE_SHORTCUT_KEY;
	// Require shift too — plain ctrl/cmd + k is the DMS search palette.
	return isModifierPressed && event.shiftKey && isTargetKey;
}

/** Toggles the panel on ⌘⇧K / Ctrl+Shift+K, from the page or the panel itself. */
export function installToggleShortcut(
	options: InstallToggleShortcutOptions,
): () => void {
	const handler = (event: KeyboardEvent): void => {
		if (!isToggleCombo(event)) return;
		if (isModalOpen()) return;
		event.preventDefault();
		options.onToggle();
	};
	document.addEventListener("keydown", handler);
	return () => document.removeEventListener("keydown", handler);
}
