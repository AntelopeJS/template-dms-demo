import { vi } from 'vitest'
import {
	computed,
	createApp,
	defineComponent,
	h,
	nextTick,
	onMounted,
	reactive,
	ref,
	watch,
	type Component,
} from 'vue'

export interface OverlayCall {
	title: string
	component: unknown
	componentOptions?: Record<string, unknown>
	direction?: string
}

export interface NuxtStubs {
	modalCalls: OverlayCall[]
	drawerCalls: OverlayCall[]
	toasts: Record<string, unknown>[]
	navigations: unknown[]
	confirmations: Record<string, unknown>[]
}

/** Interpolates `{name}` params so assertions can read the rendered text. */
export function translate(key: string, params?: unknown): string {
	if (!params || typeof params !== 'object') return key
	const values = Object.entries(params as Record<string, unknown>)
	return `${key}${values.map(([name, value]) => ` ${name}=${String(value)}`).join('')}`
}

/**
 * Stubs the globals the DMS auto-imports in the app (Vue's API, the i18n,
 * containers, toasts, navigation), and records what the components ask of them.
 */
export function stubNuxtGlobals(email = 'camille@acme.com'): NuxtStubs {
	const stubs: NuxtStubs = {
		modalCalls: [],
		drawerCalls: [],
		toasts: [],
		navigations: [],
		confirmations: [],
	}
	const handle = () => ({
		result: Promise.resolve(undefined),
		patch: () => undefined,
		close: () => undefined,
	})
	Object.entries({
		computed,
		onMounted,
		reactive,
		ref,
		watch,
		h,
		nextTick,
	}).forEach(([name, value]) => vi.stubGlobal(name, value))
	vi.stubGlobal('useI18n', () => ({
		t: translate,
		te: () => false,
		locale: ref('en'),
	}))
	vi.stubGlobal('useTranslation', () => ({
		processApiMessage: (message: unknown) => String(message),
		processI18n: (message: string) => message,
	}))
	vi.stubGlobal('useToast', () => ({
		add: (toast: Record<string, unknown>) => stubs.toasts.push(toast),
	}))
	vi.stubGlobal('useUniqueLocales', () => ({
		uniqueLocales: ref([
			{ code: 'en', name: 'English' },
			{ code: 'fr', name: 'Français' },
			{ code: 'de', name: 'Deutsch' },
		]),
	}))
	vi.stubGlobal('useCurrentUser', () => ({ user: ref({ email }) }))
	vi.stubGlobal('resolveComponent', (name: string) => ({ name }))
	vi.stubGlobal('useModal', () => ({
		open: (call: OverlayCall) => {
			stubs.modalCalls.push(call)
			return handle()
		},
	}))
	vi.stubGlobal('useDrawer', () => ({
		open: (call: OverlayCall) => {
			stubs.drawerCalls.push(call)
			return handle()
		},
	}))
	vi.stubGlobal('useConfirm', () => ({
		confirm: async (options: Record<string, unknown>) => {
			stubs.confirmations.push(options)
			return true
		},
	}))
	vi.stubGlobal('navigateDms', async (route: unknown) => {
		stubs.navigations.push(route)
	})
	return stubs
}

/** A stand-in for a global component that renders every slot it gets. */
export function slotStub(name: string): Component {
	return defineComponent({
		name,
		inheritAttrs: false,
		setup:
			(_, { slots, attrs }) =>
			() =>
				h(
					'div',
					{ 'data-stub': name, ...attrs },
					Object.values(slots).flatMap((slot) => slot?.() ?? []),
				),
	})
}

export interface Mounted {
	host: HTMLElement
	unmount: () => void
}

/** Mounts a component with stand-ins for the given global components. */
export function mount(
	component: Component,
	props: Record<string, unknown>,
	globals: Record<string, Component> = {},
): Mounted {
	const host = document.createElement('div')
	document.body.appendChild(host)
	const app = createApp(component, props)
	Object.entries(globals).forEach(([name, value]) => app.component(name, value))
	app.config.warnHandler = () => undefined
	app.mount(host)
	return {
		host,
		unmount: () => {
			app.unmount()
			host.remove()
		},
	}
}

/** Lets pending promises and the re-render they cause settle. */
export async function flush(): Promise<void> {
	for (let pass = 0; pass < 5; pass += 1) {
		await Promise.resolve()
		await nextTick()
	}
}

/** `UInput`: a native input bound to `modelValue`. */
export const InputStub = defineComponent({
	props: { modelValue: { type: [String, Number], default: '' } },
	emits: ['update:modelValue'],
	setup:
		(props, { emit, attrs }) =>
		() =>
			h('input', {
				...attrs,
				value: props.modelValue,
				onInput: (event: Event) =>
					emit('update:modelValue', (event.target as HTMLInputElement).value),
			}),
})

/** `UCheckbox`: a native checkbox bound to `modelValue`. */
export const CheckboxStub = defineComponent({
	props: { modelValue: Boolean, label: { type: String, default: '' } },
	emits: ['update:modelValue'],
	setup:
		(props, { emit, attrs }) =>
		() =>
			h('label', [
				h('input', {
					...attrs,
					type: 'checkbox',
					checked: props.modelValue,
					onChange: (event: Event) =>
						emit(
							'update:modelValue',
							(event.target as HTMLInputElement).checked,
						),
				}),
				props.label,
			]),
})

/** `DmsInputTags`: a text input that adds the typed address on change. */
export const TagsStub = defineComponent({
	props: { modelValue: { type: Array, default: () => [] } },
	emits: ['update:modelValue'],
	setup:
		(props, { emit }) =>
		() =>
			h('input', {
				'data-tags': (props.modelValue as string[]).join(','),
				onChange: (event: Event) =>
					emit('update:modelValue', [
						...(props.modelValue as string[]),
						(event.target as HTMLInputElement).value,
					]),
			}),
})

/** Global stand-ins every form test mounts with. */
export const FORM_STUBS: Record<string, Component> = {
	UInput: InputStub,
	DmsInputText: InputStub,
	DmsInputEmail: InputStub,
	UCheckbox: CheckboxStub,
	DmsCheckbox: CheckboxStub,
	DmsInputTags: TagsStub,
	UFormField: slotStub('UFormField'),
	DmsFieldRow: slotStub('DmsFieldRow'),
	UFieldGroup: slotStub('UFieldGroup'),
}

/** Types into a native input and lets Vue react. */
export async function typeInto(input: Element, value: string): Promise<void> {
	const field = input as HTMLInputElement
	field.value = value
	field.dispatchEvent(new Event('input'))
	field.dispatchEvent(new Event('change'))
	await flush()
}
