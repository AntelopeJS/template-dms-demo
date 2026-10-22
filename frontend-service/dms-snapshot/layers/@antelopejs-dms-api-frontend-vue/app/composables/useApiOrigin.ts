import { computed, toValue, type MaybeRefOrGetter } from 'vue'

/**
 * Where the API answers, for the snippets the console hands out (cURL,
 * fetch). The backend reads it from the DMS (`GetApiBaseUrl()`, its
 * `apiBaseUrl`) and sends it as the `apiOrigin` of the payloads that need it
 * (a route's detail, a captured request). Never this page's own origin:
 * behind the DMS frontend that is the frontend, whose proxy refuses the
 * writes a copied command sends.
 * Null while unknown: the snippets then write `$API_URL` and say so.
 */
export function useApiOrigin(
  reported: MaybeRefOrGetter<string | null | undefined>,
) {
  return computed(() => {
    const origin = toValue(reported)?.trim()
    return origin ? origin.replace(/\/+$/, '') : null
  })
}
