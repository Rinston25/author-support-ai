<script setup>
// Shows where an unpublished book is in the production pipeline.
const props = defineProps({ currentStage: { type: String, required: true } })

const currentIndex = computed(() => PRODUCTION_STAGES.indexOf(props.currentStage))

function stateOf(index) {
  if (index < currentIndex.value) return 'done'
  if (index === currentIndex.value) return 'current'
  return 'todo'
}
</script>

<template>
  <ol class="stepper" aria-label="Production stages">
    <li v-for="(stage, index) in PRODUCTION_STAGES" :key="stage" :class="stateOf(index)">
      <span class="marker">{{ stateOf(index) === 'done' ? '✓' : index + 1 }}</span>
      <span class="label">{{ stage }}</span>
    </li>
  </ol>
</template>

<style scoped>
.stepper { list-style: none; margin: 0.5rem 0 0; padding: 0; display: grid; gap: 0.3rem; }
.stepper li { display: flex; align-items: center; gap: 0.6rem; font-size: 0.88rem; color: var(--muted); }
.marker { width: 1.4rem; height: 1.4rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 700; background: #eef0f3; }
.done .marker { background: var(--success); color: #fff; }
.done { color: var(--text); }
.current { color: var(--primary); font-weight: 700; }
.current .marker { background: var(--primary); color: #fff; box-shadow: 0 0 0 3px var(--primary-soft); }
</style>
