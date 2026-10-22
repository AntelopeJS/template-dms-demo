export const SIDECAR_INFO_PATH = "/ai/sidecar-info";
/** Event stream to receive, POST to send: HTTP the DMS frontend server relays. */
export const CHANNEL_PATH = "/ai/channel";
export const CHANNEL_EVENTS_PATH = `${CHANNEL_PATH}/events`;
export const CHANNEL_MESSAGES_SEGMENT = "messages";
export const CHANNEL_EVENT_READY = "ready";
/** A sidecar frame: the stream's default event name. */
export const CHANNEL_EVENT_FRAME = "message";
/**
 * How long the stream outlives a closed panel or a hidden tab, so a quick
 * close and reopen does not reconnect, while a tab left in the background soon
 * gives back its one of the browser's six HTTP/1.1 connections to the dashboard.
 */
export const CHANNEL_IDLE_STOP_MS = 2_000;
export const VISIBILITY_CHANGE_EVENT = "visibilitychange";
export const EVENT_STREAM_TYPE = "text/event-stream";
export const JSON_CONTENT_TYPE = "application/json";
export const CHANNEL_RECONNECT_DELAYS_MS = [
	1000, 2000, 4000, 8000, 15000, 30000,
] as const;
// Sidecar reachability, as seen by the host. `reviving` is the self-healing
// state (idle-exited / crashed-respawning): the probe loop revives the sidecar
// and the channels reconnect once it answers. `unavailable` is terminal (the
// crash budget is spent) and needs a reload.
export const SIDECAR_STATUS_CONNECTING = "connecting";
export const SIDECAR_STATUS_CONNECTED = "connected";
export const SIDECAR_STATUS_REVIVING = "reviving";
export const SIDECAR_STATUS_UNAVAILABLE = "unavailable";
// Re-probe cadence while reviving. Each probe also revives the daemon backend
// side, so this doubles as the respawn heartbeat; capped so a genuinely stuck
// sidecar is polled sparingly rather than hammered.
export const SIDECAR_POLL_DELAYS_MS = [500, 1000, 2000, 4000, 8000] as const;

export const CHANNEL_STATUS_CONNECTING = "connecting";
export const CHANNEL_STATUS_CONNECTED = "connected";
export const CHANNEL_STATUS_DISCONNECTED = "disconnected";
export const CHANNEL_STATUS_RECONNECTING = "reconnecting";
export const HOST_ROLE = "host";
export const HELLO_MESSAGE_TYPE = "hello";
export const LOG_PREFIX = "[dms-ai]";
export const HOST_STATE_UPDATE_TYPE = "host_state_update";
export const HOST_NAVIGATION_COMPLETE_TYPE = "host_navigation_complete";
export const HOST_COMMAND_NAVIGATE_TYPE = "host_command_navigate";
/** Frames of the tab's stream meant for the dashboard; every other one is the chat's. */
export const HOST_COMMAND_TYPES: ReadonlySet<string> = new Set([
	HOST_COMMAND_NAVIGATE_TYPE,
]);
export const TOGGLE_SHORTCUT_KEY = "k";
export const MODAL_OPEN_SELECTOR = '[role="dialog"][aria-modal="true"]';

export const CHAT_PANEL_COMPONENT_NAME = "DmsAiChatPanel";
/** The panel's id among the dashboard's docked side panels. */
export const SIDE_PANEL_ID = "dms-ai:assistant";
export const PANEL_DEFAULT_WIDTH_PX = 460;
export const PANEL_MIN_WIDTH_PX = 360;
/** Wide enough for a diff side by side; the DMS caps it at 60% of the window too. */
export const PANEL_MAX_WIDTH_PX = 820;
export const COMMAND_PALETTE_ASSISTANT_ID = "dms-ai:assistant";
export const PALETTE_ANSWER_COMPONENT_NAME = "DmsAiPaletteAnswer";
export const PALETTE_ASSISTANT_LABEL = "$dms_ai.panel.palette.assistant";
export const PALETTE_ASSISTANT_PLACEHOLDER =
	"$dms_ai.panel.palette.placeholder";
export const LAUNCHER_ACTION_ID = "dms-ai-launcher";
/**
 * The chat panel's header shows the same icon, which is what gets it into the
 * renderer's icon bundle.
 */
export const LAUNCHER_ICON = "i-ph-sparkle";
export const LAUNCHER_ORDER = 50;
export const LAUNCHER_LABEL_KEY = "dms_ai.panel.launcher";
/** The panel landmark's name, as an i18n key the DMS resolves. */
export const PANEL_ARIA_LABEL = `$${LAUNCHER_LABEL_KEY}`;
export const COMMAND_PALETTE_SOURCE_ID = "dms-ai";
export const COMMAND_PALETTE_ORDER = 60;
/** The backend's view of the sidecar: pending approvals, last start error. */
export const STATUS_PATH = "/ai/status";
export const RESTART_PATH = "/ai/sidecar/restart";
export const CHANGES_PATH = "/modules/ai/changes";
/**
 * How often a closed panel re-reads the pending approvals, so a request that
 * arrives while no stream is open still gets its toast.
 */
export const STATUS_POLL_MS = 15_000;
/** How long the panel's toasts stay up. */
export const TOAST_DURATION_MS = 8_000;
