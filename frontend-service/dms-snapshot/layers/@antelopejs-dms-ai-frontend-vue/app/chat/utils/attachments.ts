import {
	INLINE_IMAGE_MIME_TYPES,
	MAX_ATTACHMENT_BYTES,
} from "../constants/attachments";
import { newUuid } from "./ids";

/**
 * A file the user has staged in the composer. `data` is the base64 payload (no
 * `data:` prefix) sent to the sidecar; `dataUrl` is the full data URL kept for
 * local image previews.
 */
export interface PendingAttachment {
	id: string;
	name: string;
	mimeType: string;
	size: number;
	data: string;
	dataUrl: string;
}

export function isInlineImage(mimeType: string): boolean {
	return (INLINE_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function formatBytes(size: number): string {
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function exceedsSizeLimit(file: File): boolean {
	return file.size > MAX_ATTACHMENT_BYTES;
}

/** The base64 payload of a data URL, without its `data:…;base64,` prefix. */
export function splitDataUrl(dataUrl: string): string {
	const comma = dataUrl.indexOf(",");
	return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/**
 * Read a File into a PendingAttachment (base64 + data URL) via FileReader. The
 * browser never exposes the real disk path, so we always carry the bytes.
 */
export function readFileAsAttachment(file: File): Promise<PendingAttachment> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error("read failed"));
		reader.onload = () => {
			const dataUrl = String(reader.result);
			resolve({
				id: newUuid(),
				name: file.name,
				mimeType: file.type || "application/octet-stream",
				size: file.size,
				data: splitDataUrl(dataUrl),
				dataUrl,
			});
		};
		reader.readAsDataURL(file);
	});
}
