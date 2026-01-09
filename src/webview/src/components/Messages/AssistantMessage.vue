<template>
  <div class="assistant-message" :class="messageClasses">
    <!-- Interrupted badge -->
    <div v-if="isInterrupted" class="interrupted-badge">
      <span class="codicon codicon-warning"></span>
      Stream interrupted
    </div>

    <template v-if="typeof message.message.content === 'string'">
      <!-- ISSUE-021: String content always shows prefix -->
      <ContentBlock
        :block="{ type: 'text', text: message.message.content }"
        :context="context"
        :show-prefix="showPrefixOnText"
      />
    </template>
    <template v-else>
      <!-- ISSUE-021: Only first text block gets the prefix dot -->
      <ContentBlock
        v-for="(wrapper, index) in message.message.content"
        :key="index"
        :block="wrapper.content"
        :wrapper="wrapper"
        :context="context"
        :show-prefix="showPrefixOnText && index === firstTextBlockIndex"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSignal } from '@gn8/alien-signals-vue';
import type { Message } from '../../models/Message';
import type { ToolContext } from '../../types/tool';
import ContentBlock from './ContentBlock.vue';

interface Props {
  message: Message;
  context: ToolContext;
}

const props = defineProps<Props>();

// Streaming state - reactively consumed via useSignal
const isStreaming = useSignal(props.message.isStreaming);
const isInterrupted = useSignal(props.message.isInterrupted);

// ISSUE-021: Find the index of the first text block
const firstTextBlockIndex = computed(() => {
  const content = props.message.message.content;
  if (!Array.isArray(content)) return 0;
  return content.findIndex(wrapper => wrapper.content.type === 'text');
});

// ISSUE-021: Determine if we should show prefix on text blocks
// Only show prefix for messages without tool_use
const showPrefixOnText = computed(() => {
  const content = props.message.message.content;
  if (!Array.isArray(content)) return true;
  return !content.some(wrapper => wrapper.content.type === 'tool_use');
});

// Compute dynamic classes
const messageClasses = computed(() => {
  const classes: string[] = [];

  // Add streaming class for pulsing indicator
  if (isStreaming.value) {
    classes.push('streaming');
  }

  // Add interrupted class for error styling
  if (isInterrupted.value) {
    classes.push('interrupted');
  }

  // ISSUE-021: Removed 'prefix' class - dot is now rendered by TextBlock

  return classes;
});
</script>

<style scoped>
.assistant-message {
  display: block;
  outline: none;
  padding: 0px 16px 0.4rem;
  background-color: var(--vscode-sideBar-background);
  opacity: 1;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vscode-editor-foreground);
  word-wrap: break-word;
  padding-left: 24px;
  position: relative;
}

/* ISSUE-021: Prefix dot is now rendered by TextBlock, not here */

/* Streaming state - subtle pulsing indicator */
.assistant-message.streaming::after {
  content: "";
  position: absolute;
  left: 4px;
  top: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--vscode-progressBar-background, #0078d4);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.4;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

/* Interrupted state */
.assistant-message.interrupted {
  border-left: 2px solid var(--vscode-inputValidation-warningBorder, #c9a500);
}

/* Interrupted badge */
.interrupted-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  margin-bottom: 8px;
  background-color: var(--vscode-inputValidation-warningBackground, rgba(201, 165, 0, 0.1));
  border: 1px solid var(--vscode-inputValidation-warningBorder, #c9a500);
  border-radius: 4px;
  font-size: 11px;
  color: var(--vscode-inputValidation-warningForeground, #c9a500);
}

.interrupted-badge .codicon {
  font-size: 12px;
}
</style>
