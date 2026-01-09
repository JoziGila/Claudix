/**
 * useSession - Vue Composable for Session
 *
 * Core features:
 * 1. Convert Session class alien-signals to Vue refs
 * 2. Convert alien computed to Vue computed
 * 3. Provide Vue-friendly API
 *
 * Usage:
 * ```typescript
 * const session = new Session(...);
 * const sessionAPI = useSession(session);
 * // sessionAPI.messages is Vue Ref<any[]>
 * // sessionAPI.busy is Vue Ref<boolean>
 * ```
 */

import { computed } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useSignal } from '@gn8/alien-signals-vue';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { Session, SelectionRange } from '../core/Session';
import type { PermissionRequest } from '../core/PermissionRequest';
import type { BaseTransport } from '../transport/BaseTransport';
import type { ModelOption } from '../../../shared/messages';

/**
 * useSession return type
 */
export interface UseSessionReturn {
  // Basic state
  connection: Ref<BaseTransport | undefined>;
  busy: Ref<boolean>;
  isLoading: Ref<boolean>;
  error: Ref<string | undefined>;
  sessionId: Ref<string | undefined>;
  isExplicit: Ref<boolean>;
  lastModifiedTime: Ref<number>;

  // Core data
  messages: Ref<any[]>;
  messageCount: Ref<number>;
  cwd: Ref<string | undefined>;
  permissionMode: Ref<PermissionMode>;
  summary: Ref<string | undefined>;
  modelSelection: Ref<string | undefined>;
  thinkingLevel: Ref<string>;
  todos: Ref<any[]>;
  worktree: Ref<{ name: string; path: string } | undefined>;
  selection: Ref<SelectionRange | undefined>;

  // Usage statistics
  usageData: Ref<{
    totalTokens: number;
    totalCost: number;
    contextWindow: number;
  }>;

  // Computed properties
  claudeConfig: ComputedRef<any>;
  config: ComputedRef<any>;
  permissionRequests: ComputedRef<PermissionRequest[]>;

  // Derived state
  isOffline: ComputedRef<boolean>;

  // Methods
  getConnection: () => Promise<BaseTransport>;
  preloadConnection: () => Promise<void>;
  loadFromServer: () => Promise<void>;
  send: (
    input: string,
    attachments?: Array<{ fileName: string; mediaType: string; data: string }>,
    includeSelection?: boolean
  ) => Promise<void>;
  launchClaude: () => Promise<string>;
  interrupt: () => Promise<void>;
  restartClaude: () => Promise<void>;
  listFiles: (pattern?: string) => Promise<any>;
  setPermissionMode: (mode: PermissionMode, applyToConnection?: boolean) => Promise<boolean>;
  setModel: (model: ModelOption) => Promise<boolean>;
  setThinkingLevel: (level: string) => Promise<void>;
  getMcpServers: () => Promise<any>;
  openConfigFile: (configType: string) => Promise<void>;
  onPermissionRequested: (callback: (request: PermissionRequest) => void) => () => void;
  dispose: () => void;

  // Raw instance (for advanced scenarios)
  __session: Session;
}

/**
 * useSession - Wrap Session instance as Vue Composable API
 *
 * @param session Session instance
 * @returns Vue-friendly API
 */
export function useSession(session: Session): UseSessionReturn {
  // Use official useSignal to bridge signals/computed
  const connection = useSignal(session.connection);
  const busy = useSignal(session.busy);
  const isLoading = useSignal(session.isLoading);
  const error = useSignal(session.error);
  const sessionId = useSignal(session.sessionId);
  const isExplicit = useSignal(session.isExplicit);
  const lastModifiedTime = useSignal(session.lastModifiedTime);
  const messages = useSignal(session.messages);
  const messageCount = useSignal(session.messageCount);
  const cwd = useSignal(session.cwd);
  const permissionMode = useSignal(session.permissionMode);
  const summary = useSignal(session.summary);
  const modelSelection = useSignal(session.modelSelection);
  const thinkingLevel = useSignal(session.thinkingLevel);
  const todos = useSignal(session.todos);
  const worktree = useSignal(session.worktree);
  const selection = useSignal(session.selection);
  const usageData = useSignal(session.usageData);

  // Use useSignal to wrap alien computed (read-only usage, no setter calls)
  const claudeConfig = useSignal(session.claudeConfig as any);
  const config = useSignal(session.config as any);
  const permissionRequests = useSignal(session.permissionRequests) as unknown as ComputedRef<PermissionRequest[]>;

  // Derived state (temporarily keeping Vue computed)
  const isOffline = computed(() => session.isOffline());

  // Bind all methods (ensure correct 'this' context)
  const getConnection = session.getConnection.bind(session);
  const preloadConnection = session.preloadConnection.bind(session);
  const loadFromServer = session.loadFromServer.bind(session);
  const send = session.send.bind(session);
  const launchClaude = session.launchClaude.bind(session);
  const interrupt = session.interrupt.bind(session);
  const restartClaude = session.restartClaude.bind(session);
  const listFiles = session.listFiles.bind(session);
  const setPermissionMode = session.setPermissionMode.bind(session);
  const setModel = session.setModel.bind(session);
  const setThinkingLevel = session.setThinkingLevel.bind(session);
  const getMcpServers = session.getMcpServers.bind(session);
  const openConfigFile = session.openConfigFile.bind(session);
  const onPermissionRequested = session.onPermissionRequested.bind(session);
  const dispose = session.dispose.bind(session);

  return {
    // State
    connection,
    busy,
    isLoading,
    error,
    sessionId,
    isExplicit,
    lastModifiedTime,
    messages,
    messageCount,
    cwd,
    permissionMode,
    summary,
    modelSelection,
    thinkingLevel,
    todos,
    worktree,
    selection,
    usageData,

    // Computed properties
    claudeConfig,
    config,
    permissionRequests,
    isOffline,

    // Methods
    getConnection,
    preloadConnection,
    loadFromServer,
    send,
    launchClaude,
    interrupt,
    restartClaude,
    listFiles,
    setPermissionMode,
    setModel,
    setThinkingLevel,
    getMcpServers,
    openConfigFile,
    onPermissionRequested,
    dispose,

    // Raw instance
    __session: session,
  };
}
