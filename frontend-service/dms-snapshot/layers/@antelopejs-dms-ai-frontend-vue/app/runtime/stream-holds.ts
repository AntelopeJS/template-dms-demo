import { computed, type ComputedRef, ref } from "vue";

/** Who needs the tab's stream open besides the panel. */
export interface StreamHolds {
	isHeld: ComputedRef<boolean>;
	/** Holds the stream open until the returned function is called, once. */
	hold: () => () => void;
}

export function createStreamHolds(): StreamHolds {
	const count = ref(0);
	return {
		isHeld: computed(() => count.value > 0),
		hold: () => {
			count.value += 1;
			let isReleased = false;
			return () => {
				if (isReleased) return;
				isReleased = true;
				count.value -= 1;
			};
		},
	};
}
