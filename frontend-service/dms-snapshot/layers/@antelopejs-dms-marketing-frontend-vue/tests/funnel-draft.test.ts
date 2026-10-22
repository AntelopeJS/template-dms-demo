import { describe, expect, it } from 'vitest'
import {
  draftIssues,
  isExperimentKey,
  splitSampleSize,
  templateSteps,
  variationSnippet,
  type FunnelDraftValues,
} from '../app/utils/funnel-draft'
import { sampleSizePerArm } from '../app/utils/sample-size'

function draft(overrides: Partial<FunnelDraftValues> = {}): FunnelDraftValues {
  return {
    name: 'Checkout',
    websiteId: 'acme-shop',
    steps: [{ kind: 'url', value: '/cart' }],
    windowHours: 24,
    split: false,
    experimentKey: '',
    variations: [
      { key: 'control', weight: 1 },
      { key: 'bold', weight: 1 },
    ],
    ...overrides,
  }
}

describe('experiment keys', () => {
  it('follow the server rule: a slug starting with a letter or a digit, 64 max', () => {
    expect(isExperimentKey('hero-cta')).toBe(true)
    expect(isExperimentKey('a_1')).toBe(true)
    expect(isExperimentKey('-abc')).toBe(false)
    expect(isExperimentKey('_abc')).toBe(false)
    expect(isExperimentKey('Hero CTA')).toBe(false)
    expect(isExperimentKey('')).toBe(false)
    expect(isExperimentKey('a'.repeat(64))).toBe(true)
    expect(isExperimentKey('a'.repeat(65))).toBe(false)
  })
})

describe('template links', () => {
  it('keep the valid steps and drop the rest, never throwing', () => {
    expect(templateSteps('[{"kind":"custom"}]')).toEqual([])
    expect(templateSteps('not json')).toEqual([])
    expect(templateSteps('{"kind":"url","value":"/"}')).toEqual([])
    expect(templateSteps(undefined)).toEqual([])
    expect(
      templateSteps(
        JSON.stringify([
          { kind: 'foo', value: '/a' },
          { kind: 'url', value: ' /b ' },
          { kind: 'url', value: `/${'x'.repeat(600)}` },
          { kind: 'custom', value: 'signup' },
        ]),
      ),
    ).toEqual([
      { kind: 'url', value: '/b' },
      { kind: 'custom', value: 'signup' },
    ])
  })

  it('stop at the step limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      kind: 'url',
      value: `/p${i}`,
    }))
    expect(templateSteps(JSON.stringify(many))).toHaveLength(10)
  })
})

describe('draft issues', () => {
  it('are empty for a valid funnel', () => {
    expect(draftIssues(draft(), false)).toEqual({})
  })

  it('name the field each refusal belongs to', () => {
    const issues = draftIssues(
      draft({
        name: ' ',
        websiteId: '',
        steps: [{ kind: 'url', value: '' }],
        windowHours: 1000,
      }),
      false,
    )
    expect(Object.keys(issues)).toEqual([
      'name',
      'websiteId',
      'steps',
      'conversionWindowHours',
    ])
  })

  it('flag the step that is too long', () => {
    const issues = draftIssues(
      draft({
        steps: [
          { kind: 'url', value: '/a' },
          { kind: 'url', value: `/${'x'.repeat(500)}` },
        ],
      }),
      false,
    )
    expect(issues.steps).toMatchObject({ message: 'step_length', index: 1 })
  })

  it('refuse a window that is empty, fractional or out of bounds', () => {
    for (const windowHours of ['', 0, 1.5, 721]) {
      expect(draftIssues(draft({ windowHours }), false)).toHaveProperty(
        'conversionWindowHours',
      )
    }
    expect(draftIssues(draft({ windowHours: 720 }), false)).toEqual({})
  })

  it('check the split: key, arm keys, then weights', () => {
    const split = { split: true, experimentKey: 'hero-cta' }
    expect(draftIssues(draft(split), false)).toEqual({})
    expect(
      draftIssues(draft({ ...split, experimentKey: '-abc' }), false),
    ).toHaveProperty('experiment')
    expect(
      draftIssues(
        draft({
          ...split,
          variations: [
            { key: 'a', weight: 1 },
            { key: 'a', weight: 1 },
          ],
        }),
        false,
      ).variations,
    ).toMatchObject({ message: 'variations', index: 1 })
    for (const weights of [
      [0, 0],
      [-3, 1],
      ['', 1],
    ]) {
      expect(
        draftIssues(
          draft({
            ...split,
            variations: [
              { key: 'control', weight: weights[0]! },
              { key: 'bold', weight: weights[1]! },
            ],
          }),
          false,
        ).variations,
      ).toMatchObject({ message: 'weights' })
    }
  })

  it('leave a started split alone: its key and arms are frozen', () => {
    expect(
      draftIssues(draft({ split: true, experimentKey: '-abc' }), true),
    ).toEqual({})
  })
})

describe('split sample size', () => {
  it('is what the smallest arm needs, scaled to the whole traffic', () => {
    const perArm = sampleSizePerArm(0.04, 0.2)
    expect(splitSampleSize(0.04, 0.2, [1, 1])).toBeCloseTo(perArm * 2)
    expect(splitSampleSize(0.04, 0.2, [1, 3])).toBeCloseTo(perArm * 4)
    expect(splitSampleSize(0.04, 0.2, [1, 1, 1])).toBeCloseTo(perArm * 3)
  })

  it('ignores arms that receive no traffic, and needs two that do', () => {
    const perArm = sampleSizePerArm(0.04, 0.2)
    expect(splitSampleSize(0.04, 0.2, [1, 1, 0])).toBeCloseTo(perArm * 2)
    expect(splitSampleSize(0.04, 0.2, [1, 0])).toBeNull()
    expect(splitSampleSize(0, 0.2, [1, 1])).toBeNull()
  })
})

describe('variation snippet', () => {
  it('runs in a classic script: no top-level await', () => {
    const code = variationSnippet('hero-cta', 'control', ['bold', 'quiet'])
    expect(code).not.toMatch(/^\s*(const|let|var) .*= await/m)
    expect(code).toContain('variation("hero-cta").then(')
    expect(code).toContain('} else if (arm === "quiet") {')
    expect(() => new Function(code)).not.toThrow()
  })

  it('writes its comments in the language it is given', () => {
    const code = variationSnippet('hero-cta', 'control', ['bold'], {
      show: (variation) => `afficher ${variation}`,
      keep: (control) => `garder ${control}`,
    })
    expect(code).toContain('// afficher bold')
    expect(code).toContain('// garder control')
  })
})
