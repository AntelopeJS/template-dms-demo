import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/demo-en-GB.json'
import fr from '../i18n/locales/demo-fr-FR.json'

// vitest runs with the frontend module as its root; the backend module sits one
// level above it.
const BACKEND_SOURCE_DIR = join(process.cwd(), '..', 'src')

// `$demo.a.b` as the backend writes it: every translatable string it declares
// is a `$key` the frontend resolves through processI18n().
const KEY_LITERAL = /\$demo\.[\w.]+/g

function keysOf(value: unknown, prefix = ''): string[] {
	if (typeof value !== 'object' || value === null) return [prefix]
	return Object.entries(value).flatMap(([key, child]) =>
		keysOf(child, prefix ? `${prefix}.${key}` : key),
	)
}

function typescriptFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name)
		if (entry.isDirectory()) return typescriptFiles(path)
		return entry.isFile() && path.endsWith('.ts') ? [path] : []
	})
}

function backendKeys(): string[] {
	const found = new Set<string>()
	for (const file of typescriptFiles(BACKEND_SOURCE_DIR)) {
		for (const literal of readFileSync(file, 'utf8').match(KEY_LITERAL) ?? []) {
			found.add(literal.slice(1))
		}
	}
	return [...found].sort()
}

function resolve(root: unknown, key: string): unknown {
	return key
		.split('.')
		.reduce<unknown>(
			(node, part) =>
				typeof node === 'object' && node !== null
					? (node as Record<string, unknown>)[part]
					: undefined,
			root,
		)
}

describe('locales', () => {
	it('carry the same key set', () => {
		expect(keysOf(fr).sort()).toEqual(keysOf(en).sort())
	})

	it('resolve every key the backend emits', () => {
		const keys = backendKeys()
		expect(keys.length).toBeGreaterThan(0)
		expect(keys.filter((key) => typeof resolve(en, key) !== 'string')).toEqual(
			[],
		)
		expect(keys.filter((key) => typeof resolve(fr, key) !== 'string')).toEqual(
			[],
		)
	})
})
