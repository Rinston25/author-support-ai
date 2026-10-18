<script setup>
defineProps({
  priority: { type: String, default: null },
  source: { type: String, default: null },
})
</script>

<template>
  <span v-if="priority" class="badge" :class="priority">
    {{ PRIORITY_LABELS[priority] || priority }}
    <SourceMarker :source="source" />
  </span>
  <span v-else class="badge pending">Classifying...</span>
</template>
