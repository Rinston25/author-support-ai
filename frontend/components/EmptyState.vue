<script setup>
defineProps({
  title: { type: String, required: true },
  message: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
  actionTo: { type: String, default: '' },
})
</script>

<template>
  <div class="card empty">
    <h3>{{ title }}</h3>
    <p v-if="message" class="muted">{{ message }}</p>
    <NuxtLink v-if="actionTo" :to="actionTo" class="btn">{{ actionLabel }}</NuxtLink>
  </div>
</template>

<style scoped>
.empty { text-align: center; padding: 2.5rem 1rem; }
</style>
