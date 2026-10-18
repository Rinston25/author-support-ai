<script setup>
const { api } = useApi()
const { user } = useAuth()
const route = useRoute()
const ticketId = route.params.id

const detail = ref(null)
const admins = ref([])
const loading = ref(true)
const error = ref(null)
const actionError = ref(null)

// --- Reply editor and AI draft ---
// draftState: 'idle' (nothing yet) | 'loading' | 'ready' | 'unavailable'
const draftState = ref('idle')
const draftInfo = ref(null)
const editorText = ref('')
const startedFromDraft = ref(false)
const draftText = ref('') // the draft as generated, to tell whether the admin edited it
const regenerateInstructions = ref('')
const newStatusAfterSend = ref('in_progress')
const sending = ref(false)
const authorReplied = ref(false)

// --- Notes ---
const noteText = ref('')
const savingNote = ref(false)

const ticket = computed(() => detail.value?.ticket)
const isClosed = computed(() => ticket.value?.status === 'closed')

// Every "[CONFIRM: ...]" still in the editor. Sending stays blocked until none are left.
const placeholders = computed(() => editorText.value.match(/\[CONFIRM:[^\]]*\]/gi) || [])
const hasOpenPlaceholder = computed(() => /\[CONFIRM:/i.test(editorText.value))
const canSend = computed(() => !sending.value && !hasOpenPlaceholder.value && editorText.value.trim().length >= 10)

async function loadDetail({ quiet = false } = {}) {
  if (!quiet) loading.value = true
  try {
    detail.value = await api(`/admin/tickets/${ticketId}`)
    error.value = null
  } catch (caught) {
    error.value = caught
  } finally {
    loading.value = false
  }
}

function applyDraft(response) {
  draftInfo.value = response
  if (response.status === 'ready') {
    draftState.value = 'ready'
    editorText.value = response.draft
    draftText.value = response.draft
    startedFromDraft.value = true
  } else {
    // The editor stays empty (or keeps what the admin typed): writing by hand always works
    draftState.value = 'unavailable'
    startedFromDraft.value = false
  }
  authorReplied.value = false
}

async function loadDraft() {
  draftState.value = 'loading'
  try {
    applyDraft(await api(`/admin/tickets/${ticketId}/draft`))
  } catch (caught) {
    draftState.value = 'unavailable'
    draftInfo.value = { reason: caught.message }
  }
}

async function regenerate() {
  const editedByHand = editorText.value.trim() && editorText.value !== draftText.value
  if (editedByHand && !window.confirm('Replace your edited text with a new draft?')) return
  draftState.value = 'loading'
  actionError.value = null
  try {
    const body = regenerateInstructions.value.trim() ? { instructions: regenerateInstructions.value.trim() } : {}
    applyDraft(await api(`/admin/tickets/${ticketId}/draft/regenerate`, { method: 'POST', body }))
  } catch (caught) {
    draftState.value = 'unavailable'
    draftInfo.value = { reason: caught.message }
  }
}

async function sendReply() {
  if (!canSend.value) return
  sending.value = true
  actionError.value = null
  try {
    await api(`/admin/tickets/${ticketId}/responses`, {
      method: 'POST',
      // aiAssisted: the reply began as an AI draft (even if it was edited)
      body: { body: editorText.value.trim(), aiAssisted: startedFromDraft.value, newStatus: newStatusAfterSend.value },
    })
    editorText.value = ''
    draftText.value = ''
    startedFromDraft.value = false
    draftState.value = 'idle'
    await loadDetail({ quiet: true })
  } catch (caught) {
    actionError.value = caught
  } finally {
    sending.value = false
  }
}

// Used by every control in the right-hand panel; the API returns the fresh detail
async function change(patch) {
  actionError.value = null
  try {
    detail.value = await api(`/admin/tickets/${ticketId}`, { method: 'PATCH', body: patch })
  } catch (caught) {
    actionError.value = caught
    await loadDetail({ quiet: true }) // put the dropdown back to what is saved
  }
}

async function assignToMe() {
  actionError.value = null
  try {
    detail.value = await api(`/admin/tickets/${ticketId}/assign-to-me`, { method: 'POST' })
  } catch (caught) {
    actionError.value = caught
  }
}

async function addNote() {
  if (!noteText.value.trim()) return
  savingNote.value = true
  actionError.value = null
  try {
    await api(`/admin/tickets/${ticketId}/notes`, { method: 'POST', body: { body: noteText.value.trim() } })
    noteText.value = ''
    await loadDetail({ quiet: true })
  } catch (caught) {
    actionError.value = caught
  } finally {
    savingNote.value = false
  }
}

onMounted(async () => {
  try {
    admins.value = (await api('/admin/users')).users
  } catch { /* the assignee dropdown just stays short */ }
  await loadDetail()
  if (detail.value && !isClosed.value) loadDraft()
})

// Live: events for this ticket refresh the page, but never touch the editor text
const refreshQuietly = debounce(() => loadDetail({ quiet: true }), 300)
const onlyThisTicket = (handler) => (event) => { if (event.ticketId === ticketId) handler(event) }
useTicketStream({
  'message.created': onlyThisTicket((event) => {
    refreshQuietly()
    if (event.senderRole === 'author') authorReplied.value = true
  }),
  'ticket.updated': onlyThisTicket(refreshQuietly),
  'ticket.classified': onlyThisTicket(refreshQuietly),
  reconnected: refreshQuietly,
})
</script>

<template>
  <div>
    <NuxtLink to="/admin/tickets" class="small">← Ticket queue</NuxtLink>

    <LoadingState v-if="loading" text="Loading ticket..." />
    <ErrorBanner v-else-if="error" :error="error" retryable @retry="loadDetail" />

    <template v-else-if="detail">
      <div class="page-header head">
        <div>
          <h1>{{ ticket.subject }}</h1>
          <p class="muted small">
            {{ detail.author.name }} · {{ ticket.bookTitle }} · raised <RelativeTime :value="ticket.createdAt" />
            · age {{ formatAge(ticket.ageMinutes) }}
          </p>
        </div>
        <div class="row">
          <PriorityBadge :priority="ticket.priority" :source="ticket.prioritySource" />
          <StatusBadge :status="ticket.status" />
        </div>
      </div>

      <ErrorBanner :error="actionError" />

      <div class="grid-2">
        <!-- LEFT: conversation and reply -->
        <section class="stack">
          <div class="card">
            <TicketTimeline :messages="detail.messages" viewer="admin" />
            <p v-if="detail.attachments.length" class="small muted">
              Attachments (details only): {{ detail.attachments.map((file) => file.fileName).join(', ') }}
            </p>
          </div>

          <div v-if="authorReplied" class="banner warning" role="status">
            <div class="row">
              <span>The author replied. The draft below may be outdated.</span>
              <span class="spacer" />
              <button class="btn secondary small" :disabled="draftState === 'loading'" @click="regenerate">Regenerate draft</button>
            </div>
          </div>

          <div class="card">
            <h2>Reply</h2>

            <p v-if="isClosed" class="muted">This ticket is closed. Change the status on the right to reply.</p>

            <template v-else>
              <!-- Draft status line -->
              <div v-if="draftState === 'loading'" class="banner info" role="status">Drafting reply...</div>
              <div v-else-if="draftState === 'ready'" class="banner info">
                <strong>AI draft — review before sending.</strong><br>
                <span class="small">
                  {{ draftInfo.cached ? 'Saved draft (no new AI call).' : 'Freshly generated.' }}
                  Based on this ticket's category policy and the author's real figures.
                </span>
              </div>
              <div v-else-if="draftState === 'unavailable'" class="banner warning">
                {{ draftInfo?.reason || 'AI draft unavailable.' }} You can write the reply yourself below.
              </div>

              <!-- Placeholders that need a human check -->
              <div v-if="placeholders.length" class="banner warning" role="alert">
                <strong>Check before sending:</strong> resolve each item, then delete its [CONFIRM: ...] text.
                <ul class="small">
                  <li v-for="(placeholder, index) in placeholders" :key="index"><mark>{{ placeholder }}</mark></li>
                </ul>
              </div>

              <label for="reply">Your reply to {{ detail.author.name.split(' ')[0] }}</label>
              <textarea id="reply" v-model="editorText" rows="12" :disabled="draftState === 'loading'" placeholder="Write your reply..." />

              <div class="row actions">
                <div class="grow">
                  <label for="instructions" class="small">Regenerate with instructions (optional)</label>
                  <input id="instructions" v-model="regenerateInstructions" maxlength="300" placeholder="e.g. shorter, mention the free reprint">
                </div>
                <button class="btn secondary" :disabled="draftState === 'loading'" @click="regenerate">Regenerate</button>
              </div>

              <div class="row actions">
                <div>
                  <label for="after" class="small">After sending, set status to</label>
                  <select id="after" v-model="newStatusAfterSend">
                    <option value="in_progress">In progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <span class="spacer" />
                <button class="btn" :disabled="!canSend" @click="sendReply">{{ sending ? 'Sending...' : 'Send reply' }}</button>
              </div>
              <p v-if="hasOpenPlaceholder" class="hint">Sending is disabled until every [CONFIRM: ...] is resolved.</p>
            </template>
          </div>
        </section>

        <!-- RIGHT: controls, author, notes -->
        <aside class="stack">
          <div class="card">
            <h3>Ticket</h3>
            <div class="field">
              <label for="status">Status</label>
              <select id="status" :value="ticket.status" @change="change({ status: $event.target.value })">
                <option v-for="(label, value) in STATUS_LABELS" :key="value" :value="value">{{ label }}</option>
              </select>
            </div>
            <div class="field">
              <label for="category">Category <SourceMarker :source="ticket.categorySource" /></label>
              <select id="category" :value="ticket.category || ''" @change="change({ category: $event.target.value })">
                <option v-if="!ticket.category" value="" disabled>Classifying...</option>
                <option v-for="(label, value) in CATEGORY_LABELS" :key="value" :value="value">{{ label }}</option>
              </select>
            </div>
            <div class="field">
              <label for="priority">Priority <SourceMarker :source="ticket.prioritySource" /></label>
              <select id="priority" :value="ticket.priority || ''" @change="change({ priority: $event.target.value })">
                <option v-if="!ticket.priority" value="" disabled>Classifying...</option>
                <option v-for="(label, value) in PRIORITY_LABELS" :key="value" :value="value">{{ label }}</option>
              </select>
            </div>
            <p v-if="ticket.classificationStatus === 'fallback'" class="banner warning small">Guessed by keyword rules (AI was unavailable). Please verify.</p>
            <p v-if="ticket.aiReasoning" class="small"><span class="muted">Reasoning:</span> {{ ticket.aiReasoning }}</p>

            <div class="field">
              <label for="assignee">Assigned to</label>
              <div class="row">
                <select id="assignee" class="grow" :value="ticket.assigneeId || ''" @change="change({ assignedTo: $event.target.value || null })">
                  <option value="">Unassigned</option>
                  <option v-for="admin in admins" :key="admin.id" :value="admin.id">{{ admin.name }}</option>
                </select>
                <button class="btn secondary small" :disabled="ticket.assigneeId === user?.id" @click="assignToMe">Assign to me</button>
              </div>
            </div>
          </div>

          <div class="card">
            <h3>Internal notes</h3>
            <p class="small muted">Internal — not visible to the author.</p>
            <div v-for="note in detail.notes" :key="note.id" class="note">
              <div class="small muted">{{ note.adminName }} · <RelativeTime :value="note.createdAt" /></div>
              {{ note.body }}
            </div>
            <p v-if="!detail.notes.length" class="small muted">No notes yet.</p>
            <textarea v-model="noteText" rows="3" maxlength="2000" placeholder="Add an internal note..." />
            <button class="btn secondary small note-button" :disabled="savingNote || !noteText.trim()" @click="addNote">Add note</button>
          </div>

          <div class="card">
            <h3>Author</h3>
            <dl class="facts">
              <dt>Name</dt><dd>{{ detail.author.name }}</dd>
              <dt>Email</dt><dd>{{ detail.author.email }}</dd>
              <dt>City</dt><dd>{{ detail.author.city || '-' }}</dd>
              <dt>Joined</dt><dd>{{ formatDate(detail.author.joinedDate) }}</dd>
              <dt>Pending royalty</dt><dd><Money :amount="detail.author.royalty.totalPending" /></dd>
              <dt>Next payout</dt><dd>{{ detail.author.royalty.nextPayoutDate ? formatDate(detail.author.royalty.nextPayoutDate) : '-' }}</dd>
            </dl>
            <p v-if="detail.author.royalty.belowPayoutThreshold" class="banner warning small">Pending total is below the ₹1,000 minimum, so it rolls over.</p>

            <h3 class="books-title">Books</h3>
            <div v-for="book in detail.author.books" :key="book.id" class="book" :class="{ selected: book.isSelected }">
              <div class="row">
                <strong>{{ book.title }}</strong>
                <span v-if="book.isSelected" class="badge open">this ticket</span>
              </div>
              <div class="small muted">
                <template v-if="book.productionStage">In production — {{ book.productionStage }}</template>
                <template v-else>
                  {{ book.status }} · {{ book.totalCopiesSold }} sold · earned <Money :amount="book.totalRoyaltyEarned" />
                  · paid <Money :amount="book.royaltyPaid" /> · pending <Money :amount="book.royaltyPending" />
                </template>
              </div>
              <div class="small muted">
                <template v-if="book.printPartner">Printed by {{ book.printPartner }} · </template>
                <template v-if="book.availableOn.length">On {{ book.availableOn.join(', ') }}</template>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.head { margin-top: 0.75rem; }
.actions { margin-top: 0.75rem; align-items: flex-end; }
.grow { flex: 1; min-width: 160px; }
mark { background: #ffe58a; padding: 0 0.2rem; }
.note-button { margin-top: 0.5rem; }
.books-title { margin-top: 1rem; }
.book { padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 0.5rem; }
.book.selected { border-color: var(--primary); background: var(--primary-soft); }
</style>
