<script setup>
const { login, homePath } = useAuth()

const email = ref('')
const password = ref('')
const error = ref(null)
const submitting = ref(false)

async function submit() {
  error.value = null
  if (!email.value.trim() || !password.value) {
    error.value = { message: 'Enter your email and password.' }
    return
  }
  submitting.value = true
  try {
    await login(email.value.trim(), password.value)
    await navigateTo(homePath.value)
  } catch (caught) {
    error.value = caught
  } finally {
    submitting.value = false
  }
}

// Clicking a demo account just fills the form
function fillDemo(account) {
  email.value = account.email
  password.value = account.password
}
</script>

<template>
  <div class="login">
    <div class="card">
      <h1>Sign in</h1>
      <p class="muted">BookLeaf author support portal</p>

      <ErrorBanner :error="error" />

      <form @submit.prevent="submit">
        <div class="field">
          <label for="email">Email</label>
          <input id="email" v-model="email" type="email" autocomplete="username" required>
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" v-model="password" type="password" autocomplete="current-password" required>
        </div>
        <button class="btn" type="submit" :disabled="submitting">{{ submitting ? 'Signing in...' : 'Sign in' }}</button>
      </form>
    </div>

    <div class="card demo">
      <h3>Demo accounts</h3>
      <p class="muted small">Click one to fill the form.</p>
      <button v-for="account in DEMO_ACCOUNTS" :key="account.email" type="button" class="demo-item" @click="fillDemo(account)">
        <strong>{{ account.label }}</strong>
        <span class="small muted">{{ account.email }}</span>
        <span class="small muted">{{ account.note }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.login { max-width: 460px; margin: 2rem auto; display: grid; gap: 1rem; }
.demo-item { display: grid; width: 100%; text-align: left; background: #fafbfc; border: 1px solid var(--border); border-radius: var(--radius); padding: 0.5rem 0.7rem; margin-bottom: 0.5rem; cursor: pointer; font: inherit; }
.demo-item:hover { background: var(--primary-soft); }
</style>
