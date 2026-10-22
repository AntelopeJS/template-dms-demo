import { describe, expect, it } from 'vitest'
import {
	interpolateText,
	resolveToken,
	splitRawSegments,
	splitTokens,
} from '../app/utils/tokens'
import { textPaths } from '../app/utils/paths'
import { interpolate } from '../../src/engine/tokens'

describe('splitTokens', () => {
	it('splits text into literal and token parts', () => {
		expect(splitTokens('Hi {{ customer.firstName }}!')).toEqual([
			{ kind: 'text', value: 'Hi ' },
			{ kind: 'token', value: 'customer.firstName' },
			{ kind: 'text', value: '!' },
		])
	})
	it('flags what looks like a token but breaks the engine grammar', () => {
		expect(splitTokens('{{user-name}} {{first name}} {{a.b[]}}')).toEqual([
			{ kind: 'invalid', value: '{{user-name}}' },
			{ kind: 'text', value: ' ' },
			{ kind: 'invalid', value: '{{first name}}' },
			{ kind: 'text', value: ' ' },
			{ kind: 'token', value: 'a.b[]' },
		])
		expect(textPaths('{{user-name}} {{ok}}')).toEqual(['ok'])
	})
})

describe('token values', () => {
	const data = { customer: { firstName: 'Margaux' }, order: { lines: [1] } }
	it('resolves a token against test data', () => {
		expect(resolveToken('customer.firstName', data)).toEqual({
			isPresent: true,
			text: 'Margaux',
		})
		expect(resolveToken('order.total', data)).toEqual({
			isPresent: false,
			text: 'order.total',
		})
	})
	it('interpolates the tokens it can and keeps the others', () => {
		expect(
			interpolateText('Hi {{ customer.firstName }}, {{order.total}}', data),
		).toBe('Hi Margaux, {{order.total}}')
	})
	it('blanks a missing token in send mode, as a real e-mail', () => {
		expect(
			interpolateText(
				'Hi {{ customer.firstName }}{{order.total}}!',
				data,
				'send',
			),
		).toBe('Hi Margaux!')
	})
	it('keeps the raw spelling of each token for the highlight layer', () => {
		expect(splitRawSegments('a {{ x.y }}b {{x-y}}')).toEqual([
			{ kind: 'text', raw: 'a ', value: 'a ' },
			{ kind: 'token', raw: '{{ x.y }}', value: 'x.y' },
			{ kind: 'text', raw: 'b ', value: 'b ' },
			{ kind: 'invalid', raw: '{{x-y}}', value: '{{x-y}}' },
		])
	})
})

describe('parity with the send engine', () => {
	const data = {
		'user-name': 'Bob',
		'first name': 'Ann',
		user: { name: 'Zoe' },
		order: { total: '€20', lines: ['a', 'b'] },
		tags: ['a', 'b'],
		count: 0,
		flag: false,
	}
	const samples = [
		'Hi {{user-name}} / {{first name}}',
		'{{ user.name }} {{user.missing}}',
		'{{order}} / {{tags}} / {{order.lines[]}}',
		'{{count}}-{{flag}} {{{user.name}}} {{}} {{ }}',
		'Line one\nLine two {{order.total}}',
	]
	it.each(samples)('prints %j as the engine does', (sample) => {
		expect(interpolateText(sample, data)).toBe(interpolate(sample, data).text)
		expect(interpolateText(sample, data, 'send')).toBe(
			interpolate(sample, data, 'send').text,
		)
	})
})
