import { describe, expect, it } from 'vitest'
// The server's own rules, read from its sources: the builder and the website
// forms check a draft before saving it, and must refuse what the API refuses.
import * as server from '../../src/types/constants'
import { normalizeStepPath } from '../../src/services/funnels/step-path'
import * as draft from '../app/utils/funnel-draft'
import { normalizeFunnelStepPath } from '../app/utils/step-path'
import {
  MAX_WEBSITE_DOMAIN_LENGTH,
  MAX_WEBSITE_NAME_LENGTH,
  MODULE_CONFIG_KEY,
} from '../app/constants'

describe('front rules mirror the server', () => {
  it('reads its public options where the backend puts them', () => {
    expect(MODULE_CONFIG_KEY).toBe(server.FRONTEND_CONFIG_KEY)
  })

  it('caps a funnel draft as the server does', () => {
    expect(draft.MAX_NAME_LENGTH).toBe(server.MAX_NAME_LENGTH)
    expect(draft.MAX_STEPS).toBe(server.MAX_FUNNEL_STEPS)
    expect(draft.MAX_STEP_VALUE_LENGTH).toBe(
      server.MAX_FUNNEL_STEP_VALUE_LENGTH,
    )
    expect(draft.MAX_WINDOW_HOURS).toBe(server.MAX_CONVERSION_WINDOW_HOURS)
    expect(draft.MIN_VARIATIONS).toBe(server.MIN_EXPERIMENT_VARIATIONS)
    expect(draft.MAX_VARIATIONS).toBe(server.MAX_EXPERIMENT_VARIATIONS)
    expect(draft.MAX_EXPERIMENT_KEY_LENGTH).toBe(
      server.MAX_EXPERIMENT_KEY_LENGTH,
    )
  })

  it('accepts the experiment keys the server accepts', () => {
    const keys = [
      'hero-cta',
      'v2_bold',
      '0day',
      '-lead',
      '_lead',
      'Hero',
      'with space',
      'é',
      'a'.repeat(server.MAX_EXPERIMENT_KEY_LENGTH),
      'a'.repeat(server.MAX_EXPERIMENT_KEY_LENGTH + 1),
    ]
    for (const key of keys) {
      expect(draft.isExperimentKey(key), key).toBe(
        server.EXPERIMENT_KEY_PATTERN.test(key) &&
          key.length <= server.MAX_EXPERIMENT_KEY_LENGTH,
      )
    }
  })

  it('normalizes a page step as the server does', () => {
    const typed = [
      '/pricing',
      'pricing',
      '/Sale/Chairs/',
      '/',
      '',
      '  /cart?step=2#top ',
      'https://shop.acme.test/Sale/Chairs/?utm=x',
      'shop.acme.test/checkout/',
      'HTTP://Shop.Acme.Test/a',
      '/blog/*',
      'shop.acme.test/blog/*',
      '*',
      '/a b',
      'http://[bad',
    ]
    for (const value of typed) {
      expect(normalizeFunnelStepPath(value), value).toBe(
        normalizeStepPath(value),
      )
    }
  })

  it('caps a website name and domain as the server does', () => {
    expect(MAX_WEBSITE_NAME_LENGTH).toBe(server.MAX_NAME_LENGTH)
    expect(MAX_WEBSITE_DOMAIN_LENGTH).toBe(server.MAX_DOMAIN_LENGTH)
  })
})
