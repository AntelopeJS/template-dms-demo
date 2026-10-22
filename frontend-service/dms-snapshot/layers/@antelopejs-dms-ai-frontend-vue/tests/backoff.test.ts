import { describe, expect, it } from "vitest";
import { createBackoff, nextDelay, resetBackoff } from "../app/runtime/backoff";
import { CHANNEL_RECONNECT_DELAYS_MS } from "../app/runtime/constants";

describe("backoff helper", () => {
	it("returns each schedule entry in order then caps at the last value", () => {
		const state = createBackoff();
		const observed: number[] = [];
		for (let i = 0; i < CHANNEL_RECONNECT_DELAYS_MS.length + 3; i += 1) {
			observed.push(nextDelay(state, CHANNEL_RECONNECT_DELAYS_MS));
		}
		const expected = [
			...CHANNEL_RECONNECT_DELAYS_MS,
			CHANNEL_RECONNECT_DELAYS_MS[CHANNEL_RECONNECT_DELAYS_MS.length - 1],
			CHANNEL_RECONNECT_DELAYS_MS[CHANNEL_RECONNECT_DELAYS_MS.length - 1],
			CHANNEL_RECONNECT_DELAYS_MS[CHANNEL_RECONNECT_DELAYS_MS.length - 1],
		];
		expect(observed).toEqual(expected);
	});

	it("resetBackoff returns the schedule to schedule[0]", () => {
		const state = createBackoff();
		nextDelay(state, CHANNEL_RECONNECT_DELAYS_MS);
		nextDelay(state, CHANNEL_RECONNECT_DELAYS_MS);
		resetBackoff(state);
		expect(nextDelay(state, CHANNEL_RECONNECT_DELAYS_MS)).toBe(
			CHANNEL_RECONNECT_DELAYS_MS[0],
		);
	});

	it("uses the configured 30s ceiling on the last delay", () => {
		const state = createBackoff();
		const lastIndex = CHANNEL_RECONNECT_DELAYS_MS.length - 1;
		for (let i = 0; i < lastIndex; i += 1) {
			nextDelay(state, CHANNEL_RECONNECT_DELAYS_MS);
		}
		expect(nextDelay(state, CHANNEL_RECONNECT_DELAYS_MS)).toBe(30_000);
		expect(nextDelay(state, CHANNEL_RECONNECT_DELAYS_MS)).toBe(30_000);
	});
});
