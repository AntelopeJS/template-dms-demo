import { watch } from 'vue'

/** First status of the server errors the paused toggle counts apart. */
const SERVER_ERROR_STATUS = 500

/**
 * Gives the page's DMS live toggle the server errors it missed while paused,
 * after the count of new requests: "Paused · 40 new requests · 2 in 5xx",
 * which the request table's paused strip shows too. The live feed
 * (`topic`) tells each captured request with its `statusCode`; the
 * tally starts again on resume. Browser only; the DMS clears the detail on
 * resume.
 */
export function useLiveMissedErrors(topic: string) {
  const live = usePageLive()
  let serverErrors = 0

  useRealtimeTopic(topic, (event) => {
    if (!live.isPaused.value || !('payload' in event)) return
    const status = Number(event.payload?.statusCode)
    if (!(status >= SERVER_ERROR_STATUS)) return
    serverErrors += 1
    live.setMissedDetail({
      text: '$api.live_mode.server_errors',
      params: { count: serverErrors },
      tone: 'error',
    })
  })

  watch(live.isPaused, (paused) => {
    if (!paused) serverErrors = 0
  })
}
