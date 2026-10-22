import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/marketing-en-GB.json'
import fr from '../i18n/locales/marketing-fr-FR.json'

// vitest runs with the frontend module as its root; the backend sits one level
// above it.
const BACKEND_SOURCE_DIR = join(process.cwd(), '..', 'src')

// `$page.marketing.a.b` as the backend writes it. A literal that stops on a
// dot is the prefix of a key completed by a template expression; those are
// resolved at runtime and cannot be checked here.
const KEY_LITERAL = /\$page\.marketing\.[\w.]+/g
const DYNAMIC_KEY_SUFFIX = '.'

function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix]
  }
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix ? `${prefix}.${key}` : key),
  )
}

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return typescriptFiles(path)
    }
    return entry.isFile() && path.endsWith('.ts') ? [path] : []
  })
}

function backendKeys(): string[] {
  const found = new Set<string>()
  for (const file of typescriptFiles(BACKEND_SOURCE_DIR)) {
    for (const literal of readFileSync(file, 'utf8').match(KEY_LITERAL) ?? []) {
      const key = literal.slice(1)
      if (!key.endsWith(DYNAMIC_KEY_SUFFIX)) {
        found.add(key)
      }
    }
  }
  return [...found].sort()
}

const COMPONENT_DIR = join(process.cwd(), 'app')
// `t('page.marketing.a.b'` as the components call it; template-built keys
// are resolved at runtime and cannot be checked here.
const COMPONENT_KEY = /t\('(page\.marketing\.[\w.-]+)'/g

function filesUnder(directory: string, extension: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return filesUnder(path, extension)
    }
    return entry.isFile() && path.endsWith(extension) ? [path] : []
  })
}

function componentKeys(): string[] {
  const found = new Set<string>()
  for (const file of [
    ...filesUnder(COMPONENT_DIR, '.vue'),
    ...filesUnder(COMPONENT_DIR, '.ts'),
  ]) {
    for (const match of readFileSync(file, 'utf8').matchAll(COMPONENT_KEY)) {
      found.add(match[1]!)
    }
  }
  return [...found].sort()
}

// The second argument of MarketingBlock(name, key, …) and of blockMeta(key, …):
// the key every block's permission title is read under.
const BLOCK_KEY =
  /(?:MarketingBlock\(\s*"\w+",\s*|blockMeta\(\s*)[`"]([\w${}.-]+)[`"]/g

function blockKeys(): string[] {
  const found = new Set<string>()
  for (const file of typescriptFiles(join(BACKEND_SOURCE_DIR, 'pages'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(BLOCK_KEY)) {
      if (!match[1]!.includes('$')) {
        found.add(match[1]!)
      }
    }
  }
  return [...found].sort()
}

function resolveKey(root: unknown, key: string): unknown {
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

  it('cover every namespace the surfaces use', () => {
    for (const namespace of [
      'context',
      'overview',
      'acquisition',
      'pages',
      'funnels',
      'funnel',
      'experiment',
      'builder',
      'websites',
      'install',
      'settings',
      'blocks',
      'errors',
    ]) {
      expect(en.page.marketing).toHaveProperty(namespace)
    }
  })

  it('resolve every static key the components ask for', () => {
    const keys = componentKeys()
    expect(keys.length).toBeGreaterThan(0)
    expect(
      keys.filter((key) => typeof resolveKey(en, key) !== 'string'),
    ).toEqual([])
    expect(
      keys.filter((key) => typeof resolveKey(fr, key) !== 'string'),
    ).toEqual([])
  })

  it('name every block the pages declare', () => {
    for (const key of backendKeys().filter((key) =>
      key.startsWith('page.marketing.blocks.'),
    )) {
      expect(typeof resolveKey(en, key)).toBe('string')
    }
    expect(blockKeys().length).toBeGreaterThan(20)
    for (const block of blockKeys()) {
      expect(typeof resolveKey(en, `page.marketing.blocks.${block}.name`)).toBe(
        'string',
      )
      expect(
        typeof resolveKey(fr, `page.marketing.blocks.${block}.description`),
      ).toBe('string')
    }
  })

  it('resolve every static key the backend emits', () => {
    const keys = backendKeys()
    expect(keys.length).toBeGreaterThan(0)
    expect(
      keys.filter((key) => typeof resolveKey(en, key) !== 'string'),
    ).toEqual([])
    expect(
      keys.filter((key) => typeof resolveKey(fr, key) !== 'string'),
    ).toEqual([])
  })
})
