<script setup>
defineProps({
  category: { type: String, default: null },
  source: { type: String, default: null },
})
</script>

<template>
  <span v-if="category" class="badge">
    {{ CATEGORY_LABELS[category] || category }}
    <SourceMarker :source="source" />
  </span>
  <span v-else class="badge pending">Classifying...</span>
</template>
