import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/mailing-en-GB.json'

const APP = join(__dirname, '..', 'app')
const EDITOR_SOURCES = [
	join(APP, 'components', 'Editor.vue'),
	join(APP, 'composables', 'useEditorActions.ts'),
	join(APP, 'composables', 'useEditorShortcuts.ts'),
	...readdirSync(join(APP, 'components', 'editor')).map((file) =>
		join(APP, 'components', 'editor', file),
	),
]
const LITERAL_KEY =
	/'(dms_mailing\.(?:editor|blocks|templates\.status)\.[a-z_.]+)'/g
const PREFIX_CONSTANT = /const (\w*KEY) = '(dms_mailing[a-z_.]*)'/g
const PREFIXED_KEY = /\$\{(\w*KEY)\}\.([a-z_.]+)`/g

function keysUsedIn(source: string): string[] {
	const prefixes = new Map(
		[...source.matchAll(PREFIX_CONSTANT)].map((match) => [match[1], match[2]]),
	)
	const prefixValues = new Set(prefixes.values())
	const literal = [...source.matchAll(LITERAL_KEY)]
		.map((match) => match[1] as string)
		.filter((key) => !prefixValues.has(key))
	const prefixed = [...source.matchAll(PREFIXED_KEY)]
		.filter((match) => prefixes.has(match[1]))
		.map((match) => `${prefixes.get(match[1])}.${match[2]}`)
	return [...literal, ...prefixed]
}

function keysOf(value: unknown, prefix = ''): string[] {
	if (typeof value !== 'object' || value === null) return [prefix]
	return Object.entries(value).flatMap(([key, child]) =>
		keysOf(child, prefix ? `${prefix}.${key}` : key),
	)
}

describe('editor locales', () => {
	it('define every literal key the editor components use', () => {
		const known = new Set(keysOf(en))
		const used = EDITOR_SOURCES.flatMap((file) =>
			keysUsedIn(readFileSync(file, 'utf8')),
		)
		expect(used.length).toBeGreaterThan(0)
		expect(used.filter((key) => !known.has(key))).toEqual([])
	})
})
