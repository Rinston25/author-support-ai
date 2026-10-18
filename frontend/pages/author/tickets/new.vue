<script setup>
const { api } = useApi()
const route = useRoute()

// Same limits as the server, so most mistakes are caught before sending
const LIMITS = { subject: { min: 5, max: 150 }, description: { min: 20, max: 5000 } }
const MAX_FILES = 5
const MAX_FILE_BYTES = 10 * 1024 * 1024

const books = ref([])
const loadingBooks = ref(true)
const loadError = ref(null)

const bookId = ref(route.query.bookId || '')
const subject = ref('')
const description = ref('')
const files = ref([])
const touched = ref(false)
const submitting = ref(false)
const submitError = ref(null)

onMounted(async () => {
  try {
    books.value = (await api('/books')).books
  } catch (caught) {
    loadError.value = caught
  } finally {
    loadingBooks.value = false
  }
})

const errors = computed(() => {
  const found = {}
  const subjectLength = subject.value.trim().length
  const descriptionLength = description.value.trim().length
  if (subjectLength < LIMITS.subject.min || subjectLength > LIMITS.subject.max) {
    found.subject = `Subject must be ${LIMITS.subject.min}-${LIMITS.subject.max} characters.`
  }
  if (descriptionLength < LIMITS.description.min || descriptionLength > LIMITS.description.max) {
    found.description = `Description must be ${LIMITS.description.min}-${LIMITS.description.max} characters.`
  }
  if (files.value.length > MAX_FILES) found.files = `You can attach up to ${MAX_FILES} files.`
  if (files.value.some((file) => file.size > MAX_FILE_BYTES)) found.files = 'Each file must be 10 MB or smaller.'
  return found
})

function pickFiles(event) {
  files.value = Array.from(event.target.files)
}

async function submit() {
  touched.value = true
  submitError.value = null
  if (Object.keys(errors.value).length > 0) return

  submitting.value = true
  try {
    const result = await api('/tickets', {
      method: 'POST',
      body: {
        bookId: bookId.value || null,
        subject: subject.value.trim(),
        description: description.value.trim(),
        // Only the details are sent: actual file upload is not part of this version
        attachments: files.value.map((file) => ({ fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size })),
      },
    })
    await navigateTo(`/author/tickets/${result.ticket.id}?created=1`)
  } catch (caught) {
    submitError.value = caught
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="narrow">
    <h1>Raise a query</h1>
    <p class="muted">Tell us what you need help with. Our team usually replies within 1-2 working days.</p>

    <LoadingState v-if="loadingBooks" />
    <ErrorBanner v-else-if="loadError" :error="loadError" />

    <form v-else class="card" novalidate @submit.prevent="submit">
      <ErrorBanner :error="submitError" />

      <div class="field">
        <label for="book">Which book is this about?</label>
        <select id="book" v-model="bookId">
          <option value="">General / Account Level</option>
          <option v-for="book in books" :key="book.id" :value="book.id">{{ book.title }}</option>
        </select>
      </div>

      <div class="field">
        <label for="subject">Subject</label>
        <input id="subject" v-model="subject" type="text" :maxlength="LIMITS.subject.max + 50">
        <div class="counter">{{ subject.trim().length }} / {{ LIMITS.subject.max }}</div>
        <div v-if="touched && errors.subject" class="field-error">{{ errors.subject }}</div>
      </div>

      <div class="field">
        <label for="description">Describe your query</label>
        <textarea id="description" v-model="description" rows="7" />
        <div class="counter">{{ description.trim().length }} / {{ LIMITS.description.max }} (minimum {{ LIMITS.description.min }})</div>
        <div v-if="touched && errors.description" class="field-error">{{ errors.description }}</div>
      </div>

      <div class="field">
        <label for="files">Attachments (optional)</label>
        <input id="files" type="file" multiple @change="pickFiles">
        <p class="hint">Screenshots or photos help, for example of a printing defect. File names are recorded with your query.</p>
        <ul v-if="files.length" class="small">
          <li v-for="file in files" :key="file.name">{{ file.name }} ({{ Math.ceil(file.size / 1024) }} KB)</li>
        </ul>
        <div v-if="touched && errors.files" class="field-error">{{ errors.files }}</div>
      </div>

      <div class="row">
        <button class="btn" type="submit" :disabled="submitting">{{ submitting ? 'Sending...' : 'Submit query' }}</button>
        <NuxtLink to="/author/tickets" class="btn secondary">Cancel</NuxtLink>
      </div>
    </form>
  </div>
</template>

<style scoped>
.narrow { max-width: 720px; margin: 0 auto; }
</style>
