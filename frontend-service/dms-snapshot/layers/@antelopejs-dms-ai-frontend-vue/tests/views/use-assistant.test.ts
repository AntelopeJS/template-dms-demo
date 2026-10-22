// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSSRApp, defineComponent, h, nextTick, shallowRef } from "vue";
import { renderToString } from "vue/server-renderer";
import type { AssistantSession } from "../../app/runtime/assistant-session";
import { ASSISTANT_SESSION_KEY } from "../../app/runtime/assistant-session";
import { useAssistant } from "../../app/views/composables/useAssistant";

vi.mock("#dms/frontend-module", () => ({
	useDmsRouter: () => ({ push: vi.fn() }),
}));

// A view offering an assistant button, as the Changes empty state does.
const View = defineComponent({
	setup() {
		const assistant = useAssistant();
		return () =>
			h("div", [assistant.isAvailable ? h("button", "Open assistant") : null]);
	},
});

function appWith(session: AssistantSession | null) {
	const app = createSSRApp(View);
	app.provide(ASSISTANT_SESSION_KEY, shallowRef(session));
	return app;
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("useAssistant", () => {
	it("hydrates what the server rendered when the session started first, then offers the assistant", async () => {
		const html = await renderToString(appWith(null));
		const root = document.createElement("div");
		root.innerHTML = html;
		document.body.append(root);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});

		// The tab's probe answered before this block hydrated.
		appWith({} as AssistantSession).mount(root);
		const mismatches = [...warn.mock.calls, ...error.mock.calls]
			.flat()
			.filter((entry) => String(entry).includes("Hydration"));
		warn.mockRestore();
		error.mockRestore();
		expect(mismatches).toEqual([]);

		await nextTick();
		expect(root.querySelector("button")?.textContent).toBe("Open assistant");
	});
});
