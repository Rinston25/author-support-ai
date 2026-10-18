const EVENT_TYPES = ['ticket.created', 'ticket.updated', 'ticket.classified', 'message.created']
const MAX_RETRY_DELAY_MS = 30_000

// Live updates over Server-Sent Events.
//   useTicketStream({ 'message.created': (event) => ..., reconnected: () => ... })
// The browser reconnects by itself after a dropped connection. If the server
// closes the stream for good (for example an expired token), we retry with a
// growing delay. `reconnected` fires after an outage so the page can refetch
// anything it missed while disconnected.
export function useTicketStream(handlers) {
  const { token } = useAuth()
  const config = useRuntimeConfig()
  const connected = ref(false)

  let source = null
  let retryTimer = null
  let retryDelay = 1000
  let hadError = false
  let stopped = false

  function open() {
    if (stopped || !token.value) return
    source = new EventSource(`${config.public.apiBase}/events?token=${encodeURIComponent(token.value)}`)

    for (const type of EVENT_TYPES) {
      source.addEventListener(type, (message) => handlers[type]?.(JSON.parse(message.data)))
    }

    source.onopen = () => {
      connected.value = true
      retryDelay = 1000
      if (hadError) handlers.reconnected?.()
      hadError = false
    }

    source.onerror = () => {
      connected.value = false
      hadError = true
      // CLOSED means the browser gave up; CONNECTING means it is already retrying
      if (source.readyState === EventSource.CLOSED && !stopped) {
        retryTimer = setTimeout(open, retryDelay)
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS)
      }
    }
  }

  function close() {
    stopped = true
    clearTimeout(retryTimer)
    source?.close()
  }

  onMounted(open)
  onBeforeUnmount(close)
  return { connected }
}
