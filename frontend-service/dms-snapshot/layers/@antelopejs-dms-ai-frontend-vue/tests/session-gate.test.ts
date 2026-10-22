import { nextTick, ref, watch } from "vue";
import { describe, expect, it, vi } from "vitest";
import { runWhenLoggedIn } from "../app/runtime/session-gate";

describe("session gate", () => {
	it("starts immediately when the session is already hydrated", () => {
		const start = vi.fn();
		runWhenLoggedIn(() => true, start);
		expect(start).toHaveBeenCalledTimes(1);
	});

	it("starts once the session appears, and only once", async () => {
		const loggedIn = ref(false);
		const start = vi.fn();
		runWhenLoggedIn(() => loggedIn.value, start);
		expect(start).not.toHaveBeenCalled();

		loggedIn.value = true;
		await nextTick();
		expect(start).toHaveBeenCalledTimes(1);

		loggedIn.value = false;
		await nextTick();
		loggedIn.value = true;
		await nextTick();
		expect(start).toHaveBeenCalledTimes(1);
	});

	it("starts in the new session scope after login watchers settle", async () => {
		const loggedIn = ref(false);
		const session = ref("guest");
		let scope = session.value;
		let probe: AbortController | undefined;
		let probeScope: string | undefined;
		runWhenLoggedIn(
			() => loggedIn.value,
			() => {
				probeScope = scope;
				probe = new AbortController();
			},
		);
		// DMS hydrates the user before the session. Its scope watcher clears
		// outstanding reads, including an AI probe started in the old scope.
		const stopScope = watch(session, (next) => {
			probe?.abort();
			scope = next;
		});
		loggedIn.value = true;
		session.value = "owner";
		await nextTick();
		stopScope();
		expect(probeScope).toBe("owner");
		expect(probe?.signal.aborted).toBe(false);
	});

	it("never starts once the gate is stopped", async () => {
		const loggedIn = ref(false);
		const start = vi.fn();
		const stop = runWhenLoggedIn(() => loggedIn.value, start);

		stop();
		loggedIn.value = true;
		await nextTick();
		expect(start).not.toHaveBeenCalled();
	});
});
