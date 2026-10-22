/**
 * Stable UUID for graph nodes and sentinel ids. Falls back to a short
 * pseudo-random id when crypto.randomUUID is unavailable (older browsers
 * over HTTP, jsdom in tests, …).
 */
export function newId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  )
    return globalThis.crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

/** A route query value as one non-empty string: the first of a list. */
export function queryString(value: unknown): string | null {
  const first: unknown = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.length > 0 ? first : null;
}
