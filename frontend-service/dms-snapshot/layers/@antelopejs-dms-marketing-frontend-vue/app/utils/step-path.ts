/**
 * A page step the way the server stores and matches it (mirror of
 * `src/services/funnels/step-path.ts`): a pasted URL, a host glued to the
 * path, a query string, a fragment or a trailing slash come down to the path;
 * a final `*` stays, as a prefix wildcard. The builder shows the result under
 * the step when it differs from what was typed.
 */

const STEP_PATH_BASE = 'http://step.invalid'
const STEP_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:\/\//i
const STEP_BARE_HOST_PATTERN = /^[^/\s?#]+\.[^/\s?#]+\//

export function normalizeFunnelStepPath(raw: string): string {
  const value = raw.trim()
  const prefix = value.endsWith('*')
  const body = prefix ? value.slice(0, -1) : value
  const absolute = STEP_SCHEME_PATTERN.test(body)
    ? body
    : STEP_BARE_HOST_PATTERN.test(body)
      ? `https://${body}`
      : `${STEP_PATH_BASE}${body.startsWith('/') ? '' : '/'}${body}`
  let path: string
  try {
    path = new URL(absolute).pathname
  } catch {
    return value
  }
  if (prefix) {
    return `${path}*`
  }
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}
