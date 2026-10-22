import { describe, expect, it } from 'vitest'
import {
  acquisitionLink,
  funnelBuilderLink,
  funnelLink,
  funnelsLink,
  installLink,
  overviewLink,
  pagesLink,
  withWebsite,
} from '../app/composables/useMarketingRoutes'

describe('module links', () => {
  it('stay bare when nothing is selected', () => {
    expect(pagesLink()).toBe('/modules/marketing/pages')
    expect(acquisitionLink()).toBe('/modules/marketing/acquisition')
    expect(funnelsLink()).toBe('/modules/marketing/funnels')
    expect(funnelBuilderLink()).toBe('/modules/marketing/funnel-builder')
    expect(installLink()).toBe('/modules/marketing/install')
  })

  it('encode the values they carry', () => {
    expect(pagesLink('/pricing?x=1')).toBe(
      '/modules/marketing/pages?path=%2Fpricing%3Fx%3D1',
    )
    expect(funnelLink('f 1')).toBe('/modules/marketing/funnel?id=f+1')
    expect(installLink('site-1')).toBe(
      '/modules/marketing/install?website=site-1',
    )
  })

  it('carry a template and the split switch to the builder', () => {
    const link = funnelBuilderLink(null, {
      split: true,
      steps: [{ kind: 'custom', value: 'signup' }],
    })
    const query = new URL(link, 'http://x').searchParams
    expect(query.get('split')).toBe('1')
    expect(JSON.parse(query.get('steps')!)).toEqual([
      { kind: 'custom', value: 'signup' },
    ])
  })

  it('opens the builder on a copy of a funnel (Duplicate)', () => {
    expect(funnelBuilderLink(null, { copy: 'f1' })).toBe(
      '/modules/marketing/funnel-builder?copy=f1',
    )
  })

  it('open the overview on a website', () => {
    expect(overviewLink()).toBe('/modules/marketing/overview')
    expect(overviewLink('site-1')).toBe(
      '/modules/marketing/overview?website=site-1',
    )
  })

  it('carry the website of the page they are followed from', () => {
    const query = {
      website: 'site-1',
      'marketing.period': 'last-7-days',
      path: '/ignored',
    }
    expect(withWebsite(pagesLink('/pricing'), query)).toBe(
      '/modules/marketing/pages?path=%2Fpricing&website=site-1',
    )
    expect(withWebsite(acquisitionLink(), query)).toBe(
      '/modules/marketing/acquisition?website=site-1',
    )
  })

  it('keep the website a link names, and stay bare without one', () => {
    const query = { website: 'site-1' }
    expect(withWebsite(overviewLink('site-2'), query)).toBe(
      '/modules/marketing/overview?website=site-2',
    )
    expect(withWebsite(acquisitionLink(), {})).toBe(
      '/modules/marketing/acquisition',
    )
    expect(withWebsite(acquisitionLink(), { website: ['site-1'] })).toBe(
      '/modules/marketing/acquisition',
    )
  })
})
