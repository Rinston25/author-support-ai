<script setup>
// Shows an ApiError (or any error) and an optional retry button.
defineProps({
  error: { type: Object, default: null },
  retryable: { type: Boolean, default: false },
})
defineEmits(['retry'])
</script>

<template>
  <div v-if="error" class="banner error" role="alert">
    <div class="row">
      <span>{{ error.message }}</span>
      <span class="spacer" />
      <button v-if="retryable" class="btn secondary small" @click="$emit('retry')">Try again</button>
    </div>
    <ul v-if="error.details && error.details.length" class="small">
      <li v-for="(detail, index) in error.details" :key="index">{{ detail.field ? `${detail.field}: ` : '' }}{{ detail.message }}</li>
    </ul>
  </div>
</template>
