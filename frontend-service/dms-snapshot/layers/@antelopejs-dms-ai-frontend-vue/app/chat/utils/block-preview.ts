import { MESSAGE_ROLES } from "../constants/conversation";
import { lastMatching } from "./arrays";
import {
	BLOCK_PREVIEW_MAIN_TAB,
	BLOCK_PREVIEW_VARIANT_TAB_PREFIX,
	JSON_INDENT,
	REMOTE_URL,
	SAME_ORIGIN_PATH,
} from "../constants/block-preview";
import type { ConversationMessage, UserMessage } from "../types/conversation";
import type {
	BlockPreview,
	BlockPreviewReference,
	PreviewNode,
	PreviewTree,
	PreviewView,
} from "../types/protocol";

export interface BlockPreviewTab extends PreviewView {
	value: string;
	/** The view's own label; null for an unlabelled main view, named by the chat. */
	label: string | null;
}

/**
 * How the mockup is drawn: an image the page may load (an attachment of this
 * session, or a same-origin path), a link for an external URL — loading it
 * could send what the agent read to its address — or a note when the
 * attachment is gone (only its name survives a reload).
 */
export type ReferenceView = ImageReference | LinkReference | MissingReference;

interface ImageReference {
	kind: "image";
	src: string;
	name: string;
}

interface LinkReference {
	kind: "link";
	href: string;
}

interface MissingReference {
	kind: "missing";
	name: string;
}

export function rootsOf(tree: PreviewTree): PreviewNode[] {
	return Array.isArray(tree) ? tree : [tree];
}

function countIn(node: PreviewNode): number {
	return 1 + (node.children ?? []).reduce((sum, c) => sum + countIn(c), 0);
}

/** The blocks with no children under the node: what a row actually shows. */
export function countLeaves(node: PreviewNode): number {
	const children = node.children ?? [];
	if (children.length === 0) return 1;
	return children.reduce((sum, child) => sum + countLeaves(child), 0);
}

/** Every block of the tree, nested ones included; none without a tree. */
export function countBlocks(tree: PreviewTree | undefined): number {
	if (tree === undefined) return 0;
	return rootsOf(tree).reduce((sum, node) => sum + countIn(node), 0);
}

/** The block types at the top of the tree, for the card's subtitle. */
export function topBlockTypes(tree: PreviewTree | undefined): string[] {
	if (tree === undefined) return [];
	const names = rootsOf(tree).map(
		(node) => node.type ?? node.componentName ?? "",
	);
	return [...new Set(names.filter((name) => name !== ""))];
}

export function previewTabs(preview: BlockPreview): BlockPreviewTab[] {
	const variants = (preview.variants ?? []).map((variant, index) => ({
		value: `${BLOCK_PREVIEW_VARIANT_TAB_PREFIX}${index}`,
		label: variant.label,
		tree: variant.tree,
		sketch: variant.sketch,
	}));
	const main = {
		value: BLOCK_PREVIEW_MAIN_TAB,
		label: preview.label ?? null,
		tree: preview.tree,
		sketch: preview.sketch,
	};
	return [main, ...variants];
}

/** Whether any view of the preview proposes a custom sketch. */
export function hasSketch(preview: BlockPreview): boolean {
	return [preview, ...(preview.variants ?? [])].some(
		(view) => view.sketch !== undefined,
	);
}

export function formatTree(tree: PreviewTree): string {
	return JSON.stringify(tree, null, JSON_INDENT);
}

function isUser(message: ConversationMessage): message is UserMessage {
	return message.role === MESSAGE_ROLES.USER;
}

/** The latest image of that name the user attached in this session. */
function findAttachedImage(
	name: string,
	messages: readonly ConversationMessage[],
): string | null {
	const attachments = messages
		.filter(isUser)
		.flatMap((message) => message.attachments ?? []);
	const match = lastMatching(
		attachments,
		(attachment) =>
			attachment.name === name && attachment.dataUrl !== undefined,
	);
	return match?.dataUrl ?? null;
}

function viewOfUrl(url: string): ReferenceView | null {
	if (SAME_ORIGIN_PATH.test(url)) return { kind: "image", src: url, name: url };
	if (REMOTE_URL.test(url)) return { kind: "link", href: url };
	return null;
}

export function referenceView(
	reference: BlockPreviewReference | undefined,
	messages: readonly ConversationMessage[],
): ReferenceView | null {
	if (reference === undefined) return null;
	const name = reference.attachmentName;
	if (name !== undefined) {
		const src = findAttachedImage(name, messages);
		return src === null
			? { kind: "missing", name }
			: { kind: "image", src, name };
	}
	return reference.url === undefined ? null : viewOfUrl(reference.url);
}
