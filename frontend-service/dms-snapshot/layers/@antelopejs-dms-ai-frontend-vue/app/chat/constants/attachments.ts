/**
 * Mirror of the sidecar's attachment limits (sidecar/src/constants/attachments.ts),
 * kept in sync by hand like the protocol's message types.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

/** Media types shown with an image thumbnail, and inlined natively by the agent. */
export const INLINE_IMAGE_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
] as const;

/** The size limit as the composer states it. */
export const MAX_ATTACHMENT_MEGABYTES = 25;
