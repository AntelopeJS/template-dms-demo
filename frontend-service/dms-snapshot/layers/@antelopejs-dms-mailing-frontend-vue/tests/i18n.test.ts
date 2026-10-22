import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/mailing-en-GB.json'
import fr from '../i18n/locales/mailing-fr-FR.json'

// vitest runs with the layer as its root; the backend sits one level above it.
const BACKEND_SOURCE_DIR = join(process.cwd(), '..', 'src')

// `$dms_mailing.a.b` as the backend writes it. A literal that stops on a dot is
// the prefix of a key completed by a template expression (`${status}`); those
// are resolved at runtime and cannot be checked here.
const KEY_LITERAL = /\$dms_mailing\.[\w.]+/g
const DYNAMIC_KEY_SUFFIX = '.'

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
			const key = literal.slice(1)
			if (!key.endsWith(DYNAMIC_KEY_SUFFIX)) found.add(key)
		}
	}
	return [...found].sort()
}

function messagesOf(value: unknown, prefix = ''): [string, string][] {
	if (typeof value === 'string') return [[prefix, value]]
	if (typeof value !== 'object' || value === null) return []
	return Object.entries(value).flatMap(([key, child]) =>
		messagesOf(child, prefix ? `${prefix}.${key}` : key),
	)
}

// `{name}` placeholders and `{'…'}` literals, the only braces a message holds.
const BRACED = /\{'[^']*'\}|\{\w+\}/g
const PLACEHOLDER = /\{(\w+)\}/g
const PLURAL_SEPARATOR = '|'
// vue-i18n's default rule picks, for three forms, the first at 0 and the
// second at 1: French says « 0 envoi », so every French plural needs all three.
const FRENCH_PLURAL_FORMS = 3

function placeholdersOf(message: string): string[] {
	return [
		...new Set([...message.matchAll(PLACEHOLDER)].map((match) => match[1])),
	].sort()
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
	it('cover every namespace the pages use', () => {
		for (const namespace of [
			'overview',
			'templates',
			'editor',
			'sends',
			'settings',
			'metrics',
			'funnel',
			'errors',
			'blocks',
		]) {
			expect(en.dms_mailing).toHaveProperty(namespace)
		}
	})
	it('resolve every static key the backend emits', () => {
		const keys = backendKeys()
		expect(keys.length).toBeGreaterThan(0)
		expect(keys.filter((key) => typeof resolve(en, key) !== 'string')).toEqual(
			[],
		)
		expect(keys.filter((key) => typeof resolve(fr, key) !== 'string')).toEqual(
			[],
		)
	})
	it('compile: no stray brace or unescaped @ outside placeholders', () => {
		const broken = [...messagesOf(en), ...messagesOf(fr)].filter(
			([, message]) => /[{}@]/.test(message.replace(BRACED, '')),
		)
		expect(broken).toEqual([])
	})
	it('give each message the same placeholders in both languages', () => {
		const french = new Map(messagesOf(fr))
		const mismatched = messagesOf(en)
			.filter(
				([key, message]) =>
					placeholdersOf(message).join() !==
					placeholdersOf(french.get(key) ?? '').join(),
			)
			.map(([key]) => key)
		expect(mismatched).toEqual([])
	})
	it('say « modèle », never « template », in French', () => {
		const anglicisms = messagesOf(fr)
			.filter(([, message]) => /\btemplates?\b/i.test(message))
			.map(([key]) => key)
		expect(anglicisms).toEqual([])
	})
	it('write every French plural with three forms, 0 in the singular', () => {
		const incomplete = messagesOf(fr)
			.filter(
				([, message]) =>
					message.includes(PLURAL_SEPARATOR) &&
					message.split(PLURAL_SEPARATOR).length !== FRENCH_PLURAL_FORMS,
			)
			.map(([key]) => key)
		expect(incomplete).toEqual([])
	})
})
