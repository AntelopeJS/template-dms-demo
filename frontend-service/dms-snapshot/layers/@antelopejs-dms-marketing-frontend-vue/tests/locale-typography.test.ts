import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/marketing-en-GB.json'
import fr from '../i18n/locales/marketing-fr-FR.json'

/**
 * What vue-i18n and French typography expect of every message, checked on the
 * files themselves so a new string cannot bring a broken one back.
 */

const NO_BREAK_SPACE = '\u00A0'
const NARROW_NO_BREAK_SPACE = '\u202F'

// `{count}` messages whose count is never 1: a fixed minimum, a list cap.
const COUNT_NEVER_ONE = new Set([
  'page.marketing.experiment.insufficient_description',
  'page.marketing.pages.list_truncated',
])

// What intlify warns about as HTML in a message (`warnHtmlMessage`).
const HTML_TAG = /<\/?[\w\s="/.':;#-]+>/
// A `@` that is not the literal `{'@'}` starts a linked message.
const BARE_AT = /@(?<!\{'@)/

function messages(value: unknown, prefix = ''): [string, string][] {
  if (typeof value === 'string') {
    return [[prefix, value]]
  }
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => messages(child, prefix ? `${prefix}.${key}` : key),
  )
}

const english = messages(en)
const french = messages(fr)

function offending(
  list: [string, string][],
  test: (text: string, key: string) => boolean,
): string[] {
  return list.filter(([key, text]) => test(text, key)).map(([key]) => key)
}

describe('locale messages', () => {
  it('pair every English key with a French one', () => {
    expect(french.map(([key]) => key).sort()).toEqual(
      english.map(([key]) => key).sort(),
    )
  })

  it('carry no HTML, which vue-i18n warns about', () => {
    expect(
      offending([...english, ...french], (text) => HTML_TAG.test(text)),
    ).toEqual([])
  })

  it("escape every @ as {'@'}", () => {
    expect(
      offending([...english, ...french], (text) => BARE_AT.test(text)),
    ).toEqual([])
  })

  it('give a count its singular and plural forms', () => {
    const needsForms = (text: string, key: string) =>
      text.includes('{count}') &&
      !text.includes('|') &&
      !COUNT_NEVER_ONE.has(key)
    expect(offending(english, needsForms)).toEqual([])
    expect(offending(french, needsForms)).toEqual([])
  })

  it('pluralise the same keys in both languages', () => {
    const plural = new Map(
      english.map(([key, text]) => [key, text.includes('|')]),
    )
    expect(
      offending(french, (text, key) => text.includes('|') !== plural.get(key)),
    ).toEqual([])
  })
})

describe('French typography', () => {
  it('keeps : ; ! ? % and » off the start of a line', () => {
    expect(offending(french, (text) => / [:;!?%»]/.test(text))).toEqual([])
    expect(offending(french, (text) => /« /.test(text))).toEqual([])
  })

  it('puts a narrow no-break space before ; ! ? % and a no-break space before :', () => {
    expect(
      offending(french, (text) =>
        // "(%)": a unit in a field label.
        new RegExp(`[^${NARROW_NO_BREAK_SPACE}(][;!?%]`).test(text),
      ),
    ).toEqual([])
    expect(
      offending(french, (text) =>
        new RegExp(`[^${NO_BREAK_SPACE}]:`).test(text),
      ),
    ).toEqual([])
  })

  it('writes French quotes and straight apostrophes', () => {
    expect(offending(french, (text) => /[“”’]/.test(text))).toEqual([])
  })

  it('leaves no English product words in French prose', () => {
    expect(
      offending(french, (text) =>
        /\b(analytics|first-party|tracker|snippet|capture|tagu)/i.test(
          // utm_* parameters are typed as they are; placeholders are code.
          text.replace(/utm_\w+|\{\w+\}|\(first-party\)/g, ''),
        ),
      ),
    ).toEqual([])
  })
})
