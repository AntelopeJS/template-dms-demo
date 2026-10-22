import { describe, expect, it, vi } from 'vitest'
import {
  createRetentionGuard,
  isLowered,
  type RetentionChange,
  shareRetentionGuard,
} from '../app/utils/settingsForm'

describe('isLowered', () => {
  it('is a value below the saved one', () => {
    expect(isLowered(30, 90)).toBe(true)
    expect(isLowered(90, 90)).toBe(false)
    expect(isLowered(120, 90)).toBe(false)
    expect(isLowered(null, 90)).toBe(false)
    expect(isLowered(30, undefined)).toBe(false)
  })
})

describe('createRetentionGuard', () => {
  const change = (field: string, to: number, from = 90): RetentionChange => ({
    field,
    label: field,
    from,
    to,
  })

  /** Confirms the changes the guard holds, then lets the resubmit through. */
  async function confirmAndResubmit(
    guard: ReturnType<typeof createRetentionGuard>,
    resubmit: ReturnType<typeof vi.fn>,
  ) {
    const before = resubmit.mock.calls.length
    expect(guard.allowSubmit()).toBe(false)
    await vi.waitFor(() => expect(resubmit.mock.calls.length).toBe(before + 1))
    expect(guard.allowSubmit()).toBe(true)
  }

  it('lets a save through when nothing is lowered', () => {
    const ask = vi.fn()
    const guard = createRetentionGuard(ask, vi.fn())
    expect(guard.allowSubmit()).toBe(true)
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks once for every lowered field, then submits again', async () => {
    const ask = vi.fn(async () => true)
    const resubmit = vi.fn()
    const guard = createRetentionGuard(ask, resubmit)
    guard.set('statisticsLifetimeDays', change('statisticsLifetimeDays', 30))
    guard.set('requestLogRetentionDays', change('requestLogRetentionDays', 7))

    expect(guard.allowSubmit()).toBe(false)
    // A second field's validator in the same pass does not ask again.
    expect(guard.allowSubmit()).toBe(false)
    await vi.waitFor(() => expect(resubmit).toHaveBeenCalledOnce())
    expect(ask).toHaveBeenCalledOnce()
    expect(ask.mock.calls[0]![0]).toHaveLength(2)

    // Both fields' validators let the resubmit through.
    expect(guard.allowSubmit()).toBe(true)
    expect(guard.allowSubmit()).toBe(true)
  })

  it('keeps the save stopped when the user cancels', async () => {
    const ask = vi.fn(async () => false)
    const resubmit = vi.fn()
    const guard = createRetentionGuard(ask, resubmit)
    guard.set('statisticsLifetimeDays', change('statisticsLifetimeDays', 30))

    expect(guard.allowSubmit()).toBe(false)
    await vi.waitFor(() => expect(ask).toHaveBeenCalledOnce())
    await Promise.resolve()
    expect(resubmit).not.toHaveBeenCalled()
    expect(guard.allowSubmit()).toBe(false)
    await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(2))
  })

  it('asks again once the lowered value changes', async () => {
    const ask = vi.fn(async () => true)
    const resubmit = vi.fn()
    const guard = createRetentionGuard(ask, resubmit)
    guard.set('statisticsLifetimeDays', change('statisticsLifetimeDays', 60))
    await confirmAndResubmit(guard, resubmit)

    guard.set('statisticsLifetimeDays', change('statisticsLifetimeDays', 30))
    expect(guard.allowSubmit()).toBe(false)
    guard.set('statisticsLifetimeDays', null)
    expect(guard.allowSubmit()).toBe(true)
  })

  it('asks again for each lowering saved on the same page (90 → 30, 30 → 60, 60 → 30)', async () => {
    const ask = vi.fn(async () => true)
    const resubmit = vi.fn()
    const guard = createRetentionGuard(ask, resubmit)
    const field = 'statisticsLifetimeDays'

    guard.set(field, change(field, 30, 90))
    await confirmAndResubmit(guard, resubmit)
    expect(ask).toHaveBeenCalledTimes(1)
    // Saved: 30 is the value in force, nothing lowered.
    guard.set(field, null)

    // 30 → 60 raises it: no question.
    expect(guard.allowSubmit()).toBe(true)

    // Saved again at 60, then lowered to 30: asked again.
    guard.set(field, change(field, 30, 60))
    await confirmAndResubmit(guard, resubmit)
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('asks again for the same lowering once the form went back to its saved value', async () => {
    const ask = vi.fn(async () => true)
    const resubmit = vi.fn()
    const guard = createRetentionGuard(ask, resubmit)
    const field = 'statisticsLifetimeDays'

    guard.set(field, change(field, 30, 90))
    await confirmAndResubmit(guard, resubmit)
    guard.set(field, null)
    guard.set(field, change(field, 30, 90))
    expect(guard.allowSubmit()).toBe(false)
    await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(2))
  })
})

describe('shareRetentionGuard', () => {
  it('shares one guard while its fields are drawn, a new one after', () => {
    const create = vi.fn(() => createRetentionGuard(vi.fn(), vi.fn()))
    const first = shareRetentionGuard(create)
    const second = shareRetentionGuard(create)
    expect(second.guard).toBe(first.guard)
    expect(create).toHaveBeenCalledOnce()

    // A field letting go twice counts once: the other still holds it.
    first.release()
    first.release()
    const third = shareRetentionGuard(create)
    expect(third.guard).toBe(first.guard)

    second.release()
    third.release()
    expect(create).toHaveBeenCalledOnce()
  })

  it('makes a new guard once the last field let go', () => {
    const create = vi.fn(() => createRetentionGuard(vi.fn(), vi.fn()))
    const only = shareRetentionGuard(create)
    only.release()
    const next = shareRetentionGuard(create)
    expect(next.guard).not.toBe(only.guard)
    expect(create).toHaveBeenCalledTimes(2)
    next.release()
  })
})
