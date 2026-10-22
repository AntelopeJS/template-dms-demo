import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import * as vue from "vue";
import { nextTick, ref, type Ref } from "vue";
import { expect, it, vi } from "vitest";
import * as constants from "../app/runtime/constants";
import { runWhenLoggedIn } from "../app/runtime/session-gate";

interface PluginExports {
	default: (context: unknown) => void | Promise<void>;
}

interface PluginHarness {
	useAuthFetch: ReturnType<typeof vi.fn>;
	unregisterSidePanel: ReturnType<typeof vi.fn>;
	run: () => void | Promise<void>;
}

const SESSION_GATE_MODULE = "../runtime/session-gate";
const SIDECAR_STATUS_MODULE = "../runtime/sidecar-status";
const CONSTANTS_MODULE = "../runtime/constants";

// A first probe reporting "no assistant here" stops the startup right after the
// authenticated fetch, which is all these tests need to observe.
const silentController = {
	createSidecarStatusController: () => ({ init: async () => false }),
};

function loadPlugin(loggedIn: Ref<boolean>): PluginHarness {
	const source = readFileSync(
		resolve(__dirname, "../app/plugins/ai.client.ts"),
		"utf8",
	);
	const compiled = ts.transpileModule(
		source
			.replace("import.meta.env.DEV", "true")
			.replace("import.meta.hot", "undefined"),
		{ compilerOptions: { module: ts.ModuleKind.CommonJS } },
	);
	const exports = {} as PluginExports;
	const useAuthFetch = vi.fn(() => ({ $authFetch: vi.fn() }));
	const unregisterSidePanel = vi.fn();
	const requireModule = (name: string) => {
		if (name === "#dms/frontend-module") {
			return {
				defineDmsPlugin: (plugin: unknown) => plugin,
				useDmsRouter: () => ({ push: vi.fn() }),
			};
		}
		if (name === "vue") return vue;
		if (name === CONSTANTS_MODULE) return constants;
		if (name === SESSION_GATE_MODULE) return { runWhenLoggedIn };
		if (name === SIDECAR_STATUS_MODULE) return silentController;
		return {};
	};
	new Function(
		"require",
		"exports",
		"useDmsUserSession",
		"useAuthFetch",
		"useToast",
		"useDevReload",
		"unregisterSidePanel",
		compiled.outputText,
	)(
		requireModule,
		exports,
		() => ({ loggedIn }),
		useAuthFetch,
		() => ({ add: vi.fn() }),
		() => ({ awaitRoute: vi.fn() }),
		unregisterSidePanel,
	);
	return {
		useAuthFetch,
		unregisterSidePanel,
		run: () =>
			exports.default({
				vueApp: { onUnmount: vi.fn(), provide: vi.fn() },
				$i18n: { t: (key: string) => key, locale: ref("en-GB") },
				hook: vi.fn(),
				runWithContext: (callback: () => unknown) => callback(),
			}),
	};
}

it("does not invoke authenticated fetching or inject the assistant for a guest", async () => {
	const plugin = loadPlugin(ref(false));
	await plugin.run();
	expect(plugin.useAuthFetch).not.toHaveBeenCalled();
});

it("starts the assistant when a guest signs in without reloading the page", async () => {
	const loggedIn = ref(false);
	const plugin = loadPlugin(loggedIn);
	await plugin.run();
	expect(plugin.useAuthFetch).not.toHaveBeenCalled();

	loggedIn.value = true;
	await nextTick();
	expect(plugin.useAuthFetch).toHaveBeenCalledTimes(1);
});

it("withdraws the docked panel when the first probe finds no assistant", async () => {
	const plugin = loadPlugin(ref(true));
	await plugin.run();
	await vi.waitFor(() =>
		expect(plugin.unregisterSidePanel).toHaveBeenCalledWith("dms-ai:assistant"),
	);
});
