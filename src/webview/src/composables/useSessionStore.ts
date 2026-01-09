/**
 * useSessionStore - Vue Composable for SessionStore
 *
 * Core features:
 * 1. Convert SessionStore class alien-signals to Vue refs
 * 2. Convert alien computed to Vue computed
 * 3. Provide Vue-friendly API
 *
 * Usage:
 * ```typescript
 * const store = new SessionStore(...);
 * const storeAPI = useSessionStore(store);
 * // storeAPI.sessions is Vue Ref<Session[]>
 * // storeAPI.activeSession is Vue Ref<Session | undefined>
 * ```
 */

import type { ComputedRef, Ref } from 'vue';
import { useSignal } from '@gn8/alien-signals-vue';
import type { SessionStore, PermissionEvent } from '../core/SessionStore';
import type { Session, SessionOptions } from '../core/Session';
import type { BaseTransport } from '../transport/BaseTransport';

/**
 * useSessionStore return type
 */
export interface UseSessionStoreReturn {
  // State
  sessions: Ref<Session[]>;
  activeSession: Ref<Session | undefined>;

  // Computed properties
  sessionsByLastModified: ComputedRef<Session[]>;
  connectionState: ComputedRef<string>;

  // Methods
  onPermissionRequested: (callback: (event: PermissionEvent) => void) => () => void;
  getConnection: () => Promise<BaseTransport>;
  createSession: (options?: SessionOptions) => Promise<Session>;
  listSessions: () => Promise<void>;
  setActiveSession: (session: Session | undefined) => void;
  dispose: () => void;

  // Raw instance (for advanced scenarios)
  __store: SessionStore;
}

/**
 * useSessionStore - Wrap SessionStore instance as Vue Composable API
 *
 * @param store SessionStore instance
 * @returns Vue-friendly API
 */
export function useSessionStore(store: SessionStore): UseSessionStoreReturn {
  // Use official useSignal to bridge
  const sessions = useSignal(store.sessions);
  const activeSession = useSignal(store.activeSession);

  // Use useSignal to wrap alien computed
  const sessionsByLastModified = useSignal(store.sessionsByLastModified) as unknown as ComputedRef<Session[]>;
  const connectionState = useSignal(store.connectionState) as unknown as ComputedRef<string>;

  // Bind all methods (ensure correct 'this' context)
  const onPermissionRequested = store.onPermissionRequested.bind(store);
  const getConnection = store.getConnection.bind(store);
  const createSession = store.createSession.bind(store);
  const listSessions = store.listSessions.bind(store);
  const setActiveSession = store.setActiveSession.bind(store);
  const dispose = store.dispose.bind(store);

  return {
    // State
    sessions,
    activeSession,

    // Computed properties
    sessionsByLastModified,
    connectionState,

    // Methods
    onPermissionRequested,
    getConnection,
    createSession,
    listSessions,
    setActiveSession,
    dispose,

    // Raw instance
    __store: store,
  };
}
