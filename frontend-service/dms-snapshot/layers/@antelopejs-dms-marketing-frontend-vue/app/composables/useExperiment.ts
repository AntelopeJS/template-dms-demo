import type {
  MarketingExperimentRun,
  MarketingExperimentStatus,
} from './useMarketingApi'

/**
 * The A/B facet of a funnel as it travels through the form layer.
 *
 * The value reaches components either as the real object or as a JSON string —
 * the input and the list display both have to read the two shapes, so the
 * parse lives once here. Invalid input answers null (or an empty list), never
 * a throw: this runs while rendering a cell.
 */
export interface ExperimentVariationDraft {
  key: string
  weight: number
}

export interface ExperimentDraft {
  key: string
  status?: MarketingExperimentStatus
  variations: ExperimentVariationDraft[]
  /** Read-only here: the pane reads how many runs the split has had, the
   * form carries them back untouched and the backend re-derives them. */
  runs: MarketingExperimentRun[]
}

function parseJsonValue(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return raw
  }
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function parseExperimentVariationsValue(
  raw: unknown,
): ExperimentVariationDraft[] {
  const parsed = parseJsonValue(raw)
  return Array.isArray(parsed) ? (parsed as ExperimentVariationDraft[]) : []
}

export function parseExperimentValue(raw: unknown): ExperimentDraft | null {
  const parsed = parseJsonValue(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const candidate = parsed as Partial<ExperimentDraft>
  return {
    key: typeof candidate.key === 'string' ? candidate.key : '',
    status: candidate.status,
    variations: parseExperimentVariationsValue(candidate.variations),
    runs: Array.isArray(candidate.runs) ? candidate.runs : [],
  }
}
