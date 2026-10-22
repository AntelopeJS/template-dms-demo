import { describe, expect, it, vi } from "vitest";
import { computed, nextTick, type Ref, ref } from "vue";
import {
	createSidecarStatusController,
	type SidecarInfoPayload,
	type SidecarInfoRead,
} from "../app/runtime/sidecar-status";

type Answer = SidecarInfoPayload | Error;

interface FakeRead extends SidecarInfoRead {
	/** The polling interval the controller asks for. */
	interval: Readonly<Ref<number>>;
	reads: () => number;
}

/** `useApiData` as the controller uses it: each read takes the next answer. */
function fakeRead(answers: Answer[]) {
	let opened: FakeRead | undefined;
	const open = (interval: Readonly<Ref<number>>): SidecarInfoRead => {
		const data = ref<SidecarInfoPayload | null>(null);
		const error = ref<unknown>(null);
		const status = ref<"idle" | "pending" | "done">("idle");
		let count = 0;
		const refresh = async (): Promise<void> => {
			status.value = "pending";
			await Promise.resolve();
			const answer = answers[Math.min(count, answers.length - 1)];
			count += 1;
			if (answer instanceof Error) error.value = answer;
			else {
				data.value = answer ?? null;
				error.value = null;
			}
			status.value = "done";
		};
		opened = {
			data,
			error,
			pending: computed(() => status.value === "pending"),
			execute: refresh,
			refresh,
			interval,
			reads: () => count,
		};
		return opened;
	};
	return { open, read: () => opened! };
}

describe("sidecar status", () => {
	it("reports connected from the status alone, and keeps no port or credential", async () => {
		const { open, read } = fakeRead([{ isRunning: true }]);
		const controller = createSidecarStatusController(open);
		expect(await controller.init()).toBe(true);
		expect(controller.getStatus()).toBe("connected");
		expect(read().interval.value).toBe(0);
		expect(Object.keys(controller)).not.toContain("getPort");
		expect(Object.keys(controller)).not.toContain("getClientToken");
		controller.dispose();
	});

	it("re-probes when the channel drops, and reports connected once the sidecar answers", async () => {
		const { open, read } = fakeRead([{ isRunning: true }]);
		const statuses: string[] = [];
		const controller = createSidecarStatusController(open);
		await controller.init();
		controller.subscribe((status) => statuses.push(status));
		controller.reportChannelDown();
		await vi.waitFor(() => expect(statuses.at(-1)).toBe("connected"));
		expect(statuses).toEqual(["connected", "reviving", "connected"]);
		expect(read().reads()).toBe(2);
		controller.dispose();
	});

	it("polls through the read's interval, backing off while the sidecar comes back, and stops once it runs", async () => {
		const { open, read } = fakeRead([
			{ isRunning: false },
			new Error("Bad Gateway"),
			{ isRunning: true },
		]);
		const controller = createSidecarStatusController(open);
		expect(await controller.init()).toBe(true);
		expect(controller.getStatus()).toBe("reviving");
		expect(read().interval.value).toBe(500);
		await read().refresh();
		expect(read().interval.value).toBe(1000);
		await read().refresh();
		await nextTick();
		expect(controller.getStatus()).toBe("connected");
		expect(read().interval.value).toBe(0);
		controller.dispose();
	});

	it("stops polling once the sidecar gives up", async () => {
		const { open, read } = fakeRead([{ hasGivenUp: true }]);
		const controller = createSidecarStatusController(open);
		await controller.init();
		expect(controller.getStatus()).toBe("unavailable");
		expect(read().interval.value).toBe(0);
		controller.dispose();
	});

	it("does not show the assistant when spawning is disabled, and polls nothing", async () => {
		const { open, read } = fakeRead([{ disabled: true }]);
		const controller = createSidecarStatusController(open);
		expect(await controller.init()).toBe(false);
		expect(read().interval.value).toBe(0);
	});

	it("does not show the assistant when the first probe fails", async () => {
		const { open, read } = fakeRead([new Error("Not Found")]);
		const controller = createSidecarStatusController(open);
		expect(await controller.init()).toBe(false);
		expect(read().interval.value).toBe(0);
	});
});
