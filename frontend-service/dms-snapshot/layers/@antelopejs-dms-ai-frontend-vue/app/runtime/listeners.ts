import { LOG_PREFIX } from "./constants";

type Listener<T> = (value: T) => void;

export interface Listeners<T> {
	add: (listener: Listener<T>) => () => void;
	emit: Listener<T>;
}

/**
 * A set of listeners notified in order. A listener belongs to a component that
 * may already be failing: one throwing must not stop the others.
 */
export function createListeners<T>(): Listeners<T> {
	const listeners = new Set<Listener<T>>();
	return {
		add: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		emit: (value) => {
			for (const listener of listeners) {
				try {
					listener(value);
				} catch (error: unknown) {
					console.error(`${LOG_PREFIX} listener failed`, error);
				}
			}
		},
	};
}
