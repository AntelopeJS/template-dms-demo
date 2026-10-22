import { defineDmsPlugin } from "#dms/frontend-module";
import { assistantSidePanel } from "../runtime/assistant-commands";

/**
 * The panel's place in the dashboard, registered on the server as well: a
 * panel left open renders docked at its width on the first paint, without the
 * page jumping. The client plugin withdraws it where the assistant does not
 * run (no dms-ai backend, the sidecar disabled).
 */
export default defineDmsPlugin(() => {
	if (!import.meta.env.DEV) return;
	registerSidePanel(assistantSidePanel());
});
