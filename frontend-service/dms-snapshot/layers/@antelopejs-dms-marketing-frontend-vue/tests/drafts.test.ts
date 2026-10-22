import { describe, expect, it } from 'vitest'
import {
  parseExperimentValue,
  parseExperimentVariationsValue,
} from '../app/composables/useExperiment'
import { parseFunnelStepsValue } from '../app/composables/useFunnelSteps'

// Both shapes reach the inputs: the real value on a form, a JSON string on a
// table cell. Neither parser may throw — they run while rendering.
describe('parseFunnelStepsValue', () => {
  it('reads the array and its JSON form alike', () => {
    const steps = [{ kind: 'url' as const, value: '/pricing' }]
    expect(parseFunnelStepsValue(steps)).toEqual(steps)
    expect(parseFunnelStepsValue(JSON.stringify(steps))).toEqual(steps)
  })

  it('answers an empty list on anything else', () => {
    for (const input of [null, undefined, '', 'not json', '{}', 42]) {
      expect(parseFunnelStepsValue(input)).toEqual([])
    }
  })
})

describe('parseExperimentValue', () => {
  it('reads the object and its JSON form alike', () => {
    const experiment = {
      key: 'cta',
      variations: [{ key: 'a', weight: 1 }],
      runs: [{ startedAt: 1, stoppedAt: null }],
    }
    expect(parseExperimentValue(experiment)).toEqual(experiment)
    expect(parseExperimentValue(JSON.stringify(experiment))).toEqual(experiment)
  })

  it('reads a value carrying no runs as a split that served no traffic', () => {
    expect(parseExperimentValue({ key: 'cta', variations: [] })?.runs).toEqual(
      [],
    )
  })

  it('answers null on anything else', () => {
    for (const input of [null, undefined, '', 'not json', 42]) {
      expect(parseExperimentValue(input)).toBeNull()
    }
  })
})

describe('parseExperimentVariationsValue', () => {
  it('answers an empty list on anything that is not an array', () => {
    for (const input of [null, undefined, '', 'not json', '{}']) {
      expect(parseExperimentVariationsValue(input)).toEqual([])
    }
  })
})
