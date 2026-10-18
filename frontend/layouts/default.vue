<script setup>
const { user, isAdmin, logout } = useAuth()
const route = useRoute()

// Role-based navigation
const links = computed(() => (isAdmin.value
  ? [{ to: '/admin/tickets', label: 'Ticket queue' }]
  : [
      { to: '/author/books', label: 'My books' },
      { to: '/author/tickets', label: 'My tickets' },
      { to: '/author/tickets/new', label: 'New query' },
    ]))

// "My tickets" must not stay highlighted on "/author/tickets/new"
function isActive(link) {
  if (link.to === '/author/tickets') return route.path === '/author/tickets' || /^\/author\/tickets\/(?!new)/.test(route.path)
  return route.path.startsWith(link.to)
}
</script>

<template>
  <div>
    <header class="topbar">
      <div class="topbar-inner">
        <NuxtLink to="/" class="logo">BookLeaf Support</NuxtLink>
        <nav v-if="user" class="nav">
          <NuxtLink v-for="link in links" :key="link.to" :to="link.to" :class="{ active: isActive(link) }">{{ link.label }}</NuxtLink>
        </nav>
        <span class="spacer" />
        <template v-if="user">
          <span class="who">{{ user.name }} <span class="badge">{{ user.role }}</span></span>
          <button class="btn secondary small" @click="logout">Log out</button>
        </template>
      </div>
    </header>
    <main class="container">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.topbar { background: var(--primary); color: #fff; }
.topbar-inner { max-width: 1180px; margin: 0 auto; padding: 0.6rem 1rem; display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; }
.logo { color: #fff; font-weight: 700; font-size: 1.1rem; }
.logo:hover { text-decoration: none; }
.nav { display: flex; gap: 0.25rem; flex-wrap: wrap; }
.nav a { color: #dcebe6; padding: 0.3rem 0.7rem; border-radius: 6px; }
.nav a:hover { background: rgba(255, 255, 255, 0.12); text-decoration: none; }
.nav a.active { background: rgba(255, 255, 255, 0.2); color: #fff; font-weight: 600; }
.who { display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; }
.who .badge { background: rgba(255, 255, 255, 0.2); color: #fff; text-transform: capitalize; }
</style>
