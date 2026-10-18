<script setup>
const { api } = useApi()
const route = useRoute()
const ticketId = route.params.id

const ticket = ref(null)
const loading = ref(true)
const error = ref(null)
const highlightIds = ref([])

const reply = ref('')
const sending = ref(false)
const sendError = ref(null)

async function load({ quiet = false } = {}) {
  if (!quiet) loading.value = true
  error.value = null
  try {
    const result = (await api(`/tickets/${ticketId}`)).ticket
    // Messages we have not seen before get a short highlight
    if (ticket.value) {
      const knownIds = new Set(ticket.value.messages.map((message) => message.id))
      const fresh = result.messages.filter((message) => !knownIds.has(message.id) && message.senderRole === 'admin').map((message) => message.id)
      if (fresh.length) {
        highlightIds.value = fresh
        setTimeout(() => { highlightIds.value = [] }, 6000)
      }
    }
    ticket.value = result
  } catch (caught) {
    error.value = caught
  } finally {
    loading.value = false
  }
}

onMounted(load)

// Live: only events for THIS ticket matter on this page
const refreshQuietly = debounce(() => load({ quiet: true }), 300)
const onlyThisTicket = (handler) => (event) => { if (event.ticketId === ticketId) handler() }
useTicketStream({
  'message.created': onlyThisTicket(refreshQuietly),
  'ticket.updated': onlyThisTicket(refreshQuietly),
  reconnected: refreshQuietly,
})

const justCreated = computed(() => route.query.created === '1')
const isClosed = computed(() => ticket.value?.status === 'closed')

async function sendReply() {
  const text = reply.value.trim()
  if (!text) return
  sending.value = true
  sendError.value = null
  try {
    await api(`/tickets/${ticketId}/messages`, { method: 'POST', body: { body: text } })
    reply.value = ''
    await load({ quiet: true })
  } catch (caught) {
    sendError.value = caught
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div>
    <NuxtLink to="/author/tickets" class="small">← All tickets</NuxtLink>

    <LoadingState v-if="loading" text="Loading ticket..." />
    <ErrorBanner v-else-if="error" :error="error" retryable @retry="load" />

    <template v-else-if="ticket">
      <div v-if="justCreated" class="banner success" role="status">
        We've received your query. Our team usually replies within 1-2 working days, and your reply will appear on this page as soon as it arrives.
      </div>

      <div class="page-header">
        <div>
          <h1>{{ ticket.subject }}</h1>
          <p class="muted small">{{ ticket.bookTitle || 'General / Account Level' }} · raised <RelativeTime :value="ticket.createdAt" /></p>
        </div>
        <StatusBadge :status="ticket.status" />
      </div>

      <div class="card stack">
        <TicketTimeline :messages="ticket.messages" viewer="author" :highlight-ids="highlightIds" />

        <div v-if="ticket.attachments.length" class="small muted">
          Attachments: {{ ticket.attachments.map((file) => file.fileName).join(', ') }}
        </div>
      </div>

      <div class="card reply">
        <p v-if="isClosed" class="muted">This ticket is closed. If you need more help, please <NuxtLink to="/author/tickets/new">raise a new query</NuxtLink>.</p>
        <form v-else @submit.prevent="sendReply">
          <ErrorBanner :error="sendError" />
          <label for="reply">Add a message</label>
          <textarea id="reply" v-model="reply" rows="4" maxlength="5000" />
          <p v-if="ticket.status === 'resolved'" class="hint">This ticket is marked resolved. Replying will reopen it.</p>
          <button class="btn" type="submit" :disabled="sending || !reply.trim()">{{ sending ? 'Sending...' : 'Send' }}</button>
        </form>
      </div>
    </template>
  </div>
</template>

<style scoped>
.reply { margin-top: 1rem; }
.page-header { margin-top: 0.75rem; }
</style>
