import { onBeforeUnmount, type Ref, ref, watch } from "vue";
import { RUN_CLOCK_TICK_MS } from "../constants/run-status";

/**
 * The current time, ticking every second while `isActive` is true, so elapsed
 * and quiet durations keep moving between two reports from the sidecar.
 */
export function useRunClock(isActive: Ref<boolean>): Ref<number> {
	const nowMs = ref(Date.now());
	let timer: ReturnType<typeof setInterval> | null = null;
	const stop = (): void => {
		if (timer === null) return;
		clearInterval(timer);
		timer = null;
	};
	const start = (): void => {
		stop();
		nowMs.value = Date.now();
		timer = setInterval(() => {
			nowMs.value = Date.now();
		}, RUN_CLOCK_TICK_MS);
	};
	watch(isActive, (active) => (active ? start() : stop()), {
		immediate: true,
	});
	onBeforeUnmount(stop);
	return nowMs;
}
