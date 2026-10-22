/**
 * Funnel steps as they travel through the form layer.
 *
 * The value reaches components either as the real array or as a JSON string —
 * the input and the table display both have to read the two shapes, so the
 * parse lives once here. Invalid input answers an empty list, never a throw:
 * this runs while rendering a cell.
 */
export interface FunnelStepDraft {
  kind: 'url' | 'custom'
  value: string
}

export function parseFunnelStepsValue(raw: unknown): FunnelStepDraft[] {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = raw ? JSON.parse(raw) : []
    } catch {
      parsed = []
    }
  }
  return Array.isArray(parsed) ? (parsed as FunnelStepDraft[]) : []
}
