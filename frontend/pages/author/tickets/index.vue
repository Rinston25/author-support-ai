<script setup>
const { api } = useApi()
const route = useRoute()

const tickets = ref([])
const loading = ref(true)
const error = ref(null)

const TABS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]
const activeStatus = computed(() => route.query.status || '')

async function load({ quiet = false } = {}) {
  if (!quiet) loading.value = true
  error.value = null
  try {
    tickets.value = (await api('/tickets', { query: { status: activeStatus.value || undefined } })).tickets
  } catch (caught) {
    error.value = caught
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(activeStatus, () => load())

// Live: a new admin reply or status change refreshes the list quietly (no spinner)
const refreshQuietly = debounce(() => load({ quiet: true }), 400)
useTicketStream({
  'message.created': refreshQuietly,
  'ticket.updated': refreshQuietly,
  'ticket.created': refreshQuietly,
  reconnected: refreshQuietly,
})

// A dot for tickets where support spoke last
const hasNewReply = (ticket) => ticket.lastMessageSenderRole === 'admin' && ticket.status !== 'closed'
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>My tickets</h1>
        <p class="muted">Your queries and our replies.</p>
      </div>
      <NuxtLink to="/author/tickets/new" class="btn">New query</NuxtLink>
    </div>

    <div class="row tabs">
      <NuxtLink
        v-for="tab in TABS"
        :key="tab.value"
        :to="tab.value ? { query: { status: tab.value } } : { query: {} }"
        class="btn small"
        :class="activeStatus === tab.value ? '' : 'secondary'"
      >{{ tab.label }}</NuxtLink>
    </div>

    <LoadingState v-if="loading" text="Loading your tickets..." />
    <ErrorBanner v-else-if="error" :error="error" retryable @retry="load" />
    <EmptyState
      v-else-if="tickets.length === 0"
      :title="activeStatus ? 'No tickets with this status' : 'You have not raised any queries yet'"
      :message="activeStatus ? 'Try another tab.' : 'Questions about royalties, ISBNs, printing or your book status? We are here to help.'"
      action-label="Raise your first query"
      :action-to="activeStatus ? '' : '/author/tickets/new'"
    />

    <div v-else class="stack">
      <NuxtLink v-for="ticket in tickets" :key="ticket.id" :to="`/author/tickets/${ticket.id}`" class="card ticket">
        <div class="row">
          <span v-if="hasNewReply(ticket)" class="dot" title="New reply from BookLeaf" />
          <strong>{{ ticket.subject }}</strong>
          <span v-if="hasNewReply(ticket)" class="badge critical">New reply</span>
          <span class="spacer" />
          <StatusBadge :status="ticket.status" />
        </div>
        <div class="muted small">
          {{ ticket.bookTitle || 'General / Account Level' }} · updated <RelativeTime :value="ticket.updatedAt" />
        </div>
        <div class="preview small">
          <span class="muted">{{ ticket.lastMessageSenderRole === 'admin' ? 'BookLeaf Support' : 'You' }}:</span>
          {{ ticket.lastMessagePreview }}
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.tabs { margin-bottom: 1rem; }
.ticket { display: block; color: inherit; }
.ticket:hover { text-decoration: none; border-color: var(--primary); }
.preview { margin-top: 0.3rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
