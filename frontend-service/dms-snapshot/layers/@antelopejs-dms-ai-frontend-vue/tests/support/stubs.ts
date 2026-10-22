import { defineComponent, h, type PropType } from "vue";

interface SegmentItem {
	value: string;
	label: string;
}

/** Nuxt UI's button, drawn as a plain button with its label and slot. */
const UButton = defineComponent({
	name: "UButton",
	inheritAttrs: false,
	props: {
		label: { type: String, default: "" },
		disabled: { type: Boolean, default: false },
		loading: { type: Boolean, default: false },
		type: { type: String, default: "button" },
	},
	emits: ["click"],
	setup(props, { slots, attrs, emit }) {
		return () =>
			h(
				"button",
				{
					...attrs,
					type: props.type,
					disabled: props.disabled,
					onClick: (event: MouseEvent) => emit("click", event),
				},
				[props.label, slots.default?.()],
			);
	},
});

const UKbd = defineComponent({
	name: "UKbd",
	props: { value: { type: String, default: "" } },
	setup: (props) => () => h("kbd", props.value),
});

const UBadge = defineComponent({
	name: "UBadge",
	props: { label: { type: String, default: "" } },
	setup: (props) => () => h("span", { class: "u-badge" }, props.label),
});

/** A modal that draws its slots in place while open. */
const UModal = defineComponent({
	name: "UModal",
	props: {
		open: { type: Boolean, default: false },
		title: { type: String, default: "" },
	},
	setup(props, { slots }) {
		return () =>
			props.open
				? h("div", { class: "u-modal", role: "dialog" }, [
						h("h2", props.title),
						slots.body?.(),
						slots.footer?.(),
					])
				: null;
	},
});

interface MenuItem {
	label?: string;
	onSelect?: () => void;
}

/** A menu drawn open, each item a button, so tests can pick one. */
const UDropdownMenu = defineComponent({
	name: "UDropdownMenu",
	props: { items: { type: Array as PropType<unknown[]>, default: () => [] } },
	setup(props, { slots }) {
		const flat = (): MenuItem[] => props.items.flat(2) as MenuItem[];
		return () =>
			h("div", { class: "u-dropdown" }, [
				slots.default?.(),
				...flat()
					.filter((item) => item.onSelect !== undefined)
					.map((item) =>
						h(
							"button",
							{
								class: "u-dropdown-item",
								type: "button",
								onClick: item.onSelect,
							},
							item.label,
						),
					),
			]);
	},
});

const UPopover = defineComponent({
	name: "UPopover",
	setup:
		(_, { slots }) =>
		() =>
			h("div", { class: "u-popover" }, [slots.default?.(), slots.content?.()]),
});

const UInput = defineComponent({
	name: "UInput",
	props: { modelValue: { type: String, default: "" } },
	emits: ["update:modelValue"],
	setup:
		(props, { emit, attrs }) =>
		() =>
			h("input", {
				...attrs,
				value: props.modelValue,
				onInput: (event: Event) =>
					emit("update:modelValue", (event.target as HTMLInputElement).value),
			}),
});

const UTextarea = defineComponent({
	name: "UTextarea",
	props: { modelValue: { type: String, default: "" } },
	emits: ["update:modelValue"],
	setup:
		(props, { emit }) =>
		() =>
			h("textarea", {
				class: "u-textarea",
				value: props.modelValue,
				onInput: (event: Event) =>
					emit(
						"update:modelValue",
						(event.target as HTMLTextAreaElement).value,
					),
			}),
});

const DmsSegmented = defineComponent({
	name: "DmsSegmented",
	props: {
		modelValue: { type: [String, Number], default: "" },
		items: {
			type: Array as PropType<SegmentItem[]>,
			default: () => [],
		},
	},
	emits: ["update:modelValue"],
	setup:
		(props, { emit }) =>
		() =>
			h(
				"div",
				{ class: "dms-segmented" },
				props.items.map((item) =>
					h(
						"button",
						{
							type: "button",
							onClick: () => emit("update:modelValue", item.value),
						},
						item.label,
					),
				),
			),
});

const DmsEmptyState = defineComponent({
	name: "DmsEmptyState",
	props: {
		title: { type: String, default: "" },
		description: { type: String, default: "" },
	},
	setup:
		(props, { slots }) =>
		() =>
			h("div", { class: "dms-empty" }, [
				h("p", props.title),
				h("p", props.description),
				slots.actions?.(),
			]),
});

/** Every Nuxt UI and DMS component the panel draws, as light stand-ins. */
export const PANEL_STUBS = {
	UIcon: true,
	UButton,
	UKbd,
	UBadge,
	UModal,
	UDropdownMenu,
	UPopover,
	UInput,
	UTextarea,
	DmsSegmented,
	DmsEmptyState,
	DmsStatusPill: defineComponent({
		props: { label: { type: String, default: "" } },
		setup: (props) => () =>
			h("span", { class: "dms-status-pill" }, props.label),
	}),
	DmsIconWell: true,
};
