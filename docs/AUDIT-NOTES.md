# Claudix Code Audit Notes

## Confirmed Issues

### 1. Missing Message Queue While Responding (CRITICAL)

**Location:**
- [ChatInputBox.vue:648-669](src/webview/src/components/ChatInputBox.vue#L648-L669)
- [ChatPage.vue:62-72](src/webview/src/pages/ChatPage.vue#L62-L72)

**Problem:**
When user sends a message while Claude is responding (`busy === true`), the message is **silently lost**.

**Root Cause:**
1. `ChatInputBox.vue` emits `queueMessage` when `conversationWorking` is true (line 653)
2. `ChatPage.vue` binds `:conversation-working="isBusy"` (line 65)
3. **But `ChatPage.vue` has no `@queue-message` handler** - only `@submit`
4. The emit goes nowhere - message lost

**Evidence:**
```vue
<!-- ChatInputBox.vue line 648-657 -->
function handleSubmit() {
  if (!content.value.trim()) return

  if (props.conversationWorking) {
    emit('queueMessage', content.value)  // <-- EMITTED BUT NEVER HANDLED
  } else {
    emit('submit', content.value)
  }
  // ...
}
```

```vue
<!-- ChatPage.vue line 62-72 -->
<ChatInputBox
  :conversation-working="isBusy"
  @submit="handleSubmit"    <!-- only submit handled -->
  @stop="handleStop"
  <!-- NO @queue-message handler! -->
/>
```

**Fix Required:**
1. Add a message queue in Session or ChatPage
2. Handle `@queue-message` event in ChatPage.vue
3. Process queued messages when `busy` becomes false

---

## Potential Issues (To Investigate)

### 2. Extension Deactivation Empty
**Location:** [extension.ts:130-132](src/extension.ts#L130-L132)

```typescript
export function deactivate() {
  // Clean up resources  <-- TODO: Nothing actually cleaned up
}
```

No cleanup of:
- ClaudeAgentService channels
- Transport connections
- Subscriptions

### 3. AsyncStream Single Iteration
**Location:** [AsyncStream.ts:32-38](src/services/claude/transport/AsyncStream.ts#L32-L38)

```typescript
[Symbol.asyncIterator](): AsyncIterator<T> {
  if (this.started) {
    throw new Error("Stream can only be iterated once");  // Could cause issues
  }
  this.started = true;
  return this;
}
```

If misused (attempt to re-iterate), throws cryptic error.

### 4. Outstanding Requests Never Timeout
**Location:** [ClaudeAgentService.ts:200-201](src/services/claude/ClaudeAgentService.ts#L200-L201)

```typescript
private outstandingRequests = new Map<string, RequestHandler>();
```

Requests are stored but never timeout. If WebView closes or response never comes, promise hangs forever.

### 5. Session.dispose() Incomplete
**Location:** [Session.ts:417-425](src/webview/src/core/Session.ts#L417-L425)

```typescript
dispose(): void {
  if (this.effectCleanup) {
    this.effectCleanup();  // effectCleanup may not be set
  }
  this.streamingController.dispose();
  // Missing: connection cleanup, stream cleanup, signal cleanup
}
```

### 6. ID Generation Not Cryptographically Secure
**Location:** [ClaudeAgentService.ts:837-839](src/services/claude/ClaudeAgentService.ts#L837-L839)

```typescript
private generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}
```

Using `Math.random()` for IDs - not suitable for security-sensitive contexts.

### 7. Stream Cleanup with setTimeout Delay
**Location:** [BaseTransport.ts:270-272](src/webview/src/transport/BaseTransport.ts#L270-L272)

```typescript
setTimeout(() => {
  this.streams.delete(message.channelId);
}, 50);
```

50ms delay before cleanup - potential race condition or memory leak if many channels created/destroyed rapidly.

### 8. CSP Includes unsafe-eval
**Location:** [webViewService.ts:296](src/services/webViewService.ts#L296)

```typescript
`script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval' blob:;`,
```

Required for Mermaid but opens XSS surface. Document and consider alternatives.

---

## Architecture Observations

### Good Patterns
- DI system (from VSCode) - well-tested, proper lifecycle
- Typed message protocol in `shared/messages.ts`
- StreamingController with cleanup contract
- alien-signals for reactive state

### Concerning Patterns
- Many `any` types in transport/message handling
- Mixed Chinese/English in logging (consistency)
- Some services don't implement IDisposable
- Handler context passed by reference (mutable)

---

## Audit Checklist

- [ ] Security: CSP hardening
- [ ] Security: Input validation in message handlers
- [ ] Reliability: Message queue implementation
- [ ] Reliability: Request timeouts
- [ ] Reliability: Proper deactivation cleanup
- [ ] Memory: Session disposal completeness
- [ ] Memory: Stream lifecycle management
- [ ] Concurrency: Race condition in channel management
- [ ] Types: Reduce `any` usage
- [ ] Architecture: Service lifecycle consistency
