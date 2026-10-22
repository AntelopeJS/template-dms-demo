import { router } from "@inertiajs/vue3";
import { HOST_STATE_UPDATE_TYPE } from "./constants";

interface CurrentPagePayload {
	path: string;
	title?: string;
}

interface HostStateUpdateMessage {
	type: typeof HOST_STATE_UPDATE_TYPE;
	currentPage: CurrentPagePayload;
}

interface InstallCurrentPageTrackerOptions {
	send: (msg: HostStateUpdateMessage) => void;
}

const TITLE_OBSERVER_OPTIONS: MutationObserverInit = {
	subtree: true,
	childList: true,
	characterData: true,
};

function readTitle(): string | undefined {
	const title = document.title.trim();
	return title === "" ? undefined : title;
}

function buildCurrentPage(url: string): CurrentPagePayload {
	const path = new URL(url, window.location.origin).pathname;
	const title = readTitle();
	return title === undefined ? { path } : { path, title };
}

/** The state update announcing the page at `url`, titled after the document. */
export function buildCurrentPageUpdate(url: string): HostStateUpdateMessage {
	return { type: HOST_STATE_UPDATE_TYPE, currentPage: buildCurrentPage(url) };
}

/**
 * Reports the displayed page on every Inertia navigation, and again whenever
 * the document title changes after the page has rendered.
 */
export function installCurrentPageTracker(
	options: InstallCurrentPageTrackerOptions,
): () => void {
	let currentUrl = window.location.href;
	let sentTitle = readTitle();
	const push = (): void => {
		sentTitle = readTitle();
		options.send(buildCurrentPageUpdate(currentUrl));
	};
	const stopNavigation = router.on("navigate", (event) => {
		currentUrl = event.detail.page.url;
		push();
	});
	const titleObserver = new MutationObserver(() => {
		if (readTitle() !== sentTitle) push();
	});
	titleObserver.observe(document.head, TITLE_OBSERVER_OPTIONS);
	push();
	return () => {
		stopNavigation();
		titleObserver.disconnect();
	};
}
