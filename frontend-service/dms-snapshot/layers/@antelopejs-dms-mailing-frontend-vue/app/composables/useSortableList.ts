import { useSortable } from '@vueuse/integrations/useSortable'
import { toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

/** What a drop did to a list, as vuedraggable's `change` event said it. */
export interface SortableListChange<Item> {
	added?: { element: Item; newIndex: number }
	removed?: { element: Item; oldIndex: number }
	moved?: { element: Item; oldIndex: number; newIndex: number }
}

export interface SortableGroup {
	name: string
	/** `'clone'`: the list keeps its items and hands a copy to the other list. */
	pull?: boolean | 'clone'
	/** `false`: no item of another list lands here. */
	put?: boolean
}

export interface SortableListOptions<Item> {
	/** Lists sharing a group name exchange items. */
	group?: string | SortableGroup
	/** Read again whenever it changes. */
	disabled?: MaybeRefOrGetter<boolean>
	/** Only an item grabbed by an element matching this selector moves. */
	handle?: string
	/**
	 * The children that are items, when the list element holds others (a
	 * footer): the indexes SortableJS reports count these only.
	 */
	draggable?: string
	/** `false`: the items cannot be reordered within the list. */
	sort?: boolean
	/** Class of the slot the dragged item will land in. */
	ghostClass?: string
	/** What another list receives in place of the dragged item. */
	clone?: (item: Item) => unknown
	onChange?: (change: SortableListChange<Item>) => void
	/** After every drag, whatever it changed. */
	onEnd?: () => void
}

/** What the list reads of SortableJS's events. */
interface SortableEvent {
	item: HTMLElement
	clone: HTMLElement
	oldIndex?: number
	newIndex?: number
	pullMode?: boolean | 'clone'
}

/**
 * The options the list sets. SortableJS keeps its default only for an option
 * absent from the object: a key set to `undefined` replaces it (an undefined
 * `draggable` makes no child an item, so nothing drags).
 */
function defined<Options extends object>(options: Options): Partial<Options> {
	return Object.fromEntries(
		Object.entries(options).filter(([, value]) => value !== undefined),
	) as Partial<Options>
}

/**
 * The item being dragged, by group. A drop on another list only names the
 * element, which belongs to the list it left: the list it lands in reads the
 * item the other one stored when the drag started.
 */
const dragged = new Map<string, unknown>()

/**
 * Lets the user reorder the items of `list` rendered in `root`, or move them
 * to another list of the same group: SortableJS, through VueUse's
 * `useSortable`.
 *
 * SortableJS moves the dragged element in the DOM itself. Vue owns these
 * elements, so each drop puts the element back where Vue rendered it and
 * changes `list` in place instead, from which Vue renders the new order.
 */
export function useSortableList<Item>(
	root: Ref<HTMLElement | null>,
	list: () => Item[],
	options: SortableListOptions<Item> = {},
): void {
	const groupName =
		typeof options.group === 'string'
			? options.group
			: (options.group?.name ?? '')

	/**
	 * Where the dragged element stood: next to the node that followed it, not
	 * at an index, as Vue removes an item by the markers around it.
	 */
	let origin: { parent: Node; next: Node | null } | undefined

	function restore(item: HTMLElement): void {
		if (origin) origin.parent.insertBefore(item, origin.next)
	}

	const { option } = useSortable(root, list, {
		...defined({
			group: options.group,
			handle: options.handle,
			draggable: options.draggable,
			ghostClass: options.ghostClass,
		}),
		disabled: toValue(options.disabled) ?? false,
		sort: options.sort ?? true,
		onStart: (event: SortableEvent) => {
			const { parentNode, nextSibling } = event.item
			origin = parentNode
				? { parent: parentNode, next: nextSibling }
				: undefined
			const element = list()[event.oldIndex ?? -1]
			if (element === undefined) return
			dragged.set(groupName, options.clone ? options.clone(element) : element)
		},
		onUpdate: (event: SortableEvent) => {
			const { oldIndex, newIndex } = event
			if (oldIndex === undefined || newIndex === undefined) return
			restore(event.item)
			const items = list()
			const [element] = items.splice(oldIndex, 1)
			if (element === undefined) return
			items.splice(newIndex, 0, element)
			options.onChange?.({ moved: { element, oldIndex, newIndex } })
		},
		onAdd: (event: SortableEvent) => {
			const element = dragged.get(groupName) as Item | undefined
			const { newIndex } = event
			if (element === undefined || newIndex === undefined) return
			// The element goes back to the list it left, below.
			event.item.remove()
			list().splice(newIndex, 0, element)
			options.onChange?.({ added: { element, newIndex } })
		},
		onRemove: (event: SortableEvent) => {
			restore(event.item)
			// A copy left: the list keeps its item, and SortableJS's stand-in goes.
			if (event.pullMode === 'clone') {
				event.clone.remove()
				return
			}
			const { oldIndex } = event
			if (oldIndex === undefined) return
			const [element] = list().splice(oldIndex, 1)
			if (element === undefined) return
			options.onChange?.({ removed: { element, oldIndex } })
		},
		onEnd: () => {
			origin = undefined
			dragged.delete(groupName)
			options.onEnd?.()
		},
	})

	watch(
		() => toValue(options.disabled) ?? false,
		(disabled) => option('disabled', disabled),
	)
}
