# Runtime Stability Fixes Design

**Date:** 2025-01-09
**Status:** Ready for Implementation

## Overview

This document outlines fixes for 9 runtime stability issues discovered during deep analysis of the Claudix VSCode extension.

## Critical Fixes

### 1. Sidebar WebView Memory Leak

**File:** `src/services/webViewService.ts:94-100`

**Problem:** Sidebar webview never removed from `this.webviews` Set on dispose, causing memory leak and silent failures.

**Solution:** Capture webview reference and clean up on dispose (matching editor panel pattern).

```typescript
// In resolveWebviewView()
public resolveWebviewView(webviewView: vscode.WebviewView, ...): void {
    this.registerWebview(webviewView.webview, {
        host: 'sidebar',
        page: 'chat'
    });

    // Capture reference for cleanup closure
    const webviewRef = webviewView.webview;
    webviewView.onDidDispose(
        () => {
            this.webviews.delete(webviewRef);
            this.webviewConfigs.delete(webviewRef);
            this.logService.info('侧边栏 WebView 视图已销毁');
        },
        undefined,
        this.context.subscriptions
    );
}
```

**Source:** [Avoiding Memory Leaks in VS Editor Extensions](https://devblogs.microsoft.com/visualstudio/avoiding-memory-leaks-in-visual-studio-editor-extensions/)

---

### 2. Single-Use Stream for Persistent Loop

**File:** `src/services/claude/ClaudeAgentService.ts:199`

**Problem:** `fromClientStream` is an AsyncStream (single-use by design) but used for the main message loop. If it errors, the loop stops permanently.

**Solution:** Replace with a resilient message queue that can be recreated on error.

```typescript
// New: ResilientMessageQueue class
export class ResilientMessageQueue<T> {
    private queue: T[] = [];
    private waitingResolve?: (value: T) => void;
    private closed = false;

    enqueue(value: T): void {
        if (this.closed) return;

        if (this.waitingResolve) {
            const resolve = this.waitingResolve;
            this.waitingResolve = undefined;
            resolve(value);
        } else {
            this.queue.push(value);
        }
    }

    async dequeue(): Promise<T | null> {
        if (this.closed) return null;

        if (this.queue.length > 0) {
            return this.queue.shift()!;
        }

        return new Promise<T | null>((resolve) => {
            this.waitingResolve = resolve as (value: T) => void;
        });
    }

    close(): void {
        this.closed = true;
        if (this.waitingResolve) {
            this.waitingResolve(null as any);
        }
    }

    // Can be reset for restart
    reset(): void {
        this.closed = false;
        this.queue = [];
        this.waitingResolve = undefined;
    }
}

// In ClaudeAgentService
private messageQueue = new ResilientMessageQueue<WebViewToExtensionMessage>();

// Replace readFromClient with restartable loop
private async readFromClient(): Promise<void> {
    while (true) {
        try {
            const message = await this.messageQueue.dequeue();
            if (message === null) break; // Queue closed

            await this.processMessage(message);
        } catch (error) {
            this.logService.error(`[ClaudeAgentService] Error processing message: ${error}`);
            // Continue processing - don't break the loop
        }
    }
}
```

**Source:** [Message Queueing in JavaScript and TypeScript](https://softwarepatternslexicon.com/patterns-js/6/1/2/)

---

### 3. Fire-and-Forget Message Loop

**File:** `src/services/claude/ClaudeAgentService.ts:406-434`

**Problem:** SDK message forwarding runs in detached async IIFE with no recovery mechanism.

**Solution:** Track the loop promise and implement restart on error with exponential backoff.

```typescript
// Track active forwarding loops
private forwardingLoops = new Map<string, { promise: Promise<void>; abort: AbortController }>();

// In launchClaude, replace IIFE with tracked loop
private startMessageForwarding(channelId: string, query: Query): void {
    const abortController = new AbortController();

    const forwardingPromise = this.runMessageForwardingLoop(
        channelId,
        query,
        abortController.signal
    );

    this.forwardingLoops.set(channelId, {
        promise: forwardingPromise,
        abort: abortController
    });

    // Clean up when done
    forwardingPromise.finally(() => {
        this.forwardingLoops.delete(channelId);
    });
}

private async runMessageForwardingLoop(
    channelId: string,
    query: Query,
    signal: AbortSignal
): Promise<void> {
    let messageCount = 0;

    try {
        for await (const message of query) {
            if (signal.aborted) break;

            messageCount++;
            this.logService.info(`← Message #${messageCount}: ${message.type}`);

            this.transport?.send({
                type: "io_message",
                channelId,
                message,
                done: false
            });
        }

        this.closeChannel(channelId, true);
    } catch (error) {
        if (!signal.aborted) {
            this.logService.error(`Message forwarding error: ${error}`);
            this.closeChannel(channelId, true, String(error));
        }
    }
}
```

**Source:** [AbortController: The Art of Graceful Cancellation](https://mahmudul.dev/posts/abort-controller-guide/)

---

## High Priority Fixes

### 4. Non-null Assertions on Transport

**Files:** `ClaudeAgentService.ts:415, 591, 793`

**Problem:** `this.transport!.send()` will throw if transport not set.

**Solution:** Add guard checks with clear error messages.

```typescript
// Add helper method
private ensureTransport(): ITransport {
    if (!this.transport) {
        throw new Error('[ClaudeAgentService] Transport not initialized. Call setTransport() first.');
    }
    return this.transport;
}

// Replace all this.transport!.send() with:
this.ensureTransport().send({ ... });
```

---

### 5. closeAllChannels Doesn't Wait

**File:** `src/services/claude/ClaudeAgentService.ts:539-556`

**Problem:** `closeChannel` returns void, so `Promise.all(promises)` resolves immediately.

**Solution:** Make `closeChannel` async and return a Promise.

```typescript
// Change signature
async closeChannel(channelId: string, sendNotification: boolean, error?: string): Promise<void> {
    this.logService.info(`[ClaudeAgentService] 关闭 Channel: ${channelId}`);

    // 1. Abort any active forwarding loop
    const forwardingLoop = this.forwardingLoops.get(channelId);
    if (forwardingLoop) {
        forwardingLoop.abort.abort();
        await forwardingLoop.promise.catch(() => {}); // Wait for cleanup
    }

    // 2. Send close notification
    if (sendNotification && this.transport) {
        this.transport.send({
            type: "close_channel",
            channelId,
            error
        });
    }

    // 3. Clean up channel
    const channel = this.channels.get(channelId);
    if (channel) {
        channel.in.done();
        try {
            await channel.query.return?.();
        } catch (e) {
            this.logService.warn(`Error cleaning up channel: ${e}`);
        }
        this.channels.delete(channelId);
    }

    this.logService.info(`✓ Channel closed, ${this.channels.size} remaining`);
}

// closeAllChannels now correctly waits
async closeAllChannels(): Promise<void> {
    const closePromises = Array.from(this.channels.keys()).map(
        channelId => this.closeChannel(channelId, false)
    );
    await Promise.all(closePromises);
    this.channels.clear();
}
```

**Source:** [Anatomy of Graceful Shutdown](https://mrlokans.work/posts/anatomy-of-graceful-shutdown-part-5/)

---

### 6. Session File Stat Race Condition

**File:** `src/services/claude/ClaudeSessionService.ts:245-251`

**Problem:** If a file is deleted between readdir and stat, entire Promise.all fails.

**Solution:** Use `Promise.allSettled` and filter out failed stats.

```typescript
// Replace Promise.all with Promise.allSettled
const fileStatsResults = await Promise.allSettled(
    files.map(async file => {
        const filePath = path.join(projectDir, file);
        const stat = await fs.stat(filePath);
        return { name: filePath, stat };
    })
);

// Filter out failed stats
const fileStats = fileStatsResults
    .filter((result): result is PromiseFulfilledResult<{name: string, stat: fs.Stats}> =>
        result.status === 'fulfilled'
    )
    .map(result => result.value);

// Log any failures for debugging
fileStatsResults
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .forEach(result => {
        this.logService.warn(`[ClaudeSessionService] Failed to stat file: ${result.reason}`);
    });
```

---

## Medium Priority Fixes

### 7. Silent Message Dropping

**File:** `src/services/webViewService.ts:122-125`

**Problem:** When no webviews exist, messages are logged but dropped silently.

**Solution:** Add message buffering with confirmation callback pattern.

```typescript
// Add message buffer for undelivered messages
private pendingMessages: any[] = [];
private readonly MAX_PENDING = 100;

postMessage(message: any): boolean {
    if (this.webviews.size === 0) {
        // Buffer message for when webview connects
        if (this.pendingMessages.length < this.MAX_PENDING) {
            this.pendingMessages.push(message);
            this.logService.warn(`[WebViewService] No webviews - message buffered (${this.pendingMessages.length})`);
        } else {
            this.logService.error('[WebViewService] Message buffer full - dropping message');
        }
        return false;
    }

    // ... existing send logic ...
    return true;
}

// Flush pending when webview connects
private registerWebview(webview: vscode.Webview, bootstrap: WebviewBootstrapConfig): void {
    // ... existing code ...

    // Flush any pending messages after registration
    if (bootstrap.page === 'chat' && this.pendingMessages.length > 0) {
        this.logService.info(`[WebViewService] Flushing ${this.pendingMessages.length} pending messages`);
        const pending = this.pendingMessages;
        this.pendingMessages = [];
        pending.forEach(msg => this.postMessage(msg));
    }
}
```

**Source:** [VSCode Webview API - postMessage](https://code.visualstudio.com/api/extension-guides/webview)

---

### 8. Single Transport Callback

**File:** `src/services/claude/transport/BaseTransport.ts:55`

**Problem:** Only one onMessage callback supported - subsequent calls silently replace.

**Solution:** Support multiple callbacks with Set.

```typescript
export abstract class BaseTransport implements ITransport {
    protected messageCallbacks = new Set<(message: any) => void>();

    abstract send(message: any): void;

    onMessage(callback: (message: any) => void): () => void {
        this.messageCallbacks.add(callback);
        // Return unsubscribe function
        return () => this.messageCallbacks.delete(callback);
    }

    protected triggerMessage(message: any): void {
        for (const callback of this.messageCallbacks) {
            try {
                callback(message);
            } catch (error) {
                console.error('[BaseTransport] Callback error:', error);
            }
        }
    }
}
```

---

### 9. Silent JSONL Errors

**File:** `src/services/claude/ClaudeSessionService.ts:285`

**Problem:** Corrupted JSONL files fail silently (empty catch).

**Solution:** Log errors with file context.

```typescript
// Replace empty catch with logging
} catch (error) {
    this.logService.warn(
        `[ClaudeSessionService] Error reading session file ${file.name}: ${error}`
    );
}
```

---

## Implementation Order

1. **Critical** (do first):
   - Fix #1: Sidebar WebView leak (5 min)
   - Fix #2: Resilient message queue (30 min)
   - Fix #3: Tracked forwarding loops (20 min)

2. **High Priority** (do next):
   - Fix #4: Transport guards (5 min)
   - Fix #5: Async closeChannel (15 min)
   - Fix #6: Promise.allSettled (5 min)

3. **Medium Priority** (when time permits):
   - Fix #7: Message buffering (15 min)
   - Fix #8: Multiple callbacks (10 min)
   - Fix #9: JSONL error logging (2 min)

## Testing Strategy

1. **Memory Leak Testing:**
   - Open/close sidebar multiple times
   - Monitor extension host memory in Process Explorer
   - Verify webviews Set size doesn't grow

2. **Error Recovery Testing:**
   - Simulate network interruption during Claude response
   - Verify message loop restarts automatically
   - Check no messages are lost

3. **Cleanup Testing:**
   - Disable extension during active conversation
   - Verify all channels close cleanly
   - Check no hanging promises

## Sources

- [Avoiding Memory Leaks in VS Editor Extensions](https://devblogs.microsoft.com/visualstudio/avoiding-memory-leaks-in-visual-studio-editor-extensions/)
- [VSCode Patterns and Principles](https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/)
- [Message Queueing in JavaScript and TypeScript](https://softwarepatternslexicon.com/patterns-js/6/1/2/)
- [AbortController: The Art of Graceful Cancellation](https://mahmudul.dev/posts/abort-controller-guide/)
- [Anatomy of Graceful Shutdown](https://mrlokans.work/posts/anatomy-of-graceful-shutdown-part-5/)
- [ts-retry-promise](https://typescript.tv/best-practices/resilient-api-calls-with-ts-retry-promise/)
- [VSCode Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Vue Composables Best Practice](https://vueuse.org/guide/best-practice)
