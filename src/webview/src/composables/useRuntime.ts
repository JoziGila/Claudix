import { onMounted, onUnmounted, watch, ref, type Ref } from 'vue';
import { signal, effect } from 'alien-signals';
import { EventEmitter } from '../utils/events';
import { ConnectionManager } from '../core/ConnectionManager';
import { VSCodeTransport } from '../transport/VSCodeTransport';
import { AppContext } from '../core/AppContext';
import { SessionStore } from '../core/SessionStore';
import type { SelectionRange } from '../core/Session';

/**
 * Runtime instance with connection recovery support (ISSUE-020)
 */
export interface RuntimeInstance {
  connectionManager: ConnectionManager;
  appContext: AppContext;
  sessionStore: SessionStore;
  atMentionEvents: EventEmitter<string>;
  selectionEvents: EventEmitter<any>;

  /**
   * Connection error message for UI display (ISSUE-020)
   * null when connected or connecting, string when failed
   */
  connectionError: Ref<string | null>;

  /**
   * Whether connection is being retried (ISSUE-020)
   */
  isRetrying: Ref<boolean>;

  /**
   * Manually retry the connection (ISSUE-020)
   */
  retryConnection: () => Promise<void>;
}

export function useRuntime(): RuntimeInstance {
  const atMentionEvents = new EventEmitter<string>();
  const selectionEvents = new EventEmitter<any>();

  const connectionManager = new ConnectionManager(() => new VSCodeTransport(atMentionEvents, selectionEvents));
  const appContext = new AppContext(connectionManager);

  // ISSUE-020: Connection error state for UI display
  const connectionError = ref<string | null>(null);
  const isRetrying = ref(false);

  // Sync ConnectionManager error signal to Vue ref
  const cleanupErrorSync = effect(() => {
    const error = connectionManager.error();
    connectionError.value = error ?? null;
  });

  // Sync retry attempt to isRetrying
  const cleanupRetrySync = effect(() => {
    const attempt = connectionManager.retryAttempt();
    isRetrying.value = attempt > 0;
  });

  /**
   * Manual retry function for UI retry button (ISSUE-020)
   */
  async function retryConnection(): Promise<void> {
    isRetrying.value = true;
    connectionError.value = null;
    try {
      const connection = await connectionManager.retry();
      await connection.opened;
      await initializeAfterConnection(connection);
    } catch (e) {
      console.error('[runtime] retry failed', e);
      connectionError.value = e instanceof Error ? e.message : 'Connection failed';
    } finally {
      isRetrying.value = false;
    }
  }

  // Create alien-signal for SessionContext
  // AppContext.currentSelection is Vue Ref, but SessionContext needs alien-signal
  const currentSelectionSignal = signal<SelectionRange | undefined>(undefined);

  // Bidirectional sync Vue Ref ↔ Alien Signal
  // Vue Ref → Alien Signal
  watch(
    () => appContext.currentSelection(),
    (newValue) => {
      currentSelectionSignal(newValue);
    },
    { immediate: true }
  );

  const sessionStore = new SessionStore(connectionManager, {
    commandRegistry: appContext.commandRegistry,
    currentSelection: currentSelectionSignal,
    fileOpener: appContext.fileOpener,
    showNotification: appContext.showNotification?.bind(appContext),
    startNewConversationTab: appContext.startNewConversationTab?.bind(appContext),
    renameTab: appContext.renameTab?.bind(appContext),
    openURL: appContext.openURL.bind(appContext)
  });

  selectionEvents.add((selection) => {
    appContext.currentSelection(selection);
  });

  // SessionStore's internal effect automatically watches connection and fetches session list

  // Watch claudeConfig changes and register Slash Commands
  let slashCommandDisposers: Array<() => void> = [];

  const cleanupSlashCommands = effect(() => {
    const connection = connectionManager.connection();
    const claudeConfig = connection?.claudeConfig();

    // Clean up old Slash Commands
    slashCommandDisposers.forEach(dispose => dispose());
    slashCommandDisposers = [];

    // Register new Slash Commands
    if (claudeConfig?.slashCommands && Array.isArray(claudeConfig.slashCommands)) {
      slashCommandDisposers = claudeConfig.slashCommands
        .filter((cmd: any) => typeof cmd?.name === 'string' && cmd.name)
        .map((cmd: any) => {
          return appContext.commandRegistry.registerAction(
            {
              id: `slash-command-${cmd.name}`,
              label: `/${cmd.name}`,
              description: typeof cmd?.description === 'string' ? cmd.description : undefined
            },
            'Slash Commands',
            () => {
              console.log('[Runtime] Execute slash command:', cmd.name);
              const activeSession = sessionStore.activeSession();
              if (activeSession) {
                void activeSession.send(`/${cmd.name}`, [], false);
              } else {
                console.warn('[Runtime] No active session to execute slash command');
              }
            }
          );
        });

      console.log('[Runtime] Registered', slashCommandDisposers.length, 'slash commands');
    }
  });

  // ISSUE-020: Helper function for post-connection initialization
  // Can be called from onMounted or retryConnection
  let disposed = false;

  async function initializeAfterConnection(connection: import('../transport/BaseTransport').BaseTransport): Promise<void> {
    if (disposed) return;

    try {
      const selection = await connection.getCurrentSelection();
      if (!disposed) appContext.currentSelection(selection?.selection ?? undefined);
    } catch (e) { console.warn('[runtime] selection fetch failed', e); }

    try {
      const assets = await connection.getAssetUris();
      if (!disposed) appContext.assetUris(assets.assetUris);
    } catch (e) { console.warn('[runtime] assets fetch failed', e); }

    await sessionStore.listSessions();
    if (!disposed && !sessionStore.activeSession()) {
      await sessionStore.createSession({ isExplicit: false });
    }
  }

  onMounted(() => {
    (async () => {
      try {
        const connection = await connectionManager.get();
        await connection.opened;
        connectionError.value = null;
        await initializeAfterConnection(connection);
      } catch (e) {
        // ISSUE-020: Set error state instead of silent failure
        const errorMessage = e instanceof Error ? e.message : 'Connection failed';
        console.error('[runtime] connection failed', e);
        connectionError.value = errorMessage;
      }
    })();

    onUnmounted(() => {
      disposed = true;

      // Clean up command registrations
      slashCommandDisposers.forEach(dispose => dispose());
      cleanupSlashCommands();

      // ISSUE-020: Cleanup new effect subscriptions
      cleanupErrorSync();
      cleanupRetrySync();

      connectionManager.close();
    });
  });

  return {
    connectionManager,
    appContext,
    sessionStore,
    atMentionEvents,
    selectionEvents,
    // ISSUE-020: Connection recovery support
    connectionError,
    isRetrying,
    retryConnection
  };
}

