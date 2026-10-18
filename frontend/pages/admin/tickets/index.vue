<script setup>
const { api } = useApi()
const route = useRoute()

const result = ref(null)
const stats = ref(null)
const admins = ref([])
const loading = ref(true)
const error = ref(null)

const LATE_AFTER_MINUTES = 48 * 60

// The URL is the single source of truth for filters, so a view can be shared as a link.
const query = computed(() => ({
  status: route.query.status || '',
  category: route.query.category || '',
  priority: route.query.priority || '',
  assignee: route.query.assignee || '',
  from: route.query.from || '',
  to: route.query.to || '',
  q: route.query.q || '',
  sort: route.query.sort || 'urgency',
  page: Number(route.query.page) || 1,
}))

function setFilter(key, value) {
  navigateTo({ query: { ...route.query, [key]: value || undefined, page: key === 'page' ? value : undefined } })
}

function clearFilters() {
  navigateTo({ query: {} })
}

const hasFilters = computed(() => ['status', 'category', 'priority', 'assignee', 'from', 'to', 'q'].some((key) => query.value[key]))

// Search waits for a pause in typing
const searchText = ref(route.query.q || '')
const applySearch = debounce((value) => setFilter('q', value.trim()), 400)
watch(searchText, applySearch)
watch(() => route.query.q, (value) => { searchText.value = value || '' })

async function load({ quiet = false } = {}) {
  if (!quiet) loading.value = true
  error.value = null
  try {
    const params = Object.fromEntries(Object.entries(query.value).filter(([, value]) => value !== ''))
    const [list, counts] = await Promise.all([
      api('/admin/tickets', { query: { ...params, pageSize: 20 } }),
      api('/admin/tickets/stats'),
    ])
    result.value = list
    stats.value = counts
  } catch (caught) {
    error.value = caught
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  load()
  try {
    admins.value = (await api('/admin/users')).users
  } catch { /* the assignee filter just stays empty */ }
})
watch(() => route.query, () => load(), { deep: true })

// Live: new and changed tickets refresh the list quietly
const refreshQuietly = debounce(() => load({ quiet: true }), 500)
const { connected } = useTicketStream({
  'ticket.created': refreshQuietly,
  'ticket.updated': refreshQuietly,
  'ticket.classified': refreshQuietly,
  'message.created': refreshQuietly,
  reconnected: refreshQuietly,
})

const totalPages = computed(() => (result.value ? Math.max(1, Math.ceil(result.value.total / result.value.pageSize)) : 1))
const isUnresolved = (ticket) => ticket.status === 'open' || ticket.status === 'in_progress'
const isLate = (ticket) => isUnresolved(ticket) && ticket.ageMinutes > LATE_AFTER_MINUTES
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>Ticket queue</h1>
        <p class="muted small">
          Most urgent and oldest unresolved tickets first.
          <span :title="connected ? 'Live updates on' : 'Reconnecting...'">{{ connected ? '● Live' : '○ Offline' }}</span>
        </p>
      </div>
    </div>

    <div v-if="stats" class="stats">
      <div class="stat"><div class="muted small">Open</div><div class="value">{{ stats.byStatus.open }}</div></div>
      <div class="stat danger"><div class="muted small">Critical</div><div class="value">{{ stats.byPriority.critical }}</div></div>
      <div class="stat"><div class="muted small">Unassigned</div><div class="value">{{ stats.unassigned }}</div></div>
      <div class="stat"><div class="muted small">Awaiting reply</div><div class="value">{{ stats.awaitingReply }}</div></div>
      <div class="stat"><div class="muted small">Oldest open</div><div class="value">{{ formatAge(stats.oldestOpenAgeMinutes) }}</div></div>
    </div>

    <form class="card filters" @submit.prevent>
      <div class="filter-grid">
        <div>
          <label for="f-q">Search</label>
          <input id="f-q" v-model="searchText" type="search" placeholder="Subject, author, book...">
        </div>
        <div>
          <label for="f-status">Status</label>
          <select id="f-status" :value="query.status" @change="setFilter('status', $event.target.value)">
            <option value="">Any</option>
            <option v-for="(label, value) in STATUS_LABELS" :key="value" :value="value">{{ label }}</option>
          </select>
        </div>
        <div>
          <label for="f-category">Category</label>
          <select id="f-category" :value="query.category" @change="setFilter('category', $event.target.value)">
            <option value="">Any</option>
            <option v-for="(label, value) in CATEGORY_LABELS" :key="value" :value="value">{{ label }}</option>
          </select>
        </div>
        <div>
          <label for="f-priority">Priority</label>
          <select id="f-priority" :value="query.priority" @change="setFilter('priority', $event.target.value)">
            <option value="">Any</option>
            <option v-for="(label, value) in PRIORITY_LABELS" :key="value" :value="value">{{ label }}</option>
          </select>
        </div>
        <div>
          <label for="f-assignee">Assignee</label>
          <select id="f-assignee" :value="query.assignee" @change="setFilter('assignee', $event.target.value)">
            <option value="">Anyone</option>
            <option value="me">Me</option>
            <option value="unassigned">Unassigned</option>
            <option v-for="admin in admins" :key="admin.id" :value="admin.id">{{ admin.name }}</option>
          </select>
        </div>
        <div>
          <label for="f-from">From</label>
          <input id="f-from" type="date" :value="query.from" @change="setFilter('from', $event.target.value)">
        </div>
        <div>
          <label for="f-to">To</label>
          <input id="f-to" type="date" :value="query.to" @change="setFilter('to', $event.target.value)">
        </div>
        <div>
          <label for="f-sort">Sort</label>
          <select id="f-sort" :value="query.sort" @change="setFilter('sort', $event.target.value)">
            <option value="urgency">Urgency</option>
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
        </div>
      </div>
      <button v-if="hasFilters" type="button" class="btn secondary small" @click="clearFilters">Clear filters</button>
    </form>

    <LoadingState v-if="loading" text="Loading tickets..." />
    <ErrorBanner v-else-if="error" :error="error" retryable @retry="load" />
    <EmptyState
      v-else-if="result.items.length === 0"
      :title="hasFilters ? 'No tickets match these filters' : 'No tickets yet'"
      :message="hasFilters ? 'Try clearing a filter.' : 'New author queries will appear here as soon as they arrive.'"
    />

    <template v-else>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Priority</th><th>Subject</th><th>Author</th><th>Book</th><th>Category</th><th>Status</th><th>Assignee</th><th>Age</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ticket in result.items" :key="ticket.id" :class="{ 'critical-row': ticket.priority === 'critical' && isUnresolved(ticket) }">
              <td><PriorityBadge :priority="ticket.priority" :source="ticket.prioritySource" /></td>
              <td>
                <NuxtLink :to="`/admin/tickets/${ticket.id}`"><strong>{{ ticket.subject }}</strong></NuxtLink>
                <span v-if="ticket.awaitingReply && isUnresolved(ticket)" class="badge open" title="The author wrote last">awaiting reply</span>
              </td>
              <td>{{ ticket.authorName }}</td>
              <td class="small">{{ ticket.bookTitle }}</td>
              <td><CategoryBadge :category="ticket.category" :source="ticket.categorySource" /></td>
              <td><StatusBadge :status="ticket.status" /></td>
              <td class="small">{{ ticket.assigneeName || '-' }}</td>
              <td :class="{ 'age-late': isLate(ticket) }" :title="isLate(ticket) ? 'Unresolved for more than 48 hours' : ''">{{ formatAge(ticket.ageMinutes) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="row pager">
        <span class="muted small">{{ result.total }} tickets · page {{ result.page }} of {{ totalPages }}</span>
        <span class="spacer" />
        <button class="btn secondary small" :disabled="result.page <= 1" @click="setFilter('page', result.page - 1)">Previous</button>
        <button class="btn secondary small" :disabled="result.page >= totalPages" @click="setFilter('page', result.page + 1)">Next</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.filters { margin-bottom: 1rem; }
.filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin-bottom: 0.5rem; }
.filter-grid label { font-size: 0.8rem; color: var(--muted); }
.pager { margin-top: 0.75rem; }
</style>
