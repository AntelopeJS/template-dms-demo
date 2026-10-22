import { computed, type ComputedRef } from 'vue'
import { useSetupFacts } from './useMailingReads'
import { needsSetup } from '../utils/overview-setup'

/** The period scope of the Overview page, whose dashboard the setup gates. */
const OVERVIEW_PERIOD_SCOPE = 'mailing-overview'

/**
 * Whether the page header should hold its period selector back for `scope`:
 * on the Overview, while the setup card stands in for the dashboard, there is
 * no figure for a period to filter. Read from the setup facts the Overview
 * gate shows (one request for both), so a server render hides it as the
 * browser does.
 */
export function useSetupHidesPeriod(
	scope: string | undefined,
): ComputedRef<boolean> {
	if (scope !== OVERVIEW_PERIOD_SCOPE) return computed(() => false)
	const { data } = useSetupFacts()
	return computed(() => !!data.value && needsSetup(data.value))
}
