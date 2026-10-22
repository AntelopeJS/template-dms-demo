// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { MailingApi } from '../app/composables/useMailingApi'
import {
	RETRY_BASE_DELAY_MS,
	useEditorSession,
} from '../app/composables/useEditorSession'
import type { EditorSession } from '../app/composables/useEditorSession'
import { useEditorLeaveGuard } from '../app/composables/useEditorShortcuts'
import { createEditorState } from '../app/composables/useTemplateEditor'
import type { EditorState } from '../app/composables/useTemplateEditor'
import type {
	TemplateContentResponse,
	VariableDefinition,
} from '../app/types/mailing'
import { flush, mount } from './helpers/nuxt-globals'
import type { Mounted } from './helpers/nuxt-globals'

const CONFLICT = {
	statusCode: 409,
	data: { message: '$dms_mailing.errors.draft_conflict' },
}
const SERVER_ERROR = { statusCode: 500, data: 'boom' }

const LOADED = {
	template: {
		_id: 't1',
		slug: 'welcome',
		name: 'Welcome',
		status: 'live',
		updatedAt: '2026-10-01T10:00:00Z',
		updatedBy: 'camille',
	},
	content: { locales: { en: { subject: 'Hi', preheader: '', blocks: [] } } },
	publishedContent: null,
	hasDraft: false,
	version: 2,
	revision: 3,
	changes: [],
	variables: [],
	detectedVariables: [],
	testData: {},
	fallbackLocale: 'en',
	blockOnMissingVariables: false,
	categories: [],
	sender: { name: '', email: '', replyTo: '' },
} as TemplateContentResponse

interface Harness {
	editor: EditorState
	session: EditorSession
	api: Record<string, ReturnType<typeof vi.fn>>
	errors: unknown[]
	guardDirty: () => boolean
	mounted: Mounted
}

function setup(): Harness {
	const api = {
		saveContent: vi.fn(),
		changes: vi.fn(),
	}
	const errors: unknown[] = []
	let guardDirty: () => boolean = () => false
	vi.stubGlobal('useUnsavedChanges', (options: { dirty: () => boolean }) => {
		guardDirty = options.dirty
	})
	const harness = { api, errors } as unknown as Harness
	const Host = defineComponent({
		setup() {
			harness.editor = createEditorState(LOADED.content, 'en', ['en'])
			harness.session = useEditorSession({
				editor: harness.editor,
				api: api as unknown as MailingApi,
				reads: {
					changes: () => api.changes('t1'),
					performance: async () => null as never,
				},
				templateId: 't1',
				loaded: LOADED,
				onError: (error) => errors.push(error),
			})
			useEditorLeaveGuard(harness.session)
			return () => h('div')
		},
	})
	harness.mounted = mount(Host, {})
	harness.guardDirty = () => guardDirty()
	return harness
}

const saved = (revision: number) => ({
	saved: true,
	revision,
	detectedVariables: [],
	changes: [{ locale: 'en', kind: 'subject' }],
})

describe('editor session autosave', () => {
	let harness: Harness

	beforeEach(() => {
		harness = setup()
	})
	afterEach(() => {
		harness.mounted.unmount()
		vi.useRealTimers()
	})

	it('carries the revision it saw and keeps the one the server answers', async () => {
		harness.api.saveContent!.mockResolvedValue(saved(4))
		harness.editor.updateLocale({ subject: 'Hello' })
		expect(await harness.session.save()).toBe(true)
		expect(harness.api.saveContent).toHaveBeenCalledWith(
			't1',
			expect.objectContaining({ revision: 3 }),
		)
		expect(harness.session.state.revision).toBe(4)
		expect(harness.session.state.saveStatus).toBe('idle')
	})

	it('saves the variable declarations with the draft content', async () => {
		harness.api.saveContent!.mockResolvedValue(saved(4))
		const declared: VariableDefinition = {
			path: 'order.id',
			type: 'string',
			required: true,
		}
		harness.editor.setVariables([declared])
		expect(await harness.session.save()).toBe(true)
		expect(harness.api.saveContent).toHaveBeenCalledWith(
			't1',
			expect.objectContaining({
				content: LOADED.content,
				variables: [declared],
				revision: 3,
			}),
		)
	})

	it('stops writing once the draft was saved elsewhere', async () => {
		harness.api.saveContent!.mockRejectedValue(CONFLICT)
		harness.editor.updateLocale({ subject: 'Mine' })
		expect(await harness.session.save()).toBe(false)
		expect(harness.session.state.saveStatus).toBe('conflict')
		expect(harness.session.notice?.kind).toBe('conflict')
		expect(harness.errors).toEqual(['$dms_mailing.errors.draft_conflict'])
		harness.editor.updateLocale({ subject: 'Mine again' })
		expect(await harness.session.save()).toBe(false)
		expect(harness.api.saveContent).toHaveBeenCalledTimes(1)
		expect(harness.guardDirty()).toBe(true)
	})

	it('overwrites the other draft with the latest revision', async () => {
		harness.api.saveContent!.mockRejectedValueOnce(CONFLICT)
		harness.editor.updateLocale({ subject: 'Mine' })
		await harness.session.save()
		harness.api.changes!.mockResolvedValue({
			version: 2,
			revision: 9,
			changes: [],
		})
		harness.api.saveContent!.mockResolvedValue(saved(10))
		expect(await harness.session.overwrite()).toBe(true)
		expect(harness.api.saveContent).toHaveBeenLastCalledWith(
			't1',
			expect.objectContaining({ revision: 9 }),
		)
		expect(harness.session.state.saveStatus).toBe('idle')
	})

	it('tries a failed save again on its own and toasts only once', async () => {
		vi.useFakeTimers()
		harness.api.saveContent!.mockRejectedValueOnce(SERVER_ERROR)
		harness.api.saveContent!.mockResolvedValue(saved(4))
		harness.editor.updateLocale({ subject: 'Hello' })
		expect(await harness.session.save()).toBe(false)
		expect(harness.session.state.saveStatus).toBe('error')
		expect(harness.session.notice?.kind).toBe('save_error')
		expect(harness.guardDirty()).toBe(true)
		await vi.advanceTimersByTimeAsync(RETRY_BASE_DELAY_MS)
		await flush()
		expect(harness.api.saveContent).toHaveBeenCalledTimes(2)
		expect(harness.session.state.saveStatus).toBe('idle')
		expect(harness.errors).toHaveLength(1)
		expect(harness.guardDirty()).toBe(false)
	})

	it('guards unsaved test data', () => {
		harness.session.state.testDataSource = '{"a": 1}'
		expect(harness.guardDirty()).toBe(true)
	})

	it('hands a pending draft to a keepalive request when the page goes away', () => {
		harness.api.saveContent!.mockResolvedValue(saved(4))
		harness.editor.updateLocale({ subject: 'Leaving' })
		window.dispatchEvent(new Event('pagehide'))
		expect(harness.api.saveContent).toHaveBeenCalledWith(
			't1',
			expect.objectContaining({ keepalive: true, revision: 3 }),
		)
	})

	it('asks the browser before unloading a draft not written yet', () => {
		harness.editor.updateLocale({ subject: 'Pending' })
		const event = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(event)
		expect(event.defaultPrevented).toBe(true)
	})
})
