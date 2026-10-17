import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// vitest runs with the frontend module as its root; the backend module sits one
// level above it.
const BACKEND_SOURCE_DIR = join(process.cwd(), '..', 'src')
const LOCALE_DIR = join(process.cwd(), 'i18n', 'locales')

// `$demo.a.b` / `$helio.a.b` as the backend writes them: every translatable
// string it declares is a `$key` the frontend resolves through processI18n().
// Keys are always written whole: a key assembled at runtime escapes this check.
const KEY_LITERAL = /\$(?:demo|helio)\.[\w.]+/g

type Catalog = Record<string, unknown>

function isCatalog(value: unknown): value is Catalog {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function merge(target: Catalog, source: Catalog): Catalog {
	for (const [key, value] of Object.entries(source)) {
		const current = target[key]
		target[key] =
			isCatalog(current) && isCatalog(value) ? merge(current, value) : value
	}
	return target
}

// The loader merges every `<name>-<locale>.json` of the module into one
// catalog per locale (each Helio domain ships its own pair of files).
function catalog(locale: string): Catalog {
	return readdirSync(LOCALE_DIR)
		.filter((file) => file.endsWith(`-${locale}.json`))
		.sort()
		.reduce<Catalog>(
			(merged, file) =>
				merge(merged, JSON.parse(readFileSync(join(LOCALE_DIR, file), 'utf8'))),
			{},
		)
}

const en = catalog('en-GB')
const fr = catalog('fr-FR')

function keysOf(value: unknown, prefix = ''): string[] {
	if (!isCatalog(value)) return [prefix]
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
			found.add(literal.slice(1).replace(/\.$/, ''))
		}
	}
	return [...found].sort()
}

function resolve(root: unknown, key: string): unknown {
	return key
		.split('.')
		.reduce<unknown>(
			(node, part) => (isCatalog(node) ? node[part] : undefined),
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
