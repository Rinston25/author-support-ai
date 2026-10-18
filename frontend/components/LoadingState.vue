<script setup>
defineProps({ text: { type: String, default: 'Loading...' } })
</script>

<template>
  <div class="card loading muted" role="status">{{ text }}</div>
</template>

<style scoped>
.loading { text-align: center; padding: 2rem 1rem; }
</style>
