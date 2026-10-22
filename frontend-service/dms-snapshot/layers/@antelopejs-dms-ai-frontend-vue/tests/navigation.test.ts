// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { installCurrentPageTracker } from "../app/runtime/current-page";
import { installNavigationCompleteEmitter } from "../app/runtime/navigation-complete";

function navigate(url: string): void {
	document.dispatchEvent(
		new CustomEvent("inertia:navigate", {
			detail: { page: { url } },
		}),
	);
}

async function flushMutations(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Inertia host navigation", () => {
	it("reports the initial pathname and completed visits, then unsubscribes", () => {
		window.history.replaceState({}, "", "/initial?tab=one#section");
		const send = vi.fn();
		const stop = installCurrentPageTracker({ send });
		expect(send).toHaveBeenLastCalledWith({
			type: "host_state_update",
			currentPage: { path: "/initial" },
		});
		navigate("/other/deep?tab=two#anchor");
		expect(send).toHaveBeenLastCalledWith({
			type: "host_state_update",
			currentPage: { path: "/other/deep" },
		});
		stop();
		navigate("/ignored");
		expect(send).toHaveBeenCalledTimes(2);
	});

	it("carries the document title and reports a title rendered after navigation", async () => {
		window.history.replaceState({}, "", "/orders");
		document.title = "Orders";
		const send = vi.fn();
		const stop = installCurrentPageTracker({ send });
		expect(send).toHaveBeenLastCalledWith({
			type: "host_state_update",
			currentPage: { path: "/orders", title: "Orders" },
		});
		navigate("/customers");
		document.title = "Customers";
		await flushMutations();
		expect(send).toHaveBeenLastCalledWith({
			type: "host_state_update",
			currentPage: { path: "/customers", title: "Customers" },
		});
		const sentCount = send.mock.calls.length;
		document.title = "Customers";
		await flushMutations();
		expect(send).toHaveBeenCalledTimes(sentCount);
		stop();
		document.title = "Ignored";
		await flushMutations();
		expect(send).toHaveBeenCalledTimes(sentCount);
		document.title = "";
	});

	it("emits completion only after navigation and removes its event listener", () => {
		const send = vi.fn();
		const stop = installNavigationCompleteEmitter({ send });
		expect(send).not.toHaveBeenCalled();
		navigate("https://example.test/finished?view=graph#node");
		expect(send).toHaveBeenCalledExactlyOnceWith({
			type: "host_navigation_complete",
			path: "/finished",
		});
		stop();
		navigate("/ignored");
		expect(send).toHaveBeenCalledTimes(1);
	});
});
