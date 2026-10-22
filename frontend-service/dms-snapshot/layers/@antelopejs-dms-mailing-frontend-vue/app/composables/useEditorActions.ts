import type { Component } from 'vue'
import type { MailingApi } from './useMailingApi'
import type { EditorReads } from './useMailingReads'
import type { EditorSession } from './useEditorSession'
import { isDraftConflict } from './useEditorSession'
import type { EditorState } from './useTemplateEditor'
import { useTemplateDrawer } from './useTemplateDrawer'
import type { TemplateOverlays } from './useTemplateDrawer'
import { describeChanges } from '../utils/changes'
import { deepClone } from '../utils/clone'
import {
	contentChecks,
	publishBlockers,
	publishChecks,
	tokenChecks,
} from '../utils/editor-checks'
import type { EditorCheck } from '../utils/editor-checks'
import type { LifecycleAction } from '../utils/lifecycle'
import { afterLifecycle, isPublishable } from '../utils/lifecycle'
import { systemVariableChecks } from '../utils/system-variables'

const PUBLISH_REVIEW_COMPONENT = 'MailingEditorPublishReview'
const COMPARE_COMPONENT = 'MailingEditorCompare'
const PUBLISH_ICON = 'i-ph-rocket-launch'
const DISCARD_ICON = 'i-ph-arrow-counter-clockwise'
const COMPARE_ICON = 'i-ph-columns'
const REVIEW_SIZE = 'lg'
const COMPARE_SIZE = '5xl'
const KEY = 'dms_mailing.editor'

/** What the publish review resolves with, from its footer buttons. */
export type PublishReviewChoice = 'publish' | 'test' | 'keep'

export interface ActionDeps {
	editor: EditorState
	session: EditorSession
	api: MailingApi
	reads: EditorReads
	templateId: string
	reload: () => Promise<void>
	onError: (error: unknown) => void
}

interface ActionTools {
	t: ReturnType<typeof useI18n>['t']
	toast: ReturnType<typeof useToast>
	modal: ReturnType<typeof useModal>
	confirm: ReturnType<typeof useConfirm>['confirm']
}

function createTestAction(
	{ editor, session, templateId }: ActionDeps,
	openTestSend: TemplateOverlays['openTestSend'],
) {
	return (): void =>
		openTestSend(templateId, {
			locale: editor.locale,
			content: deepClone(editor.content),
			data: session.testData ?? undefined,
		})
}

/** Which publish the review stands for; each has its own title and wording. */
type PublishKind = 'first' | 'changes' | 'republish'

function publishKindOf(deps: ActionDeps): PublishKind {
	const { state } = deps.session
	if (state.version === 0) return 'first'
	return state.changes.length > 0 ? 'changes' : 'republish'
}

/** The version the publish puts live: the next one, or the same again. */
function targetVersionOf(deps: ActionDeps): number {
	const { version } = deps.session.state
	return publishKindOf(deps) === 'republish' ? version : version + 1
}

const TITLE_KEYS: Record<PublishKind, string> = {
	first: `${KEY}.publish_review.title_first`,
	changes: `${KEY}.publish_review.title`,
	republish: `${KEY}.publish_review.title_republish`,
}

const DESCRIPTION_KEYS: Record<PublishKind, string> = {
	first: `${KEY}.publish_review.description_first`,
	changes: `${KEY}.publish_review.description`,
	republish: `${KEY}.publish_review.description_republish`,
}

function publishTitle(deps: ActionDeps, tools: ActionTools): string {
	const { state } = deps.session
	const count = state.changes.length
	const params = { count, name: state.template.name, version: state.version }
	return tools.t(TITLE_KEYS[publishKindOf(deps)], params, count)
}

function publishDescription(deps: ActionDeps, tools: ActionTools): string {
	const { state } = deps.session
	return tools.t(DESCRIPTION_KEYS[publishKindOf(deps)], {
		slug: state.template.slug,
		next: targetVersionOf(deps),
		version: state.version,
	})
}

function reviewChecks(deps: ActionDeps): EditorCheck[] {
	const { state } = deps.session
	const { content } = deps.editor
	const data = deps.session.testData ?? {}
	return [
		...contentChecks({
			content,
			locales: deps.editor.locales,
			fallback: state.fallbackLocale,
		}),
		...tokenChecks(content, data),
		...systemVariableChecks(content, state.template.category, data),
		...publishChecks({
			variables: deps.editor.variables,
			detected: deps.session.detected,
			data,
			blocks: [],
		}),
	]
}

function reviewOptions(deps: ActionDeps, tools: ActionTools) {
	const { state } = deps.session
	const translate = (key: string, params?: Record<string, string>) =>
		tools.t(key, params ?? {})
	const read = (entry: EditorCheck) => tools.t(entry.key, entry.params)
	return {
		lines: describeChanges(
			state.changes,
			{ draft: deps.editor.content, published: state.publishedContent },
			translate,
		),
		blockers: publishBlockers(deps.editor.content).map(read),
		warnings: reviewChecks(deps).map(read),
		nextVersion: targetVersionOf(deps),
		currentVersion: state.version,
		isRepublish: publishKindOf(deps) === 'republish',
	}
}

async function runPublish(deps: ActionDeps, tools: ActionTools): Promise<void> {
	try {
		const { version } = await deps.api.publish(
			deps.templateId,
			deps.session.state.revision,
		)
		tools.toast.add({
			color: 'success',
			title: tools.t(`${KEY}.publish_review.done`, { version }),
		})
		await deps.reload()
	} catch (error) {
		if (isDraftConflict(error)) return deps.session.markConflict()
		deps.onError(error)
	}
}

/**
 * Reads what the server would publish. A draft saved elsewhere since this
 * editor's last write is a conflict: the review would not show what ships.
 */
async function refreshChanges(deps: ActionDeps): Promise<boolean> {
	const response = await deps.reads.changes().catch(() => null)
	if (!response) return true
	const { state } = deps.session
	if (response.revision !== state.revision) {
		deps.session.markConflict()
		return false
	}
	state.version = response.version
	state.changes = response.changes
	return true
}

function canPublishNow(deps: ActionDeps): boolean {
	const { state } = deps.session
	return isPublishable({
		status: state.template.status,
		changeCount: state.changes.length,
		dirty: deps.editor.dirty,
	})
}

function createPublishAction(
	deps: ActionDeps,
	tools: ActionTools,
	test: () => void,
) {
	const component = resolveComponent(PUBLISH_REVIEW_COMPONENT) as Component
	return async (): Promise<void> => {
		if (!canPublishNow(deps)) return
		if (!(await deps.session.save())) return
		if (!(await refreshChanges(deps)) || !canPublishNow(deps)) return
		const choice = await tools.modal.open<PublishReviewChoice>({
			title: publishTitle(deps, tools),
			description: publishDescription(deps, tools),
			icon: PUBLISH_ICON,
			component,
			componentOptions: reviewOptions(deps, tools),
			size: REVIEW_SIZE,
		}).result
		const handlers: Record<PublishReviewChoice, () => unknown> = {
			publish: () => runPublish(deps, tools),
			test,
			keep: () => undefined,
		}
		if (choice) await handlers[choice]()
	}
}

function createDiscardAction(deps: ActionDeps, tools: ActionTools) {
	return async (): Promise<void> => {
		const { state } = deps.session
		const count = state.changes.length
		deps.session.cancel()
		await deps.session.settle()
		const confirmed = await tools.confirm({
			title: tools.t(`${KEY}.discard_dialog.title`),
			description: tools.t(
				`${KEY}.discard_dialog.description`,
				{ count, version: state.version },
				count,
			),
			color: 'error',
			icon: DISCARD_ICON,
			confirmLabel: tools.t(`${KEY}.discard_dialog.confirm`, { count }, count),
			cancelLabel: tools.t(`${KEY}.discard_dialog.cancel`),
			onConfirm: async () => {
				await deps.api.discard(deps.templateId)
			},
		})
		if (!confirmed) return void deps.session.save()
		deps.editor.markSaved()
		await deps.reload()
	}
}

function createCompareAction(deps: ActionDeps, tools: ActionTools) {
	const component = resolveComponent(COMPARE_COMPONENT) as Component
	return (): void =>
		void tools.modal.open({
			title: tools.t(`${KEY}.compare.title`),
			description: tools.t(`${KEY}.compare.description`, {
				version: deps.session.state.version,
			}),
			icon: COMPARE_ICON,
			component,
			componentOptions: {
				templateId: deps.templateId,
				locale: deps.editor.locale,
				locales: deps.editor.locales,
				content: deepClone(deps.editor.content),
				publishedContent: deps.session.state.publishedContent,
				changes: deps.session.state.changes,
				data: deps.session.testData ?? undefined,
			},
			size: COMPARE_SIZE,
		})
}

/**
 * Copies a published version into the draft, after this editor's pending
 * edits are written (the server refuses a restore behind them). The editor
 * then reloads on the restored draft; publishing it is the normal review.
 */
function createRestoreAction(deps: ActionDeps, tools: ActionTools) {
	return async (version: number): Promise<void> => {
		if (!(await deps.session.save())) return
		try {
			await deps.api.restoreVersion(
				deps.templateId,
				version,
				deps.session.state.revision,
			)
		} catch (error) {
			if (isDraftConflict(error)) return deps.session.markConflict()
			return deps.onError(error)
		}
		tools.toast.add({
			color: 'success',
			title: tools.t('dms_mailing.history.restored', { version }),
			description: tools.t('dms_mailing.history.restored_description'),
		})
		deps.editor.markSaved()
		await deps.reload()
	}
}

const LIFECYCLE_ICONS: Record<LifecycleAction, string> = {
	unpublish: 'i-ph-eye-slash',
	archive: 'i-ph-archive',
	restore: 'i-ph-arrow-u-up-left',
}
const CONFIRMED_LIFECYCLE: LifecycleAction[] = ['unpublish', 'archive']

async function confirmLifecycle(
	action: LifecycleAction,
	deps: ActionDeps,
	tools: ActionTools,
): Promise<boolean> {
	if (!CONFIRMED_LIFECYCLE.includes(action)) return true
	const slug = deps.session.state.template.slug
	return tools.confirm({
		title: tools.t(`${KEY}.lifecycle.${action}_title`),
		description: tools.t(`${KEY}.lifecycle.refuse_warning`, { slug }),
		color: 'warning',
		icon: LIFECYCLE_ICONS[action],
		confirmLabel: tools.t(`${KEY}.lifecycle.${action}`),
	})
}

function createLifecycleAction(deps: ActionDeps, tools: ActionTools) {
	const calls = {
		unpublish: deps.api.unpublish,
		archive: deps.api.archive,
		restore: deps.api.restore,
	}
	return async (action: LifecycleAction): Promise<void> => {
		if (!(await confirmLifecycle(action, deps, tools))) return
		try {
			const { status } = await calls[action](deps.templateId)
			const { state } = deps.session
			state.template = afterLifecycle(
				state.template,
				action,
				status as typeof state.template.status,
			)
			tools.toast.add({
				color: 'success',
				title: tools.t(`${KEY}.lifecycle.${action}_done`),
			})
		} catch (error) {
			deps.onError(error)
		}
	}
}

/**
 * The editor's dialogs and their server calls: publish review, discard,
 * compare with live, restore of a version, test send and a manual save. Call it in a component's
 * setup: it reads the DMS container composables.
 */
export function useEditorActions(deps: ActionDeps) {
	const tools: ActionTools = {
		t: useI18n().t,
		toast: useToast(),
		modal: useModal(),
		confirm: useConfirm().confirm,
	}
	const test = createTestAction(deps, useTemplateDrawer().openTestSend)
	return {
		test,
		publish: createPublishAction(deps, tools, test),
		discard: createDiscardAction(deps, tools),
		compare: createCompareAction(deps, tools),
		restoreVersion: createRestoreAction(deps, tools),
		async save(): Promise<void> {
			const hasPendingWrite = deps.editor.dirty > 0
			if ((await deps.session.save()) && hasPendingWrite)
				tools.toast.add({
					color: 'success',
					title: tools.t(`${KEY}.save_state.saved_toast`),
				})
		},
		/** Drops this editor's unsaved edits for the draft saved elsewhere. */
		async reload(): Promise<void> {
			deps.session.cancel()
			deps.editor.markSaved()
			await deps.reload()
		},
		async overwrite(): Promise<void> {
			await deps.session.overwrite()
		},
		runLifecycle: createLifecycleAction(deps, tools),
	}
}

export type EditorActions = ReturnType<typeof useEditorActions>
