// When a save of the Settings form waits for the user to confirm a lowered
// retention. Pure, so it is tested without a form.

/** What the next hourly prune deletes (`GET …/settings/retention-impact`). */
export interface RetentionImpact {
  days: number
  requests: number
}

/** A retention field holding a value below the one saved. */
export interface RetentionChange {
  field: string
  /** How the confirmation names it ("Statistics: 90 → 30 days"). */
  label: string
  from: number
  to: number
}

/** Whether `value` shortens the retention saved as `saved`. */
export function isLowered(
  value: number | null | undefined,
  saved: number | null | undefined,
): value is number {
  return typeof value === 'number' && typeof saved === 'number' && value < saved
}

export interface RetentionGuard {
  /** The field's lowered value, or `null` once it is not lowered. */
  set(field: string, change: RetentionChange | null): void
  /**
   * The form's validator: `true` when nothing lowered waits, or when these
   * very changes were confirmed. Otherwise it asks once for all the lowered
   * fields of the form and answers `false`; a confirmation submits again.
   */
  allowSubmit(): boolean
}

/**
 * The confirmation a form's lowered retentions share: one dialog for both
 * fields, asked on save, before anything is sent. A confirmation holds only
 * while the form keeps exactly the changes it was given (the resubmit, or a
 * save refused for another field and sent again): any other change, a saved
 * value among them, clears it, so the next lowering asks again.
 */
export function createRetentionGuard(
  ask: (changes: RetentionChange[]) => Promise<boolean>,
  resubmit: () => void,
): RetentionGuard {
  const changes = new Map<string, RetentionChange>()
  let confirmed: string | null = null
  let asking = false

  const pending = () =>
    [...changes.values()].sort((left, right) =>
      left.field.localeCompare(right.field),
    )
  const keyOf = (list: RetentionChange[]) =>
    list
      .map((change) => `${change.field}:${change.from}:${change.to}`)
      .join(',')

  return {
    set(field, change) {
      if (change) changes.set(field, change)
      else changes.delete(field)
      if (keyOf(pending()) !== confirmed) confirmed = null
    },
    allowSubmit() {
      const list = pending()
      if (list.length === 0) return true
      const key = keyOf(list)
      if (key === confirmed) return true
      if (asking) return false
      asking = true
      void ask(list)
        .then((accepted) => {
          if (!accepted) return
          confirmed = key
          resubmit()
        })
        .finally(() => {
          asking = false
        })
      return false
    },
  }
}

/** A guard the retention fields of a form share, and how a field lets go. */
export interface SharedRetentionGuard {
  guard: RetentionGuard
  /** The field is gone: the guard goes with the last one. */
  release(): void
}

let shared: { guard: RetentionGuard; fields: number } | null = null

/**
 * The guard the retention fields drawn together share (the Settings page
 * has one form): made by the first field, dropped with the last, so the
 * next visit starts afresh.
 */
export function shareRetentionGuard(
  create: () => RetentionGuard,
): SharedRetentionGuard {
  const current = shared ?? { guard: create(), fields: 0 }
  current.fields += 1
  shared = current
  let released = false
  return {
    guard: current.guard,
    release() {
      if (released) return
      released = true
      current.fields -= 1
      if (current.fields === 0 && shared === current) shared = null
    },
  }
}
