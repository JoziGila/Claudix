<template>
  <div class="app-wrapper">
    <!-- ISSUE-020: Connection error banner -->
    <div v-if="connectionError" class="connection-error-banner">
      <span class="codicon codicon-warning"></span>
      <span class="connection-error-message">{{ connectionError }}</span>
      <button
        class="connection-retry-button"
        :disabled="isRetrying"
        @click="handleRetry"
      >
        {{ isRetrying ? 'Retrying...' : 'Retry' }}
      </button>
    </div>

    <main class="app-main">
      <div class="page-container">
        <Motion
          :animate="pageAnimation"
          :transition="{ duration: 0.3, ease: 'easeOut' }"
          class="motion-wrapper"
        >
          <SessionsPage
            v-if="currentPage === 'sessions'"
            key="sessions"
            @switch-to-chat="handleSwitchToChat"
          />
          <ChatPage
            v-else-if="currentPage === 'chat'"
            key="chat"
            @switch-to-sessions="switchToPage('sessions')"
          />
          <SettingsPage
            v-else-if="currentPage === 'settings'"
            key="settings"
          />
          <!-- IconTestPage -->
          <!-- <IconTestPage
            v-else-if="currentPage === 'icontest'"
            key="icontest"
          /> -->
        </Motion>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, provide, computed } from 'vue';
import { Motion } from 'motion-v';
import SessionsPage from './pages/SessionsPage.vue';
import ChatPage from './pages/ChatPage.vue';
import SettingsPage from './pages/SettingsPage.vue';
import './styles/claude-theme.css';
import { useRuntime } from './composables/useRuntime';
import { RuntimeKey } from './composables/runtimeContext';
// import IconTestPage from './pages/IconTestPage.vue';

type PageName = 'sessions' | 'chat' | 'settings';

const bootstrap = window.CLAUDIX_BOOTSTRAP;
const initialPage = (bootstrap?.page as PageName | undefined) ?? 'chat';
const currentPage = ref<PageName>(initialPage);
const pageAnimation = ref({ opacity: 1, x: 0 });

// Only initialize runtime on pages that need it (chat / session list)
const needsRuntime = initialPage === 'chat' || initialPage === 'sessions';
const runtime = needsRuntime ? useRuntime() : null;

if (runtime) {
  provide(RuntimeKey, runtime);
}

// ISSUE-020: Connection error state for UI
const connectionError = computed(() => runtime?.connectionError.value ?? null);
const isRetrying = computed(() => runtime?.isRetrying.value ?? false);

async function handleRetry(): Promise<void> {
  if (runtime) {
    await runtime.retryConnection();
  }
}

onMounted(() => {
  if (runtime) {
    console.log('[App] runtime initialized', runtime);
  } else {
    console.log('[App] runtime not initialized for page', initialPage);
  }
});

function switchToPage(page: 'sessions' | 'chat') {
  pageAnimation.value = { opacity: 0, x: 0 };

  setTimeout(() => {
    currentPage.value = page;
    if (page === 'sessions') {
      pageAnimation.value = { opacity: 0.7, x: -3 };
      setTimeout(() => {
        pageAnimation.value = { opacity: 1, x: 0 };
      }, 50);
    } else {
      pageAnimation.value = { opacity: 0.7, x: 3 };
      setTimeout(() => {
        pageAnimation.value = { opacity: 1, x: 0 };
      }, 50);
    }
  }, 0);
}

function handleSwitchToChat(sessionId?: string) {
  if (sessionId) {
    console.log('Switching to chat with session:', sessionId);
  }
  switchToPage('chat');
}
</script>

<style>
.app-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  color: var(--vscode-editor-foreground);
}

.app-main {
  flex: 1;
  overflow: hidden;
}

.page-container {
  position: relative;
  height: 100%;
  width: 100%;
}

.motion-wrapper {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
}

/* ISSUE-020: Connection error banner styles */
.connection-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--vscode-inputValidation-warningBackground, #5a4a1a);
  border-bottom: 1px solid var(--vscode-inputValidation-warningBorder, #be8c00);
  color: var(--vscode-inputValidation-warningForeground, #cca700);
  font-size: 13px;
}

.connection-error-banner .codicon-warning {
  flex-shrink: 0;
}

.connection-error-message {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connection-retry-button {
  flex-shrink: 0;
  padding: 4px 12px;
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: 2px;
  cursor: pointer;
  font-size: 12px;
}

.connection-retry-button:hover:not(:disabled) {
  background-color: var(--vscode-button-hoverBackground);
}

.connection-retry-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
