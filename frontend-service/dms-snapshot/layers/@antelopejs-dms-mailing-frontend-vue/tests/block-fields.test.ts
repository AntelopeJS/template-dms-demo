import { describe, expect, it } from 'vitest'
import { fieldsFor, isFieldValueValid } from '../app/utils/blocks/fields'

describe('fieldsFor', () => {
	it('lists the editable fields of each block type', () => {
		expect(fieldsFor('button').map((field) => field.key)).toEqual([
			'text',
			'href',
			'align',
		])
		expect(fieldsFor('heading').map((field) => field.key)).toEqual([
			'text',
			'align',
			'size',
		])
		expect(fieldsFor('divider')).toEqual([])
		expect(fieldsFor('list').map((field) => field.kind)).toEqual([
			'path',
			'text',
			'text',
		])
		expect(fieldsFor('paragraph')[0]?.kind).toBe('tokens')
		expect(fieldsFor('button')[0]?.kind).toBe('token')
	})
	it('refuses an empty value for the fields the backend requires', () => {
		const [source, labelPath] = fieldsFor('list')
		expect(source?.isRequired && labelPath?.isRequired).toBe(true)
		expect(isFieldValueValid(labelPath!, ' ')).toBe(false)
		expect(isFieldValueValid(labelPath!, 'label')).toBe(true)
		const [text] = fieldsFor('paragraph')
		expect(isFieldValueValid(text!, '')).toBe(true)
	})
})
