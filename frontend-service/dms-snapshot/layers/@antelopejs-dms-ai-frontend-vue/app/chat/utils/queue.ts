export interface Identified {
	id: string;
}

/** The list with the item `id` moved to `toIndex`, clamped to the list. */
export function moveItem<T extends Identified>(
	list: readonly T[],
	id: string,
	toIndex: number,
): T[] {
	const from = list.findIndex((item) => item.id === id);
	if (from === -1) return [...list];
	const target = Math.min(Math.max(toIndex, 0), list.length - 1);
	const next = [...list];
	const [moved] = next.splice(from, 1);
	next.splice(target, 0, moved);
	return next;
}
