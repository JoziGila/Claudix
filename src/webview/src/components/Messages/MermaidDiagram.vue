<template>
  <MermaidBlockNode
    v-bind="$attrs"
    :show-header="false"
    :show-mode-toggle="true"
    :show-copy-button="true"
    :show-export-button="false"
    :show-fullscreen-button="true"
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

/* Toolbar buttons - top-right, visible on hover */
:deep(.mermaid-toolbar) {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

:deep(.mermaid-container:hover .mermaid-toolbar) {
  opacity: 0.7;
}

:deep(.mermaid-toolbar:hover) {
  opacity: 1 !important;
}

:deep(.mermaid-toolbar button) {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  cursor: pointer;
  color: var(--vscode-foreground);
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.mermaid-toolbar button:hover) {
  background: var(--vscode-toolbar-hoverBackground);
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

/* Fullscreen overlay styles */
:deep(.mermaid-fullscreen-overlay) {
  background: var(--vscode-editor-background);
}

:deep(.mermaid-fullscreen-overlay .mermaid-toolbar) {
  opacity: 1;
}
</style>
