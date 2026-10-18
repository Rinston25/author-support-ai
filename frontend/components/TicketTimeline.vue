<script setup>
// The conversation. `viewer` decides the labels: authors see "You" and
// "BookLeaf Support Team"; admins see real names and which replies were AI-assisted.
const props = defineProps({
  messages: { type: Array, required: true },
  viewer: { type: String, default: 'author' },
  highlightIds: { type: Array, default: () => [] },
})

function senderLabel(message) {
  if (props.viewer === 'author' && message.senderRole === 'author') return 'You'
  return message.senderName
}
</script>

<template>
  <div class="timeline">
    <div
      v-for="message in messages"
      :key="message.id"
      class="message"
      :class="[message.senderRole, { highlight: highlightIds.includes(message.id) }]"
    >
      <div class="message-meta">
        {{ senderLabel(message) }} · <RelativeTime :value="message.createdAt" />
        <span v-if="viewer === 'admin' && message.aiAssisted" class="badge">AI-assisted</span>
        <span v-if="highlightIds.includes(message.id)" class="badge critical">New</span>
      </div>
      {{ message.body }}
    </div>
  </div>
</template>
