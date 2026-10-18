<script setup>
const { api } = useApi()

const books = ref([])
const summary = ref(null)
const loading = ref(true)
const error = ref(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const result = await api('/books')
    books.value = result.books
    summary.value = result.summary
  } catch (caught) {
    error.value = caught
  } finally {
    loading.value = false
  }
}
onMounted(load)

// Totals across every book
const totals = computed(() => ({
  earned: books.value.reduce((sum, book) => sum + book.totalRoyaltyEarned, 0),
  paid: books.value.reduce((sum, book) => sum + book.royaltyPaid, 0),
  pending: summary.value?.totalPending ?? 0,
}))

const isInProduction = (book) => Boolean(book.productionStage)
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1>My books</h1>
        <p class="muted">Your titles, sales and royalties.</p>
      </div>
      <NuxtLink to="/author/tickets/new" class="btn">Raise a query</NuxtLink>
    </div>

    <LoadingState v-if="loading" text="Loading your books..." />
    <ErrorBanner v-else-if="error" :error="error" retryable @retry="load" />
    <EmptyState v-else-if="books.length === 0" title="No books yet" message="Once your first book is added to your account it will appear here." />

    <template v-else>
      <section class="card summary">
        <h2>Royalty summary</h2>
        <div class="stats">
          <div class="stat"><div class="muted small">Total earned</div><div class="value"><Money :amount="totals.earned" /></div></div>
          <div class="stat"><div class="muted small">Paid so far</div><div class="value"><Money :amount="totals.paid" /></div></div>
          <div class="stat"><div class="muted small">Pending</div><div class="value"><Money :amount="totals.pending" /></div></div>
          <div class="stat">
            <div class="muted small">Next payout by</div>
            <div class="value">{{ summary.nextPayoutDate ? formatDate(summary.nextPayoutDate) : '-' }}</div>
          </div>
        </div>
        <p v-if="summary.belowPayoutThreshold" class="banner warning">
          Your pending royalty (<Money :amount="summary.totalPending" />) is below the ₹1,000 minimum payout, so it rolls over to the next quarter.
        </p>
        <p class="muted small">Royalties are calculated quarterly and paid within 45 days of the quarter ending, by bank transfer to the account linked in your dashboard.</p>
      </section>

      <div class="grid-cards">
        <article v-for="book in books" :key="book.id" class="card book">
          <div class="row">
            <h3>{{ book.title }}</h3>
            <span class="spacer" />
            <span class="badge" :class="isInProduction(book) ? 'medium' : 'resolved'">
              {{ isInProduction(book) ? 'In production' : 'Published & Live' }}
            </span>
          </div>
          <p class="muted small">{{ book.genre }} · ISBN {{ book.isbn }}</p>

          <!-- Unpublished: show progress instead of a wall of zeros -->
          <template v-if="isInProduction(book)">
            <p><strong>In production — stage: {{ book.productionStage }}</strong></p>
            <StageStepper :current-stage="book.productionStage" />
            <p class="muted small">Sales and royalties will appear here once the book is published.</p>
          </template>

          <template v-else>
            <dl class="facts">
              <dt>Published</dt><dd>{{ formatDate(book.publicationDate) }}</dd>
              <dt>MRP</dt><dd><Money :amount="book.mrp" /></dd>
              <dt>Copies sold</dt><dd>{{ book.totalCopiesSold }}</dd>
              <dt>Royalty earned</dt><dd><Money :amount="book.totalRoyaltyEarned" /></dd>
              <dt>Royalty paid</dt><dd><Money :amount="book.royaltyPaid" /></dd>
              <dt>Royalty pending</dt><dd><Money :amount="book.royaltyPending" /></dd>
              <dt>Last payout</dt><dd>{{ book.lastRoyaltyPayoutDate ? formatDate(book.lastRoyaltyPayoutDate) : 'None yet' }}</dd>
              <dt>Printed by</dt><dd>{{ book.printPartner || '-' }}</dd>
            </dl>
            <p v-if="book.royaltyPending > 0" class="small">
              <template v-if="book.belowPayoutThreshold">
                <Money :amount="book.royaltyPending" /> pending is below the ₹1,000 minimum, so it rolls over to the next quarter.
              </template>
              <template v-else>Next payout by <strong>{{ formatDate(book.nextPayoutDate) }}</strong>.</template>
            </p>
            <p v-else-if="book.royaltyPaid > 0" class="small muted">Fully paid, nothing pending.</p>
            <div>
              <span v-for="platform in book.availableOn" :key="platform" class="chip">{{ platform }}</span>
            </div>
          </template>

          <NuxtLink :to="`/author/tickets/new?bookId=${book.id}`" class="btn secondary small">Raise a query about this book</NuxtLink>
        </article>
      </div>
    </template>
  </div>
</template>

<style scoped>
.summary { margin-bottom: 1rem; }
.book h3 { margin: 0; }
.book { display: flex; flex-direction: column; gap: 0.25rem; }
.book .btn { align-self: flex-start; margin-top: 0.5rem; }
</style>
