# Claudix Critical Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 6 critical issues in Claudix: message queue, extension cleanup, request timeouts, session disposal, stream race conditions, and AsyncStream error handling.

**Architecture:** Bi-directional extension/webview communication with Vue 3 frontend. Uses alien-signals for reactivity, AsyncStream for producer/consumer patterns, and DI container for services. Fixes follow Vue 3.5 best practices, AbortController patterns, and effectScope for cleanup.

**Tech Stack:** TypeScript, Vue 3.5, alien-signals, VSCode Extension API, AbortController, effectScope

**Research Sources:**
- [Vue 3 Effect Scope](https://borstch.com/blog/development/reactive-effect-and-effect-scope-in-vuejs-3)
- [AbortController in Node.js](https://blog.appsignal.com/2025/02/12/managing-asynchronous-operations-in-nodejs-with-abortcontroller.html)
- [AbortSignal.timeout()](https://codedrivendevelopment.com/posts/everything-about-abort-signal-timeout)
- [Vue Watcher Memory Leaks](https://bryceandy.com/posts/the-hidden-reason-your-vue-watchers-leak-memory-and-how-to-avoid-it)
- [VSCode Extension Disposal](https://github.com/microsoft/vscode/issues/105484)
- [Async Race Conditions](https://dev.to/alex_aslam/tackling-asynchronous-bugs-in-javascript-race-conditions-and-unresolved-promises-7jo)

---

## Issue Priority Order

| # | Issue | Severity | User Impact |
|---|-------|----------|-------------|
| 1 | 001 - Missing Message Queue | Critical | Silent data loss |
| 2 | 002 - Empty Deactivate | Critical | Orphan processes |
| 3 | 003 - Request Timeout Missing | High | UI freeze |
| 4 | 005 - Stream Cleanup Race | High | Data corruption |
| 5 | 004 - Session Dispose Incomplete | High | Memory leak |
| 6 | 006 - AsyncStream Single Iteration | Medium | Developer confusion |

---

## Task 1: Fix Missing Message Queue (ISSUE-001)

**Problem:** User messages sent while Claude is responding are silently discarded.

**Solution:** Implement message queue in ChatPage.vue with visual indicator and auto-send on idle.

**Files:**
- Modify: `src/webview/src/pages/ChatPage.vue`
- Modify: `src/webview/src/components/ChatInputBox.vue`
- Create: `src/webview/src/composables/useMessageQueue.ts`
- Test: `src/webview/src/__tests__/useMessageQueue.spec.ts`

### Step 1.1: Create the composable test file

```typescript
// src/webview/src/__tests__/useMessageQueue.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useMessageQueue } from '../composables/useMessageQueue'

describe('useMessageQueue', () => {
  let mockSubmit: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockSubmit = vi.fn().mockResolvedValue(undefined)
  })

  it('should queue message when busy', () => {
    const isBusy = ref(true)
    const { queueMessage, pendingMessages } = useMessageQueue(isBusy, mockSubmit)

    queueMessage('test message')

    expect(pendingMessages.value).toHaveLength(1)
    expect(pendingMessages.value[0]).toBe('test message')
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('should submit directly when not busy', () => {
    const isBusy = ref(false)
    const { queueMessage, pendingMessages } = useMessageQueue(isBusy, mockSubmit)

    queueMessage('test message')

    expect(pendingMessages.value).toHaveLength(0)
    expect(mockSubmit).toHaveBeenCalledWith('test message')
  })

  it('should process queue when busy becomes false', async () => {
    const isBusy = ref(true)
    const { queueMessage, pendingMessages } = useMessageQueue(isBusy, mockSubmit)

    queueMessage('message 1')
    queueMessage('message 2')
    expect(pendingMessages.value).toHaveLength(2)

    isBusy.value = false
    await vi.waitFor(() => expect(mockSubmit).toHaveBeenCalledWith('message 1'))

    expect(pendingMessages.value).toHaveLength(1)
  })

  it('should clear queue on clearQueue call', () => {
    const isBusy = ref(true)
    const { queueMessage, clearQueue, pendingMessages } = useMessageQueue(isBusy, mockSubmit)

    queueMessage('message 1')
    queueMessage('message 2')
    clearQueue()

    expect(pendingMessages.value).toHaveLength(0)
  })
})
```

### Step 1.2: Run test to verify it fails

Run: `cd /Users/jozigila/Code/platform/Claudix && npm test -- --run src/webview/src/__tests__/useMessageQueue.spec.ts`

Expected: FAIL - module not found

### Step 1.3: Create useMessageQueue composable

```typescript
// src/webview/src/composables/useMessageQueue.ts
import { ref, watch, type Ref } from 'vue'

export interface UseMessageQueueOptions {
  maxQueueSize?: number
}

export function useMessageQueue(
  isBusy: Ref<boolean>,
  submitFn: (message: string) => Promise<void>,
  options: UseMessageQueueOptions = {}
) {
  const { maxQueueSize = 10 } = options
  const pendingMessages = ref<string[]>([])
  const isProcessing = ref(false)

  async function processQueue() {
    if (isProcessing.value || isBusy.value || pendingMessages.value.length === 0) {
      return
    }

    isProcessing.value = true
    try {
      const nextMessage = pendingMessages.value.shift()
      if (nextMessage) {
        await submitFn(nextMessage)
      }
    } finally {
      isProcessing.value = false
    }
  }

  function queueMessage(message: string) {
    if (!message.trim()) return

    if (isBusy.value) {
      if (pendingMessages.value.length < maxQueueSize) {
        pendingMessages.value.push(message)
      }
    } else {
      void submitFn(message)
    }
  }

  function clearQueue() {
    pendingMessages.value = []
  }

  // Watch for busy state change to process queue
  watch(isBusy, async (busy) => {
    if (!busy) {
      await processQueue()
    }
  })

  return {
    pendingMessages,
    queueMessage,
    clearQueue,
    isProcessing
  }
}
```

### Step 1.4: Run test to verify it passes

Run: `cd /Users/jozigila/Code/platform/Claudix && npm test -- --run src/webview/src/__tests__/useMessageQueue.spec.ts`

Expected: PASS

### Step 1.5: Update ChatPage.vue to use message queue

Modify `src/webview/src/pages/ChatPage.vue`:

Find the script setup section and add:

```typescript
// Add import
import { useMessageQueue } from '../composables/useMessageQueue'

// After existing refs, add:
const { pendingMessages, queueMessage, clearQueue } = useMessageQueue(
  isBusy,
  handleSubmit
)

// Add handler for queue-message event
function handleQueueMessage(content: string) {
  queueMessage(content)
}
```

Update the template ChatInputBox:

```vue
<ChatInputBox
  :conversation-working="isBusy"
  @submit="handleSubmit"
  @queue-message="handleQueueMessage"
  @stop="handleStop"
/>

<!-- Add queue indicator below input -->
<div v-if="pendingMessages.length > 0" class="queue-indicator">
  <span>{{ pendingMessages.length }} message(s) queued</span>
  <button @click="clearQueue">Clear</button>
</div>
```

### Step 1.6: Add queue indicator styles

```css
.queue-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  font-size: 12px;
  border-radius: 4px;
}

.queue-indicator button {
  background: transparent;
  border: 1px solid currentColor;
  color: inherit;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
}
```

### Step 1.7: Commit

```bash
git add src/webview/src/composables/useMessageQueue.ts \
        src/webview/src/__tests__/useMessageQueue.spec.ts \
        src/webview/src/pages/ChatPage.vue
git commit -m "feat(001): add message queue for busy state

- Create useMessageQueue composable with TDD
- Queue messages when Claude is responding
- Auto-process queue when response completes
- Add visual indicator for queued messages
- Fixes silent message loss (ISSUE-001)"
```

---

## Task 2: Fix Empty Deactivate (ISSUE-002)

**Problem:** Extension deactivate() is empty - no cleanup of services, processes, or connections.

**Solution:** Implement proper cleanup using VSCode subscriptions pattern and service shutdown.

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/services/claude/ClaudeAgentService.ts`
- Modify: `src/services/serviceRegistry.ts`

### Step 2.1: Add shutdown method to ClaudeAgentService interface

Modify `src/services/claude/ClaudeAgentService.ts`:

```typescript
// Add to IClaudeAgentService interface
export interface IClaudeAgentService {
  // ... existing methods ...
  shutdown(): Promise<void>
}

// Ensure implementation exists
async shutdown(): Promise<void> {
  // Close all active channels
  await this.closeAllChannels()

  // Complete the input stream
  this.fromClientStream.done()

  // Clear outstanding requests with rejection
  for (const [requestId, handler] of this.outstandingRequests) {
    handler.reject(new Error('Extension shutting down'))
  }
  this.outstandingRequests.clear()
}
```

### Step 2.2: Update extension.ts with proper deactivation

```typescript
// src/extension.ts

// At module level, store reference
let instantiationService: IInstantiationService | undefined

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const builder = new InstantiationServiceBuilder()
  registerServices(builder, context)
  instantiationService = builder.seal()

  // ... existing activation code ...

  // Register cleanup on subscriptions
  context.subscriptions.push({
    dispose: async () => {
      if (instantiationService) {
        try {
          const agentService = instantiationService.invokeFunction(
            accessor => accessor.get(IClaudeAgentService)
          )
          await agentService.shutdown()
        } catch (e) {
          console.error('Error during extension cleanup:', e)
        }
      }
    }
  })
}

export function deactivate(): Thenable<void> | undefined {
  if (!instantiationService) {
    return undefined
  }

  return instantiationService.invokeFunction(async accessor => {
    try {
      const agentService = accessor.get(IClaudeAgentService)
      await agentService.shutdown()
    } catch (e) {
      console.error('Error during deactivation:', e)
    } finally {
      instantiationService = undefined
    }
  })
}
```

### Step 2.3: Add disposal tracking to services

Modify `src/services/serviceRegistry.ts` to track disposables:

```typescript
// Add disposal registration helper
export function registerDisposableService<T extends { dispose?(): void }>(
  context: vscode.ExtensionContext,
  service: T
): T {
  if (service.dispose) {
    context.subscriptions.push({ dispose: () => service.dispose?.() })
  }
  return service
}
```

### Step 2.4: Manual test deactivation

1. Open extension, start a conversation
2. Run "Developer: Reload Window"
3. Check Output panel - should see "Extension shutting down" log
4. Run `ps aux | grep claude` - should see no orphan processes

### Step 2.5: Commit

```bash
git add src/extension.ts \
        src/services/claude/ClaudeAgentService.ts \
        src/services/serviceRegistry.ts
git commit -m "feat(002): implement proper extension cleanup

- Add shutdown() to ClaudeAgentService
- Implement deactivate() with service cleanup
- Register disposables via subscriptions
- Reject outstanding requests on shutdown
- Fixes resource leak on reload (ISSUE-002)"
```

---

## Task 3: Fix Request Timeout Missing (ISSUE-003)

**Problem:** RPC requests never timeout - promises hang forever.

**Solution:** Implement timeout wrapper using AbortSignal.timeout() pattern.

**Files:**
- Modify: `src/services/claude/ClaudeAgentService.ts`
- Modify: `src/webview/src/transport/BaseTransport.ts`
- Create: `src/shared/timeout.ts`
- Test: `src/shared/__tests__/timeout.spec.ts`

### Step 3.1: Create timeout utility test

```typescript
// src/shared/__tests__/timeout.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { withTimeout, TimeoutError } from '../timeout'

describe('withTimeout', () => {
  it('should resolve if promise completes before timeout', async () => {
    const result = await withTimeout(
      Promise.resolve('success'),
      1000
    )
    expect(result).toBe('success')
  })

  it('should reject with TimeoutError if timeout exceeded', async () => {
    const slowPromise = new Promise(resolve => setTimeout(resolve, 5000))

    await expect(withTimeout(slowPromise, 100))
      .rejects.toThrow(TimeoutError)
  })

  it('should include timeout duration in error message', async () => {
    const slowPromise = new Promise(resolve => setTimeout(resolve, 5000))

    try {
      await withTimeout(slowPromise, 100)
    } catch (e) {
      expect((e as Error).message).toContain('100ms')
    }
  })

  it('should abort with AbortSignal', async () => {
    const controller = new AbortController()
    const promise = withTimeout(
      new Promise(resolve => setTimeout(resolve, 5000)),
      10000,
      controller.signal
    )

    controller.abort()

    await expect(promise).rejects.toThrow('aborted')
  })
})
```

### Step 3.2: Run test to verify it fails

Run: `cd /Users/jozigila/Code/platform/Claudix && npm test -- --run src/shared/__tests__/timeout.spec.ts`

Expected: FAIL - module not found

### Step 3.3: Create timeout utility

```typescript
// src/shared/timeout.ts
export class TimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`)
    this.name = 'TimeoutError'
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  // Use modern AbortSignal.timeout if no external signal
  const timeoutSignal = AbortSignal.timeout(timeoutMs)

  // Combine signals if external signal provided
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal

  return new Promise<T>((resolve, reject) => {
    // Handle abort
    const onAbort = () => {
      if (timeoutSignal.aborted) {
        reject(new TimeoutError(timeoutMs))
      } else {
        reject(new Error('Request aborted'))
      }
    }

    if (combinedSignal.aborted) {
      onAbort()
      return
    }

    combinedSignal.addEventListener('abort', onAbort, { once: true })

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        combinedSignal.removeEventListener('abort', onAbort)
      })
  })
}

// Default timeouts by request type
export const REQUEST_TIMEOUTS = {
  init: 10_000,
  open_file: 5_000,
  get_claude_state: 10_000,
  tool_permission_request: 300_000, // 5 minutes for user interaction
  default: 30_000
} as const

export type RequestType = keyof typeof REQUEST_TIMEOUTS
```

### Step 3.4: Run test to verify it passes

Run: `cd /Users/jozigila/Code/platform/Claudix && npm test -- --run src/shared/__tests__/timeout.spec.ts`

Expected: PASS

### Step 3.5: Update ClaudeAgentService to use timeout

Modify `src/services/claude/ClaudeAgentService.ts`:

```typescript
import { withTimeout, REQUEST_TIMEOUTS, TimeoutError } from '../../shared/timeout'

// Replace sendRequest with timeout version
protected async sendRequest<TRequest, TResponse>(
  channelId: string,
  request: TRequest,
  timeoutMs?: number
): Promise<TResponse> {
  const requestId = this.generateId()
  const timeout = timeoutMs ?? REQUEST_TIMEOUTS.default

  const requestPromise = new Promise<TResponse>((resolve, reject) => {
    this.outstandingRequests.set(requestId, { resolve, reject })
    this.transport!.send({
      type: 'request',
      channelId,
      requestId,
      request
    })
  })

  try {
    return await withTimeout(requestPromise, timeout)
  } catch (e) {
    this.outstandingRequests.delete(requestId)
    if (e instanceof TimeoutError) {
      throw new Error(`Request to channel ${channelId} timed out after ${timeout}ms`)
    }
    throw e
  }
}
```

### Step 3.6: Update BaseTransport.ts (WebView side)

Modify `src/webview/src/transport/BaseTransport.ts`:

```typescript
// Add timeout support
protected async sendRequest<TResponse>(
  request: WebViewRequest,
  channelId?: string,
  abortSignal?: AbortSignal,
  timeoutMs = 30000
): Promise<TResponse> {
  const requestId = Math.random().toString(36).slice(2)

  const requestPromise = new Promise<TResponse>((resolve, reject) => {
    this.outstandingRequests.set(requestId, { resolve, reject })
    this.send({ type: 'request', channelId, requestId, request })
  })

  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const combinedSignal = abortSignal
    ? AbortSignal.any([abortSignal, timeoutSignal])
    : timeoutSignal

  return new Promise<TResponse>((resolve, reject) => {
    const cleanup = () => {
      this.outstandingRequests.delete(requestId)
    }

    combinedSignal.addEventListener('abort', () => {
      cleanup()
      reject(new Error(`Request timed out after ${timeoutMs}ms`))
    }, { once: true })

    requestPromise
      .then(resolve)
      .catch(reject)
      .finally(cleanup)
  })
}
```

### Step 3.7: Commit

```bash
git add src/shared/timeout.ts \
        src/shared/__tests__/timeout.spec.ts \
        src/services/claude/ClaudeAgentService.ts \
        src/webview/src/transport/BaseTransport.ts
git commit -m "feat(003): add request timeouts with AbortController

- Create withTimeout utility using AbortSignal.timeout()
- Add configurable timeouts per request type
- Update ClaudeAgentService sendRequest with timeout
- Update BaseTransport sendRequest with timeout
- Prevents hanging promises (ISSUE-003)"
```

---

## Task 4: Fix Stream Cleanup Race Condition (ISSUE-005)

**Problem:** 50ms setTimeout for stream cleanup causes race condition when channel IDs reuse.

**Solution:** Use versioned channels with synchronous cleanup.

**Files:**
- Modify: `src/webview/src/transport/BaseTransport.ts`
- Create: `src/webview/src/transport/VersionedStreamMap.ts`
- Test: `src/webview/src/transport/__tests__/VersionedStreamMap.spec.ts`

### Step 4.1: Create VersionedStreamMap test

```typescript
// src/webview/src/transport/__tests__/VersionedStreamMap.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { VersionedStreamMap } from '../VersionedStreamMap'
import { AsyncQueue } from '../AsyncQueue'

describe('VersionedStreamMap', () => {
  it('should create stream with version', () => {
    const map = new VersionedStreamMap<string>()
    const stream = map.create('channel-1')

    expect(stream).toBeInstanceOf(AsyncQueue)
    expect(map.get('channel-1')).toBe(stream)
  })

  it('should not delete newer stream when closing older version', () => {
    const map = new VersionedStreamMap<string>()

    // Create first stream
    const stream1 = map.create('channel-1')
    const version1 = map.getVersion('channel-1')

    // Close and recreate (simulating rapid reuse)
    map.close('channel-1', version1)
    const stream2 = map.create('channel-1')

    // Delayed close of old version should NOT delete new stream
    map.close('channel-1', version1)

    expect(map.get('channel-1')).toBe(stream2)
  })

  it('should delete stream when version matches', () => {
    const map = new VersionedStreamMap<string>()

    map.create('channel-1')
    const version = map.getVersion('channel-1')

    map.close('channel-1', version)

    expect(map.get('channel-1')).toBeUndefined()
  })

  it('should call done() on stream when closing', () => {
    const map = new VersionedStreamMap<string>()
    const stream = map.create('channel-1')
    const doneSpy = vi.spyOn(stream, 'done')
    const version = map.getVersion('channel-1')

    map.close('channel-1', version)

    expect(doneSpy).toHaveBeenCalled()
  })
})
```

### Step 4.2: Run test to verify it fails

Run: `cd /Users/jozigila/Code/platform/Claudix && npm test -- --run src/webview/src/transport/__tests__/VersionedStreamMap.spec.ts`

Expected: FAIL - module not found

### Step 4.3: Create VersionedStreamMap

```typescript
// src/webview/src/transport/VersionedStreamMap.ts
import { AsyncQueue } from './AsyncQueue'

interface StreamEntry<T> {
  stream: AsyncQueue<T>
  version: number
}

/**
 * A Map that tracks stream versions to prevent race conditions
 * during rapid channel create/close cycles.
 */
export class VersionedStreamMap<T> {
  private streams = new Map<string, StreamEntry<T>>()
  private nextVersion = 0

  create(channelId: string): AsyncQueue<T> {
    const stream = new AsyncQueue<T>()
    const version = this.nextVersion++

    this.streams.set(channelId, { stream, version })
    return stream
  }

  get(channelId: string): AsyncQueue<T> | undefined {
    return this.streams.get(channelId)?.stream
  }

  getVersion(channelId: string): number | undefined {
    return this.streams.get(channelId)?.version
  }

  /**
   * Close stream only if version matches.
   * Prevents race condition where delayed close deletes newer stream.
   */
  close(channelId: string, version?: number, error?: Error): boolean {
    const entry = this.streams.get(channelId)
    if (!entry) return false

    // If version provided, only close if it matches
    if (version !== undefined && entry.version !== version) {
      return false // Version mismatch - stream was recreated
    }

    if (error) {
      entry.stream.error(error)
    }
    entry.stream.done()
    this.streams.delete(channelId)
    return true
  }

  has(channelId: string): boolean {
    return this.streams.has(channelId)
  }

  clear(): void {
    for (const entry of this.streams.values()) {
      entry.stream.done()
    }
    this.streams.clear()
  }
}
```

### Step 4.4: Run test to verify it passes

Run: `cd /Users/jozigila/Code/platform/Claudix && npm test -- --run src/webview/src/transport/__tests__/VersionedStreamMap.spec.ts`

Expected: PASS

### Step 4.5: Update BaseTransport to use VersionedStreamMap

Modify `src/webview/src/transport/BaseTransport.ts`:

```typescript
import { VersionedStreamMap } from './VersionedStreamMap'

// Replace streams Map with VersionedStreamMap
protected readonly streams = new VersionedStreamMap<StreamMessage>()

// Update launchClaude or stream creation
protected createStream(channelId: string): AsyncQueue<StreamMessage> {
  return this.streams.create(channelId)
}

// Update close_channel handler - REMOVE setTimeout
case 'close_channel': {
  const version = this.streams.getVersion(message.channelId)
  const error = message.error ? new Error(message.error) : undefined

  // Synchronous cleanup - version check prevents race condition
  this.streams.close(message.channelId, version, error)
  break
}
```

### Step 4.6: Commit

```bash
git add src/webview/src/transport/VersionedStreamMap.ts \
        src/webview/src/transport/__tests__/VersionedStreamMap.spec.ts \
        src/webview/src/transport/BaseTransport.ts
git commit -m "feat(005): fix stream cleanup race condition

- Create VersionedStreamMap for version-tracked streams
- Remove 50ms setTimeout hack from close_channel
- Version check prevents deleting recreated streams
- Synchronous cleanup is safe with versioning
- Fixes race condition (ISSUE-005)"
```

---

## Task 5: Fix Session Dispose Incomplete (ISSUE-004)

**Problem:** Session.dispose() doesn't clean up all resources - memory leaks.

**Solution:** Implement comprehensive cleanup using effectScope pattern.

**Files:**
- Modify: `src/webview/src/core/Session.ts`
- Test: `src/webview/src/core/__tests__/Session.spec.ts`

### Step 5.1: Add disposal test

```typescript
// src/webview/src/core/__tests__/Session.spec.ts
// Add to existing test file or create new

describe('Session disposal', () => {
  it('should interrupt active operation on dispose', async () => {
    const session = createTestSession()
    const interruptSpy = vi.spyOn(session, 'interrupt')

    // Simulate active channel
    session['claudeChannelId'].value = 'active-channel'

    session.dispose()

    expect(interruptSpy).toHaveBeenCalled()
  })

  it('should clean up effect scope on dispose', () => {
    const session = createTestSession()
    const scopeStopSpy = vi.spyOn(session['scope'], 'stop')

    session.dispose()

    expect(scopeStopSpy).toHaveBeenCalled()
  })

  it('should clear all signals on dispose', () => {
    const session = createTestSession()
    session['messages'].value = [{ id: '1', content: 'test' }]
    session['error'].value = new Error('test')

    session.dispose()

    expect(session['messages'].value).toEqual([])
    expect(session['error'].value).toBeUndefined()
    expect(session['claudeChannelId'].value).toBeUndefined()
  })

  it('should prevent double disposal', () => {
    const session = createTestSession()

    session.dispose()
    session.dispose() // Should not throw

    expect(session['disposed']).toBe(true)
  })
})
```

### Step 5.2: Update Session.ts with proper disposal

Modify `src/webview/src/core/Session.ts`:

```typescript
import { effectScope, type EffectScope } from 'vue' // or alien-signals equivalent

export class Session {
  private scope: EffectScope
  private disposed = false

  constructor(/* ... */) {
    // Create effect scope for tracking reactive effects
    this.scope = effectScope()

    // Run all effects within scope
    this.scope.run(() => {
      this.effectCleanup = effect(() => {
        this.selection(this.context.currentSelection())
      })

      // Add other effects here...
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    // 1. Interrupt any active operation
    if (this.claudeChannelId()) {
      void this.interrupt().catch(() => {
        // Ignore interrupt errors during disposal
      })
    }

    // 2. Stop all effects in scope (replaces manual effectCleanup)
    this.scope.stop()

    // 3. Cancel pending connection promise
    if (this.connectionAbortController) {
      this.connectionAbortController.abort()
      this.connectionAbortController = undefined
    }

    // 4. Dispose streaming controller
    this.streamingController.dispose()

    // 5. Clear all signals to release references
    this.messages([])
    this.claudeChannelId(undefined)
    this.error(undefined)
    this.connection(undefined)
    this.currentConnectionPromise = undefined

    // 6. Clear any cached data
    this.context = undefined as any
  }

  // Add AbortController for connection cancellation
  private connectionAbortController?: AbortController

  async connect(): Promise<void> {
    this.connectionAbortController = new AbortController()

    try {
      this.currentConnectionPromise = this.doConnect(
        this.connectionAbortController.signal
      )
      await this.currentConnectionPromise
    } finally {
      this.connectionAbortController = undefined
    }
  }
}
```

### Step 5.3: Run tests

Run: `cd /Users/jozigila/Code/platform/Claudix && npm test -- --run src/webview/src/core/__tests__/Session.spec.ts`

Expected: PASS

### Step 5.4: Commit

```bash
git add src/webview/src/core/Session.ts \
        src/webview/src/core/__tests__/Session.spec.ts
git commit -m "feat(004): implement comprehensive Session disposal

- Use effectScope for collective effect cleanup
- Interrupt active operations on dispose
- Cancel pending connections with AbortController
- Clear all signals to release references
- Add disposed flag to prevent double disposal
- Fixes memory leak (ISSUE-004)"
```

---

## Task 6: Improve AsyncStream Error Message (ISSUE-006)

**Problem:** AsyncStream throws cryptic error on second iteration.

**Solution:** Add clear error message and documentation.

**Files:**
- Modify: `src/services/claude/transport/AsyncStream.ts`
- Test: `src/services/claude/transport/__tests__/AsyncStream.spec.ts`

### Step 6.1: Add test for improved error message

```typescript
// src/services/claude/transport/__tests__/AsyncStream.spec.ts
describe('AsyncStream single iteration', () => {
  it('should throw descriptive error on second iteration', async () => {
    const stream = new AsyncStream<string>()
    stream.enqueue('value')
    stream.done()

    // First iteration - works
    for await (const _ of stream) {}

    // Second iteration - should throw with helpful message
    try {
      for await (const _ of stream) {}
      expect.fail('Should have thrown')
    } catch (e) {
      expect((e as Error).message).toContain('only be iterated once')
      expect((e as Error).message).toContain('collect them into an array')
    }
  })

  it('should indicate stream is exhausted', () => {
    const stream = new AsyncStream<string>()
    stream.done()

    expect(stream.isExhausted).toBe(true)
  })
})
```

### Step 6.2: Update AsyncStream with better error and docs

Modify `src/services/claude/transport/AsyncStream.ts`:

```typescript
/**
 * AsyncStream - Single-use async iterator for producer/consumer patterns.
 *
 * IMPORTANT: This stream can only be iterated ONCE.
 * Once consumed, the values are gone - this is by design for streaming data.
 *
 * Usage:
 * ```typescript
 * const stream = new AsyncStream<string>()
 *
 * // Producer
 * stream.enqueue('value1')
 * stream.enqueue('value2')
 * stream.done()
 *
 * // Consumer (can only iterate once)
 * for await (const value of stream) {
 *   console.log(value)
 * }
 * ```
 *
 * If you need to:
 * - Re-read values: Collect into array during iteration
 * - Share with multiple consumers: Use tee() or buffer pattern
 *
 * @example Collecting values for reuse
 * ```typescript
 * const values: string[] = []
 * for await (const value of stream) {
 *   values.push(value)
 *   process(value)
 * }
 * // Now you can iterate `values` multiple times
 * ```
 */
export class AsyncStream<T> implements AsyncIterable<T>, AsyncIterator<T> {
  private queue: T[] = []
  private readResolve?: (value: IteratorResult<T>) => void
  private readReject?: (error: any) => void
  private isDone = false
  private hasError?: any
  private started = false

  /**
   * Returns true if the stream has been fully consumed.
   */
  get isExhausted(): boolean {
    return this.started && this.isDone && this.queue.length === 0
  }

  /**
   * Implement async iterable protocol.
   * @throws {Error} If stream has already been iterated
   */
  [Symbol.asyncIterator](): AsyncIterator<T> {
    if (this.started) {
      throw new Error(
        'AsyncStream can only be iterated once. ' +
        'If you need to re-read values, collect them into an array during the first iteration: ' +
        '`const values = []; for await (const v of stream) { values.push(v); }`'
      )
    }
    this.started = true
    return this
  }

  // ... rest of implementation unchanged ...
}
```

### Step 6.3: Run tests

Run: `cd /Users/jozigila/Code/platform/Claudix && npm test -- --run src/services/claude/transport/__tests__/AsyncStream.spec.ts`

Expected: PASS

### Step 6.4: Commit

```bash
git add src/services/claude/transport/AsyncStream.ts \
        src/services/claude/transport/__tests__/AsyncStream.spec.ts
git commit -m "docs(006): improve AsyncStream error message

- Add comprehensive JSDoc with usage examples
- Improve error message with solution guidance
- Add isExhausted getter for checking state
- Single-use design is intentional, now documented
- Improves DX (ISSUE-006)"
```

---

## Final Task: Integration Testing

### Step 7.1: Run full test suite

```bash
cd /Users/jozigila/Code/platform/Claudix && npm test
```

Expected: All tests pass

### Step 7.2: Manual integration test

1. **Message Queue (001):**
   - Start conversation, type while Claude responding
   - Verify "1 message(s) queued" appears
   - Verify queued message sends after response

2. **Extension Cleanup (002):**
   - Start conversation
   - "Developer: Reload Window"
   - Check no orphan processes: `ps aux | grep -i claude`

3. **Request Timeouts (003):**
   - Disconnect network mid-request
   - Verify error appears within 30 seconds (not hang forever)

4. **Stream Race (005):**
   - Rapidly create/close conversations
   - Verify no "Missing stream" errors in console

5. **Session Disposal (004):**
   - Open DevTools, Memory tab
   - Create 10 sessions, dispose all
   - Force GC, verify memory released

6. **AsyncStream Error (006):**
   - (Developer test) Verify error message is helpful

### Step 7.3: Final commit

```bash
git add -A
git commit -m "test: add integration test checklist for critical fixes

Closes ISSUE-001, ISSUE-002, ISSUE-003, ISSUE-004, ISSUE-005, ISSUE-006"
```

---

## Summary

| Task | Issue | Key Pattern Used |
|------|-------|------------------|
| 1 | Message Queue | Vue composable + watch |
| 2 | Extension Cleanup | VSCode subscriptions + shutdown() |
| 3 | Request Timeout | AbortSignal.timeout() |
| 4 | Stream Race | Versioned cleanup (no setTimeout) |
| 5 | Session Dispose | effectScope + AbortController |
| 6 | AsyncStream Error | Better DX documentation |

**Total Tasks:** 6 features, ~25 bite-sized steps
**Estimated Commits:** 7
