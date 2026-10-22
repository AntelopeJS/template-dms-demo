import { describe, expect, it } from 'vitest'
import { VARIABLE_TYPES } from '../app/types/mailing'
import {
	variableTypeItems,
	variableTypeLabelKey,
} from '../app/utils/variable-types'

describe('variable types', () => {
	it('labels each stored type with its i18n key', () => {
		expect(variableTypeLabelKey('money')).toBe(
			'dms_mailing.variable_types.money',
		)
		const items = variableTypeItems((key) => `t:${key}`)
		expect(items.map((item) => item.value)).toEqual(VARIABLE_TYPES)
		expect(items[0]).toEqual({
			value: 'string',
			label: 't:dms_mailing.variable_types.string',
		})
	})
})
