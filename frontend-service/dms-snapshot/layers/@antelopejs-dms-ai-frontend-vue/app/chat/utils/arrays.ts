/** The last element matching, like `Array.prototype.findLast` (ES2023). */
export function lastMatching<T>(
	list: readonly T[],
	predicate: (item: T) => boolean,
): T | undefined {
	for (let index = list.length - 1; index >= 0; index -= 1) {
		if (predicate(list[index])) return list[index];
	}
	return undefined;
}
