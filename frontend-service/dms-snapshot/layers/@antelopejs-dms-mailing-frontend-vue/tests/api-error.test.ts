import { describe, expect, it } from 'vitest'
import {
	HTTP_CONFLICT,
	apiErrorMessage,
	apiErrorStatus,
} from '../app/utils/api-error'

describe('apiErrorStatus', () => {
	it('reads the status a fetch error carries', () => {
		expect(apiErrorStatus({ statusCode: HTTP_CONFLICT })).toBe(HTTP_CONFLICT)
		expect(apiErrorStatus({ status: 422 })).toBe(422)
		expect(apiErrorStatus(new Error('offline'))).toBe(0)
		expect(apiErrorStatus(null)).toBe(0)
	})
})

describe('apiErrorMessage', () => {
	it('prefers the backend message key', () => {
		expect(
			apiErrorMessage({
				data: { message: '$dms_mailing.errors.duplicate_slug' },
			}),
		).toBe('$dms_mailing.errors.duplicate_slug')
		expect(apiErrorMessage({ data: 'Bad body' })).toBe('Bad body')
		expect(apiErrorMessage(new Error('offline'))).toBe('offline')
	})
})
