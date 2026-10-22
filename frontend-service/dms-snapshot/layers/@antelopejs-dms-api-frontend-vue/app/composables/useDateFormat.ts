import { computed } from 'vue'
import { useUserRegionalPreferences } from '#dms-core/app/composables/user/useUserRegionalPreferences'
import { cachedDateFormat, type DateFormat } from '../utils/format'

/**
 * How the console writes its dates and times: through the DMS's regional
 * formatter, in the locale of the DMS's texts (`formatLocale`, `en-GB` for
 * `en`) and with the user's Language & region preferences (time zone, clock,
 * date format). The formats are made once each, and again when the language
 * or the preferences change.
 */
export function useDateFormat() {
  const { formatLocale, dateTimeFormat } = useRegionalFormat({
    locale: 'format',
  })
  const { preferences } = useUserRegionalPreferences()
  return computed<DateFormat>(() => {
    // Read so that a change of language or preferences makes the formats again.
    void formatLocale.value
    void preferences.value
    return cachedDateFormat((options) => dateTimeFormat(options))
  })
}
