import { describe, expect, it } from 'vitest'
import {
	afterLifecycle,
	canPublish,
	isPublishable,
	lifecycleActions,
	noticeFor,
	noticeMomentOf,
	publishedMoment,
	statusKeyOf,
} from '../app/utils/lifecycle'

describe('lifecycle', () => {
	it('dates an unpublish now, so the notice reads its moment', () => {
		const template = {
			_id: 't1',
			slug: 'welcome',
			name: 'Welcome',
			status: 'live' as const,
			updatedAt: '2026-01-01T00:00:00.000Z',
			updatedBy: 'me',
			publishedAt: '2026-01-01T00:00:00.000Z',
		}
		const now = new Date('2026-02-03T04:05:06.000Z')
		const unpublished = afterLifecycle(template, 'unpublish', 'draft', now)
		expect(unpublished).toMatchObject({
			status: 'draft',
			unpublishedAt: now.toISOString(),
		})
		expect(noticeMomentOf('unpublished', unpublished)).toBe(now.toISOString())
		expect(afterLifecycle(template, 'archive', 'archived', now)).toEqual({
			...template,
			status: 'archived',
		})
	})
	it('offers only the transitions the backend accepts', () => {
		expect(lifecycleActions('live').map((button) => button.action)).toEqual([
			'unpublish',
			'archive',
		])
		expect(lifecycleActions('draft').map((button) => button.action)).toEqual([
			'archive',
		])
		expect(lifecycleActions('archived').map((button) => button.action)).toEqual(
			['restore'],
		)
		expect(canPublish('archived')).toBe(false)
		expect(canPublish('draft')).toBe(true)
	})
	it('picks the notice from status, version and pending changes', () => {
		const base = { saveStatus: 'idle' as const }
		expect(
			noticeFor({ ...base, status: 'live', version: 12, changeCount: 3 }),
		).toEqual({
			kind: 'live_changes',
			tone: 'primary',
			actions: ['compare', 'discard'],
		})
		expect(
			noticeFor({ ...base, status: 'live', version: 12, changeCount: 0 })?.kind,
		).toBe('live_clean')
		expect(
			noticeFor({ ...base, status: 'draft', version: 0, changeCount: 2 }),
		).toEqual({ kind: 'never_published', tone: 'primary', actions: [] })
		expect(
			noticeFor({ ...base, status: 'draft', version: 0, changeCount: 0 }),
		).toBeNull()
		expect(
			noticeFor({ ...base, status: 'archived', version: 4, changeCount: 0 }),
		).toBeNull()
	})
	it('tells an unpublished template apart and offers to republish it', () => {
		const unpublished = noticeFor({
			status: 'draft',
			version: 5,
			changeCount: 0,
			saveStatus: 'idle',
		})
		expect(unpublished).toEqual({
			kind: 'unpublished',
			tone: 'warning',
			actions: ['republish'],
		})
		expect(
			noticeFor({
				status: 'draft',
				version: 5,
				changeCount: 2,
				saveStatus: 'idle',
			})?.actions,
		).toEqual(['compare', 'discard', 'republish'])
		expect(statusKeyOf('draft', 5)).toBe('unpublished')
		expect(statusKeyOf('draft', 0)).toBe('draft')
		expect(statusKeyOf('live', 5)).toBe('live')
	})
	it('puts a failed save or a conflict before any other notice', () => {
		const live = { status: 'live' as const, version: 3, changeCount: 1 }
		expect(noticeFor({ ...live, saveStatus: 'error' })).toEqual({
			kind: 'save_error',
			tone: 'error',
			actions: ['retry'],
		})
		expect(noticeFor({ ...live, saveStatus: 'conflict' })).toEqual({
			kind: 'conflict',
			tone: 'error',
			actions: ['reload', 'overwrite'],
		})
	})
	it('dates an unpublished notice by the unpublish', () => {
		const template = {
			publishedAt: '2026-09-01T10:00:00Z',
			unpublishedAt: '2026-10-01T10:00:00Z',
			updatedAt: '2026-10-02T10:00:00Z',
		}
		expect(noticeMomentOf('unpublished', template)).toBe(template.unpublishedAt)
		expect(
			noticeMomentOf('unpublished', { ...template, unpublishedAt: null }),
		).toBe(template.updatedAt)
		expect(noticeMomentOf('live_clean', template)).toBe(template.publishedAt)
	})
	it('lets ⌘↵ publish exactly when the button would', () => {
		expect(isPublishable({ status: 'live', changeCount: 0, dirty: 0 })).toBe(
			false,
		)
		expect(isPublishable({ status: 'live', changeCount: 1, dirty: 0 })).toBe(
			true,
		)
		expect(isPublishable({ status: 'live', changeCount: 0, dirty: 2 })).toBe(
			true,
		)
		expect(isPublishable({ status: 'draft', changeCount: 0, dirty: 0 })).toBe(
			true,
		)
		expect(
			isPublishable({ status: 'archived', changeCount: 3, dirty: 0 }),
		).toBe(false)
	})
	it('splits a publication date for the notice', () => {
		const moment = publishedMoment('2026-09-29T09:14:00', 'en-GB')
		expect(moment?.time).toBe('09:14')
		expect(moment?.date).toContain('29')
		expect(publishedMoment(null, 'en-GB')).toBeNull()
		expect(publishedMoment('nope', 'en-GB')).toBeNull()
	})
})
