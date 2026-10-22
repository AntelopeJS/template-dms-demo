import { type Ref, ref } from "vue";
import {
	MAX_ATTACHMENT_MEGABYTES,
	MAX_ATTACHMENTS,
} from "../constants/attachments";
import {
	exceedsSizeLimit,
	type PendingAttachment,
	readFileAsAttachment,
} from "../utils/attachments";
import type { Translate } from "./useChatI18n";

export interface UseComposerAttachmentsResult {
	attachments: Ref<PendingAttachment[]>;
	error: Ref<string>;
	isDragging: Ref<boolean>;
	add: (files: FileList | File[]) => Promise<void>;
	remove: (id: string) => void;
	clear: () => void;
	onDragEnter: (event: DragEvent) => void;
	onDragOver: (event: DragEvent) => void;
	onDragLeave: () => void;
	onDrop: (event: DragEvent) => void;
}

function hasFiles(event: DragEvent): boolean {
	return event.dataTransfer?.types.includes("Files") ?? false;
}

/**
 * The files staged in the composer: picked, pasted or dropped, within the
 * sidecar's limits, each problem said in the user's language.
 */
export function useComposerAttachments(
	t: Translate,
	isDisabled: () => boolean,
): UseComposerAttachmentsResult {
	const attachments = ref<PendingAttachment[]>([]);
	const error = ref("");
	const isDragging = ref(false);
	let dragDepth = 0;

	async function readOne(file: File): Promise<void> {
		if (exceedsSizeLimit(file)) {
			error.value = t("dms_ai.panel.composer.file_too_large", {
				name: file.name,
				max: MAX_ATTACHMENT_MEGABYTES,
			});
			return;
		}
		try {
			attachments.value = [
				...attachments.value,
				await readFileAsAttachment(file),
			];
		} catch {
			error.value = t("dms_ai.panel.composer.file_unreadable", {
				name: file.name,
			});
		}
	}

	async function add(files: FileList | File[]): Promise<void> {
		error.value = "";
		const incoming = Array.from(files);
		const room = MAX_ATTACHMENTS - attachments.value.length;
		if (incoming.length > room)
			error.value = t("dms_ai.panel.composer.too_many_files", {
				max: MAX_ATTACHMENTS,
			});
		for (const file of incoming.slice(0, Math.max(room, 0)))
			await readOne(file);
	}

	function onDrop(event: DragEvent): void {
		dragDepth = 0;
		isDragging.value = false;
		const files = event.dataTransfer?.files;
		if (isDisabled() || files === undefined || files.length === 0) return;
		event.preventDefault();
		void add(files);
	}

	return {
		attachments,
		error,
		isDragging,
		add,
		remove: (id) => {
			attachments.value = attachments.value.filter((att) => att.id !== id);
		},
		clear: () => {
			attachments.value = [];
			error.value = "";
		},
		onDragEnter: (event) => {
			if (isDisabled() || !hasFiles(event)) return;
			dragDepth += 1;
			isDragging.value = true;
		},
		onDragOver: (event) => {
			if (!isDisabled() && hasFiles(event)) event.preventDefault();
		},
		onDragLeave: () => {
			if (dragDepth === 0) return;
			dragDepth -= 1;
			if (dragDepth === 0) isDragging.value = false;
		},
		onDrop,
	};
}
