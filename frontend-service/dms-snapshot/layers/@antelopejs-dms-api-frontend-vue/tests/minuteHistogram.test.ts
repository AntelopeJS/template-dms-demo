import { describe, expect, it } from 'vitest'
import {
  axisTicks,
  liveStatus,
  minuteBars,
  peakBar,
  scaleCeiling,
} from '../app/utils/minuteHistogram'

const MINUTE = 60_000
const START = Date.UTC(2026, 9, 10, 16, 40)

function bucket(index: number, success: number, client = 0, server = 0) {
  return {
    start: START + index * MINUTE,
    success,
    clientErrors: client,
    serverErrors: server,
  }
}

describe('scaleCeiling', () => {
  it('follows the busiest minute of ordinary traffic', () => {
    expect(scaleCeiling([0, 10, 12, 14, 0])).toBe(14)
  })

  it('cuts a spike that would crush the other minutes', () => {
    const totals = [...Array.from({ length: 59 }, () => 12), 125]
    expect(scaleCeiling(totals)).toBe(24)
  })

  it('ignores empty minutes', () => {
    expect(scaleCeiling([0, 0, 0, 3])).toBe(3)
    expect(scaleCeiling([0, 0])).toBe(0)
  })
})

describe('minuteBars', () => {
  const buckets = [
    ...Array.from({ length: 58 }, (_, index) => bucket(index, 10, 1, 1)),
    bucket(58, 0),
    bucket(59, 100, 0, 25),
  ]
  const { bars, ceiling, clipped } = minuteBars(
    buckets,
    new Date(START + 59 * MINUTE + 20_000).toISOString(),
  )

  it('cuts the spike and says so', () => {
    expect(ceiling).toBe(24)
    expect(clipped).toBe(true)
    expect(bars[59].clipped).toBe(true)
    const heights = bars[59].heights
    expect(
      heights.success + heights.clientErrors + heights.serverErrors,
    ).toBeCloseTo(100)
    // Each class keeps its share of the cut bar.
    expect(heights.serverErrors).toBeCloseTo(20)
  })

  it('stacks an ordinary minute on the scale', () => {
    expect(bars[0].total).toBe(12)
    expect(bars[0].heights.success).toBeCloseTo((10 / 24) * 100)
    expect(bars[0].clipped).toBe(false)
  })

  it('draws nothing for an empty minute', () => {
    expect(bars[58].heights).toEqual({
      success: 0,
      clientErrors: 0,
      serverErrors: 0,
    })
  })

  it('marks the minute still running', () => {
    expect(bars.filter((bar) => bar.current).map((bar) => bar.start)).toEqual([
      START + 59 * MINUTE,
    ])
  })

  it('finds the busiest minute and the axis ticks', () => {
    expect(peakBar(bars)?.start).toBe(START + 59 * MINUTE)
    expect(axisTicks(bars)).toEqual([0, 29, 59])
    expect(peakBar(minuteBars([bucket(0, 0)]).bars)).toBeUndefined()
  })
})

describe('live indicator', () => {
  it('says reconnecting from the first failure, paused whatever failed', () => {
    expect(liveStatus(true, 0)).toBe('live')
    expect(liveStatus(true, 1)).toBe('reconnecting')
    expect(liveStatus(false, 4)).toBe('paused')
  })
})
