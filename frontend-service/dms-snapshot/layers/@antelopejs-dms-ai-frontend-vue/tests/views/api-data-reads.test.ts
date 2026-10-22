// @vitest-environment jsdom
import { flushPromises, shallowMount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	computed,
	defineComponent,
	h,
	reactive,
	ref,
	toValue,
	watch,
	type MaybeRefOrGetter,
} from "vue";
import ActivityDetail from "../../app/components/ActivityDetail.vue";
import ChangesView from "../../app/components/ChangesView.vue";
import ChangeSetPanel from "../../app/views/ChangeSetPanel.vue";
import UnavailableState from "../../app/views/UnavailableState.vue";

// The views read what they render with the DMS's `useApiData`, which a server
// render hands to the browser (this repository has no renderer to run it:
// the playground proves that part), and the Changes list page by page with
// `useApiPagedData`; `$authFetch` is left to the writes. These fakes read as
// the browser does.

const route = reactive({ query: {} as Record<string, string> });

vi.mock("#dms/frontend-module", () => ({
	useDmsRoute: () => route,
	useDmsRouter: () => ({ push: vi.fn() }),
}));

interface Read {
	url: string;
	query?: Record<string, unknown>;
}

type Backend = (read: Read) => unknown;

let backend: Backend;
const reads: Read[] = [];
const authFetch = vi.fn();
/** The reads the page's refreshes read again, as the DMS's `refreshPageBlocks()` does. */
const pageReads = new Set<() => Promise<void>>();
const refreshPageBlocks = vi.fn(async () => {
	await Promise.all([...pageReads].map((refresh) => refresh()));
});

interface FakeApiDataOptions {
	query?: MaybeRefOrGetter<Record<string, unknown>>;
	refreshOnPageRefresh?: boolean;
}

function useApiData<T>(
	url: MaybeRefOrGetter<string | null | undefined>,
	options: FakeApiDataOptions = {},
) {
	const data = ref<T | null>(null);
	const error = ref<unknown>(null);
	const status = ref<"idle" | "pending" | "success" | "error">("idle");
	const request = () => ({ url: toValue(url), query: toValue(options.query) });
	async function refresh(): Promise<void> {
		const { url: target, query } = request();
		if (target == null) return;
		const read = query ? { url: target, query } : { url: target };
		reads.push(read);
		status.value = "pending";
		try {
			// Each answer is a new value, as a parsed response is.
			data.value = structuredClone(await backend(read)) as T;
			error.value = null;
			status.value = "success";
		} catch (failure) {
			error.value = failure;
			status.value = "error";
		}
	}
	watch(request, () => void refresh(), { deep: true, immediate: true });
	if (options.refreshOnPageRefresh !== false) pageReads.add(refresh);
	return {
		data,
		error,
		status,
		pending: computed(() => status.value === "pending"),
		placeholder: ref(false),
		refresh,
		execute: refresh,
		clear: () => undefined,
	};
}

interface FakePagedOptions<TPage> {
	nextCursor: (page: TPage, pages: TPage[]) => number | null | undefined;
}

type PagedContext = {
	$authFetch: typeof authFetch;
	cursor: number | undefined;
	signal: AbortSignal;
};

/** `useApiPagedData` as the renderer runs it: one key, the pages it loaded, all read again on a refresh. */
function useApiPagedData<TPage>(
	key: MaybeRefOrGetter<string>,
	handler: (context: PagedContext) => Promise<TPage>,
	options: FakePagedOptions<TPage>,
) {
	const pages = ref<TPage[]>([]) as { value: TPage[] };
	const next = ref<number | null>(null);
	const error = ref<unknown>(null);
	const status = ref<"idle" | "pending" | "success" | "error">("idle");
	const loadingMore = ref(false);
	const read = (cursor: number | undefined) =>
		handler({
			$authFetch: authFetch,
			cursor,
			signal: new AbortController().signal,
		});
	async function readPages(count: number): Promise<void> {
		status.value = "pending";
		const loaded: TPage[] = [];
		let cursor: number | undefined;
		try {
			for (let index = 0; index < count; index++) {
				const page = structuredClone(await read(cursor)) as TPage;
				loaded.push(page);
				const after = options.nextCursor(page, loaded) ?? null;
				next.value = after;
				if (after === null) break;
				cursor = after;
			}
			pages.value = loaded;
			error.value = null;
			status.value = "success";
		} catch (failure) {
			error.value = failure;
			status.value = "error";
		}
	}
	const refresh = () => readPages(Math.max(pages.value.length, 1));
	watch(
		() => toValue(key),
		() => void readPages(1),
		{ immediate: true },
	);
	pageReads.add(refresh);
	async function loadMore(): Promise<void> {
		if (next.value === null) return;
		loadingMore.value = true;
		try {
			const page = structuredClone(await read(next.value)) as TPage;
			pages.value = [...pages.value, page];
			next.value = options.nextCursor(page, pages.value) ?? null;
		} catch (failure) {
			error.value = failure;
		} finally {
			loadingMore.value = false;
		}
	}
	return {
		pages,
		error,
		status,
		pending: computed(() => status.value === "pending"),
		hasMore: computed(() => next.value !== null),
		loadingMore,
		loadMore,
		refresh,
	};
}

const Stub = (name: string) =>
	defineComponent({
		name,
		inheritAttrs: false,
		setup:
			(_, { slots }) =>
			() =>
				h("div", { "data-stub": name }, slots.default?.()),
	});

const GLOBAL_STUBS = Object.fromEntries(
	[
		"DmsCard",
		"DmsEmptyState",
		"DmsMasterDetail",
		"DmsSegmented",
		"DmsKeyValueList",
		"DmsIconWell",
		"DmsEyebrow",
		"DmsCodeSnippet",
		"UButton",
		"UInput",
		"USkeleton",
	].map((name) => [name, Stub(name)]),
);

const unavailable = () =>
	Object.assign(new Error("Service Unavailable"), {
		statusCode: 503,
		data: { message: "The assistant is not running" },
	});

const ROW = {
	id: "act-1",
	timestampMs: Date.UTC(2026, 9, 15, 10),
	tool: "Edit",
	target: "src/pages/home.ts",
	agent: "claude",
	allowedBy: "approved",
	result: "done",
	conversationId: "conv-1",
	conversationTitle: "Rename the home page",
	isReadOnly: false,
	isAutoFix: false,
};

const summary = (id: string, number: number) => ({
	id,
	number,
	title: `Change ${number}`,
	state: "applied",
	createdAtMs: Date.UTC(2026, 9, 15, 10),
	added: 1,
	removed: 0,
	scope: "safe",
	agent: "claude",
	files: [],
	isAutoFix: false,
	approvalsNeeded: 0,
	builderOps: 0,
	typecheck: "passed",
});

beforeEach(() => {
	reads.length = 0;
	authFetch.mockReset();
	route.query = {};
	pageReads.clear();
	refreshPageBlocks.mockClear();
	vi.stubGlobal("useApiData", useApiData);
	vi.stubGlobal("useApiPagedData", useApiPagedData);
	vi.stubGlobal("refreshPageBlocks", refreshPageBlocks);
	vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
	vi.stubGlobal("useI18n", () => ({
		t: (key: string) => key,
		te: () => false,
	}));
	vi.stubGlobal("useRegionalFormat", () => ({
		dateTimeFormat: (options: Intl.DateTimeFormatOptions) =>
			new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }),
	}));
	vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
	vi.stubGlobal("useConfirmFrom", () => ({ confirmFrom: vi.fn() }));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const mount = (component: Parameters<typeof shallowMount>[0], props = {}) =>
	shallowMount(component, {
		props,
		global: { stubs: { ...GLOBAL_STUBS, UnavailableState: false } },
	});

describe("activity detail", () => {
	it("reads the entry its row names with the page, not with $authFetch", async () => {
		backend = () => ({ ...ROW, args: { file_path: "src/pages/home.ts" } });
		const wrapper = mount(ActivityDetail, { rowData: ROW });
		await flushPromises();
		expect(reads).toEqual([{ url: "/ai/activity/act-1" }]);
		expect(authFetch).not.toHaveBeenCalled();
		expect(wrapper.findComponent(UnavailableState).exists()).toBe(false);
		expect(wrapper.find('[data-stub="USkeleton"]').exists()).toBe(false);
	});

	it("says the assistant is not running on a 503, and reads again on retry", async () => {
		backend = () => {
			throw unavailable();
		};
		const wrapper = mount(ActivityDetail, { rowData: ROW });
		await flushPromises();
		const state = wrapper.findComponent(UnavailableState);
		expect(state.props("failure")).toBe("unavailable");
		backend = () => ROW;
		state.vm.$emit("retry");
		await flushPromises();
		expect(reads).toHaveLength(2);
		expect(wrapper.findComponent(UnavailableState).exists()).toBe(false);
	});
});

describe("changes view", () => {
	const PAGE = { results: [summary("cs-1", 1), summary("cs-2", 2)], total: 3 };
	const NEXT_PAGE = { results: [summary("cs-3", 3)], total: 3 };

	function changesBackend({ url, query }: Read): unknown {
		if (url === "/ai/status") return { checkpointsAvailable: true };
		if (url === "/ai/changes") return query?.offset ? NEXT_PAGE : PAGE;
		return { changeSet: summary("cs-1", 1), files: [] };
	}

	/** The paged list's requests, which go through the handler's `$authFetch`. */
	function listReads(): unknown[] {
		return authFetch.mock.calls.map(([url, options]) => [
			url,
			(options as { query: unknown }).query,
		]);
	}

	beforeEach(() => {
		authFetch.mockImplementation(async (url: string, options: Read) =>
			changesBackend({ url, query: options.query }),
		);
	});

	it("reads the status and the first page with the page, and opens the set the URL names", async () => {
		backend = changesBackend;
		route.query = { set: "cs-2" };
		const wrapper = mount(ChangesView);
		await flushPromises();
		expect(reads).toEqual([{ url: "/ai/status" }]);
		expect(listReads()).toEqual([["/ai/changes", { offset: 0, limit: 30 }]]);
		expect(wrapper.findComponent(ChangeSetPanel).props("changeSetId")).toBe(
			"cs-2",
		);
	});

	it("selects the first set when the URL names none", async () => {
		backend = changesBackend;
		const wrapper = mount(ChangesView);
		await flushPromises();
		expect(wrapper.findComponent(ChangeSetPanel).props("changeSetId")).toBe(
			"cs-1",
		);
	});

	it("appends the next page on Load more, and reads every loaded page again on a page refresh", async () => {
		backend = changesBackend;
		const wrapper = mount(ChangesView);
		await flushPromises();
		const loadMoreButton = () =>
			wrapper
				.findAllComponents({ name: "UButton" })
				.find(
					(button) =>
						button.vm.$attrs.label === "dms_ai.views.common.load_more",
				);
		loadMoreButton()!.vm.$emit("click");
		await flushPromises();
		expect(listReads().at(-1)).toEqual([
			"/ai/changes",
			{ offset: 2, limit: 30 },
		]);
		const items = () =>
			(
				wrapper.findComponent({ name: "DmsMasterDetail" }).vm.$attrs.items as {
					value: string;
				}[]
			).map((item) => item.value);
		expect(items()).toEqual(["cs-1", "cs-2", "cs-3"]);
		expect(loadMoreButton()).toBeUndefined();

		// A change set undone in the panel refreshes the page, which reads the
		// pages loaded again rather than dropping the second one.
		authFetch.mockClear();
		await refreshPageBlocks();
		await flushPromises();
		expect(listReads()).toEqual([
			["/ai/changes", { offset: 0, limit: 30 }],
			["/ai/changes", { offset: 2, limit: 30 }],
		]);
		expect(items()).toEqual(["cs-1", "cs-2", "cs-3"]);
	});

	it("reads the filtered first page when the scope changes", async () => {
		backend = changesBackend;
		const wrapper = mount(ChangesView);
		await flushPromises();
		wrapper
			.findComponent({ name: "DmsSegmented" })
			.vm.$emit("update:modelValue", "vibe");
		await flushPromises();
		expect(listReads().at(-1)).toEqual([
			"/ai/changes",
			{ offset: 0, limit: 30, scope: "vibe", filter_scope: "is:vibe" },
		]);
	});
});

describe("change set panel", () => {
	it("refreshes the page once a set is redone, instead of reading on its own", async () => {
		backend = () => ({
			changeSet: { ...summary("cs-1", 1), state: "undone" },
			files: [],
		});
		authFetch.mockResolvedValue({});
		const wrapper = mount(ChangeSetPanel, { changeSetId: "cs-1" });
		await flushPromises();
		expect(reads).toEqual([{ url: "/ai/changes/cs-1" }]);
		const redo = wrapper
			.findAllComponents({ name: "UButton" })
			.find((button) => button.vm.$attrs.label === "dms_ai.views.changes.redo");
		redo!.vm.$emit("click");
		await flushPromises();
		expect(authFetch).toHaveBeenCalledWith("/ai/changes/cs-1/redo", {
			method: "POST",
			body: {},
		});
		expect(refreshPageBlocks).toHaveBeenCalledTimes(1);
		expect(reads).toEqual([
			{ url: "/ai/changes/cs-1" },
			{ url: "/ai/changes/cs-1" },
		]);
	});
});

describe("change set actions", () => {
	it("stay busy until the page refresh a redo asks for is done", async () => {
		backend = () => ({
			changeSet: { ...summary("cs-1", 1), state: "undone" },
			files: [],
		});
		authFetch.mockResolvedValue({});
		let finishRefresh: () => void = () => undefined;
		refreshPageBlocks.mockImplementationOnce(
			() => new Promise<void>((resolve) => (finishRefresh = resolve)),
		);
		const wrapper = mount(ChangeSetPanel, { changeSetId: "cs-1" });
		await flushPromises();
		const redo = () =>
			wrapper
				.findAllComponents({ name: "UButton" })
				.find(
					(button) => button.vm.$attrs.label === "dms_ai.views.changes.redo",
				)!;
		redo().vm.$emit("click");
		await flushPromises();
		expect(refreshPageBlocks).toHaveBeenCalledTimes(1);
		expect(redo().vm.$attrs.loading).toBe(true);
		finishRefresh();
		await flushPromises();
		expect(redo().vm.$attrs.loading).toBe(false);
	});
});
