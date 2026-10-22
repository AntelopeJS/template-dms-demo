import type { Component } from 'vue'
import type { TemplateContent, TemplateRow } from '../types/mailing'

/**
 * How the templates overlays are reached.
 *
 * A backend row action (`src/pages/templates.ts`) opens them itself and
 * mounts the component with `rowData`, `onSuccessCallback` (closes the
 * container and refreshes the table) and, for drawers, `navigation`. Our own
 * surfaces (the gallery, the editor) open the same components through these
 * helpers, with an explicit id; a body component closes its container by
 * emitting `success`, with a truthy value when something changed.
 */
const COMPONENTS = {
	details: 'MailingTemplateDrawer',
	testSend: 'MailingTestSendModal',
	realSend: 'MailingRealSendModal',
	newTemplate: 'MailingNewTemplateModal',
	duplicate: 'MailingDuplicateModal',
} as const

type OverlayName = keyof typeof COMPONENTS

const DRAWER_DIRECTION = 'right'
const SEND_MODAL_SIZE = 'md'
const NEW_TEMPLATE_MODAL_SIZE = 'lg'
const DUPLICATE_MODAL_SIZE = 'md'

/** Called once an overlay closes after changing something. */
export type OverlayDone = () => void

export interface DetailsOptions {
	/** The rows shown around it, for the drawer's previous / next buttons. */
	rows?: TemplateRow[]
	onDone?: OverlayDone
}

export interface TestSendOptions {
	/** Locale preselected in the dialog. */
	locale?: string
	/** The editor's unsaved draft, sent instead of the saved content. */
	content?: TemplateContent
	/** The editor's data set, sent instead of the saved test data. */
	data?: Record<string, unknown>
	onDone?: OverlayDone
}

export interface RealSendOptions {
	/** The row when the caller has it: saves a round trip for the status. */
	rowData?: TemplateRow
	onDone?: OverlayDone
}

export interface NewTemplateOptions {
	/** Prefills the name (a search with no match, a starter whose slug is taken). */
	initialName?: string
	/** Preselects a starter in "Start from". */
	initialStarterId?: string
	onDone?: OverlayDone
}

export interface DuplicateOptions {
	rowData?: TemplateRow
	onDone?: OverlayDone
}

export interface TemplateOverlays {
	/** Opens the details drawer of a template, from the right. */
	openDetails: (
		template: TemplateRow | string,
		options?: DetailsOptions,
	) => void
	/**
	 * Opens the test-send dialog. Works for any status: the subject gets a
	 * `[TEST]` prefix and the send stays out of the figures.
	 */
	openTestSend: (templateId: string, options?: TestSendOptions) => void
	/**
	 * Opens the real-send dialog: the red confirmation on a live template,
	 * the refusal with its way out on any other.
	 */
	openRealSend: (templateId: string, options?: RealSendOptions) => void
	/** Opens the new-template dialog. */
	openNewTemplate: (options?: NewTemplateOptions) => void
	/** Opens the duplicate dialog of a template. */
	openDuplicate: (templateId: string, options?: DuplicateOptions) => void
}

interface ContainerHandle {
	result: Promise<unknown>
	patch: (patch: Record<string, unknown>) => void
}

function settle(handle: ContainerHandle, onDone?: OverlayDone): void {
	void handle.result
		.then((result) => {
			if (result) onDone?.()
		})
		.catch(() => undefined)
}

function rowNavigation(
	rows: TemplateRow[],
	current: TemplateRow,
	go: (row: TemplateRow) => void,
) {
	const index = rows.findIndex((row) => row._id === current._id)
	if (index < 0) return undefined
	const at = (position: number) => () => {
		const target = rows[position]
		if (target) go(target)
	}
	return {
		index,
		total: rows.length,
		hasPrev: index > 0,
		hasNext: index < rows.length - 1,
		prev: at(index - 1),
		next: at(index + 1),
	}
}

/**
 * Opens the templates overlays (details drawer, test and real sends, new
 * template, duplicate) from a component's setup.
 */
export function useTemplateDrawer(): TemplateOverlays {
	const drawer = useDrawer()
	const modal = useModal()
	const { t } = useI18n()
	const components = Object.fromEntries(
		Object.entries(COMPONENTS).map(([name, id]) => [
			name,
			resolveComponent(id) as Component,
		]),
	) as Record<OverlayName, Component>

	function openDetails(
		template: TemplateRow | string,
		options: DetailsOptions = {},
	): void {
		const row = typeof template === 'string' ? undefined : template
		const templateId = typeof template === 'string' ? template : template._id
		let handle: ContainerHandle | undefined
		const bodyFor = (target: TemplateRow | undefined, id: string) => ({
			templateId: id,
			rowData: target,
			onChanged: options.onDone,
			navigation: target
				? rowNavigation(options.rows ?? [], target, (next) =>
						handle?.patch({
							componentOptions: bodyFor(next, next._id),
							componentKey: next._id,
						}),
					)
				: undefined,
		})
		handle = drawer.open({
			title: t('dms_mailing.templates.actions.details'),
			component: components.details,
			componentOptions: bodyFor(row, templateId),
			componentKey: templateId,
			direction: DRAWER_DIRECTION,
		})
		settle(handle, options.onDone)
	}

	function openTestSend(templateId: string, options: TestSendOptions = {}) {
		const { onDone, ...body } = options
		const handle = modal.open({
			title: t('dms_mailing.test_send.title'),
			icon: 'i-ph-flask',
			component: components.testSend,
			componentOptions: { templateId, ...body },
			size: SEND_MODAL_SIZE,
		})
		settle(handle, onDone)
	}

	function openRealSend(templateId: string, options: RealSendOptions = {}) {
		const handle = modal.open({
			title: t('dms_mailing.real_send.title'),
			icon: 'i-ph-paper-plane-right',
			color: 'error',
			component: components.realSend,
			componentOptions: { templateId, rowData: options.rowData },
			size: SEND_MODAL_SIZE,
		})
		settle(handle, options.onDone)
	}

	function openNewTemplate(options: NewTemplateOptions = {}) {
		const { onDone, ...body } = options
		const handle = modal.open({
			title: t('dms_mailing.new_template.title'),
			description: t('dms_mailing.new_template.description'),
			icon: 'i-ph-envelope-simple',
			component: components.newTemplate,
			componentOptions: body,
			size: NEW_TEMPLATE_MODAL_SIZE,
		})
		settle(handle, onDone)
	}

	function openDuplicate(templateId: string, options: DuplicateOptions = {}) {
		const handle = modal.open({
			title: t('dms_mailing.duplicate.title'),
			description: t('dms_mailing.duplicate.description'),
			icon: 'i-ph-copy',
			component: components.duplicate,
			componentOptions: { templateId, rowData: options.rowData },
			size: DUPLICATE_MODAL_SIZE,
		})
		settle(handle, options.onDone)
	}

	return {
		openDetails,
		openTestSend,
		openRealSend,
		openNewTemplate,
		openDuplicate,
	}
}
