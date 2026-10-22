/** Names the DMS may register its block preview component under. */
export const BLOCK_PREVIEW_COMPONENT_NAMES = [
	"DmsBlockPreview",
	"dms-block-preview",
] as const;

export const BLOCK_PREVIEW_MAIN_TAB = "proposed";
export const BLOCK_PREVIEW_VARIANT_TAB_PREFIX = "variant-";

export const JSON_INDENT = 2;

/** Mirror of the sidecar's reference URL rules (sidecar/src/constants/preview.ts). */
export const SAME_ORIGIN_PATH = /^\/(?![/\\])/;
export const REMOTE_URL = /^https?:\/\//i;

/** Width the card's live thumbnail is laid out at before it is scaled down. */
export const THUMBNAIL_CANVAS_WIDTH_PX = 560;
export const THUMBNAIL_SCALE = 0.2;
/** Height a sketch is drawn at in the thumbnail, before the scale. */
export const THUMBNAIL_SKETCH_HEIGHT_PX = 360;

/** Most block types the card names before it counts the rest. */
export const CARD_TYPE_LIMIT = 2;

/** The schematic thumbnail drawn when the DMS cannot render the blocks. */
export const PLAN_MAX_ROWS = 3;
export const PLAN_MAX_CELLS = 4;
