/**
 * Module-wide constants, imported explicitly.
 *
 * Deliberately outside `app/composables`, `app/types` and `app/utils`: the DMS
 * frontend builder auto-imports everything those directories export into the
 * shared namespace, where a generic name silently shadows the core's. This
 * file is never scanned, so anything here has to be imported by hand.
 */

export const MS_PER_DAY = 86_400_000

/** A website's name and domain caps (MAX_NAME_LENGTH, MAX_DOMAIN_LENGTH on the server). */
export const MAX_WEBSITE_NAME_LENGTH = 100
export const MAX_WEBSITE_DOMAIN_LENGTH = 253

/**
 * Where the backend puts this module's public options (FRONTEND_CONFIG_KEY
 * on the server): `sdk.options.public[MODULE_CONFIG_KEY]`.
 */
export const MODULE_CONFIG_KEY = 'dmsMarketing'

/** Longest period the routes read (MAX_QUERY_PERIOD_DAYS on the server). */
export const MAX_PERIOD_DAYS = 90

/**
 * The id of the context bar's period selector: the scope the analytics blocks
 * bind to and the prefix of its keys in the page URL (`?marketing.period=`).
 * MARKETING_PERIOD_SCOPE on the server.
 */
export const PERIOD_SCOPE = 'marketing'

/**
 * Exactly `digits` decimals, for the DMS `formatPercentage`: a rate keeps
 * its width from one row to the next.
 */
export function fractionDigits(digits: number): Intl.NumberFormatOptions {
  return { minimumFractionDigits: digits, maximumFractionDigits: digits }
}
