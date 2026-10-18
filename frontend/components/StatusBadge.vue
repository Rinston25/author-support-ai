<script setup>
defineProps({ status: { type: String, required: true } })
</script>

<template>
  <span class="badge" :class="status">{{ STATUS_LABELS[status] || status }}</span>
</template>
