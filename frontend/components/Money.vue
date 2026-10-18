<script setup>
defineProps({ amount: { type: Number, default: 0 } })
</script>

<template>
  <span>{{ formatMoney(amount) }}</span>
</template>
