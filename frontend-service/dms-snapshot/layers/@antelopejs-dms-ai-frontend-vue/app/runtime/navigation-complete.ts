import { router } from "@inertiajs/vue3";
import { HOST_NAVIGATION_COMPLETE_TYPE } from "./constants";

interface HostNavigationCompleteMessage {
	type: typeof HOST_NAVIGATION_COMPLETE_TYPE;
	path: string;
}

interface InstallNavigationCompleteEmitterOptions {
	send: (msg: HostNavigationCompleteMessage) => void;
}

export function installNavigationCompleteEmitter(
	options: InstallNavigationCompleteEmitterOptions,
): () => void {
	return router.on("navigate", (event) =>
		options.send({
			type: HOST_NAVIGATION_COMPLETE_TYPE,
			path: new URL(event.detail.page.url, window.location.origin).pathname,
		}),
	);
}
