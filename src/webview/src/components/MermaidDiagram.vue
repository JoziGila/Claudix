<template>
  <MermaidBlockNode
    v-bind="$attrs"
    :show-header="false"
    :show-mode-toggle="true"
    :show-copy-button="false"
    :show-export-button="false"
    :show-fullscreen-button="false"
    :show-collapse-button="false"
    :show-zoom-controls="false"
    :enable-wheel-zoom="true"
  />
</template>

<script setup lang="ts">
import { MermaidBlockNode } from 'markstream-vue';
</script>

<style scoped>
/* Container for hover reveal */
:deep(.mermaid-container) {
  position: relative;
}

/* Subtle toggle - bottom-right, visible on hover */
:deep(.mode-toggle) {
  position: absolute;
  bottom: 8px;
  right: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
}

:deep(.mermaid-container:hover .mode-toggle) {
  opacity: 0.7;
}

:deep(.mode-toggle:hover) {
  opacity: 1 !important;
}
</style>
