import { type Component, getCurrentInstance } from "vue";
import { BLOCK_PREVIEW_COMPONENT_NAMES } from "../constants/block-preview";

/**
 * The DMS's `DmsBlockPreview`, looked up among the app's components rather
 * than imported: the chat must keep working on a DMS that predates it, where
 * the preview falls back to the tree as JSON.
 */
export function useBlockPreviewComponent(): Component | null {
	const components = getCurrentInstance()?.appContext.components ?? {};
	const name = BLOCK_PREVIEW_COMPONENT_NAMES.find(
		(candidate) => components[candidate] !== undefined,
	);
	return name === undefined ? null : components[name];
}
