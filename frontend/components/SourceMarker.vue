<script setup>
// Shows who decided a category or priority: the AI, the keyword rules, or an admin.
const props = defineProps({ source: { type: String, default: null } })

const marker = computed(() => ({
  ai: { text: 'AI', css: 'ai', title: 'Classified by AI' },
  fallback: { text: 'rules', css: 'rules', title: 'Guessed by keyword rules - please verify' },
  admin: { text: 'admin', css: 'admin', title: 'Set by an admin' },
}[props.source] || null))
</script>

<template>
  <span v-if="marker" class="source" :class="marker.css" :title="marker.title">{{ marker.text }}</span>
</template>
