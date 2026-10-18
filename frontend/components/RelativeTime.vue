<script setup>
// "5 minutes ago", re-evaluated every minute. The exact time is in the tooltip.
const props = defineProps({ value: { type: String, required: true } })

const now = ref(Date.now())
let timer
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 60_000) })
onBeforeUnmount(() => clearInterval(timer))

const text = computed(() => {
  void now.value // re-run when the clock ticks
  return formatRelative(props.value)
})
</script>

<template>
  <time :datetime="value" :title="formatDateTime(value)">{{ text }}</time>
</template>
