import { describe, expect, it } from 'vitest'
import { mailingPath } from '../app/composables/useMailingApi'

describe('mailingPath', () => {
	it('builds module paths without double slashes', () => {
		expect(mailingPath('templates', 'abc', 'preview')).toBe(
			'/api/mailing/templates/abc/preview',
		)
	})
})
