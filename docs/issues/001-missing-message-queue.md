# ISSUE-001: Missing Message Queue While Responding

**Severity:** Critical
**Category:** UX/Data Loss
**Status:** Confirmed

## Location

- [ChatInputBox.vue:648-669](../../src/webview/src/components/ChatInputBox.vue#L648-L669)
- [ChatPage.vue:62-72](../../src/webview/src/pages/ChatPage.vue#L62-L72)

## Description

When user sends a message while Claude is responding (`busy === true`), the message is **silently lost**.

## Root Cause

1. `ChatInputBox.vue` emits `queueMessage` when `conversationWorking` is true (line 653)
2. `ChatPage.vue` binds `:conversation-working="isBusy"` (line 65)
3. `ChatPage.vue` has NO `@queue-message` handler - only `@submit`
4. The emit goes nowhere - message discarded

## Evidence

```typescript
// ChatInputBox.vue:648-657
function handleSubmit() {
  if (!content.value.trim()) return

  if (props.conversationWorking) {
    emit('queueMessage', content.value)  // EMITTED BUT NEVER HANDLED
  } else {
    emit('submit', content.value)
  }
  // Input cleared regardless...
}
```

```vue
<!-- ChatPage.vue:62-72 - missing handler -->
<ChatInputBox
  :conversation-working="isBusy"
  @submit="handleSubmit"
  @stop="handleStop"
  <!-- NO @queue-message="..." handler! -->
/>
```

## User Impact

- User types message while Claude is responding
- Hits Enter
- Input clears (appears to send)
- Message never delivered
- User unaware message was lost

## Fix Required

### 1. Add queue state to ChatPage.vue

```typescript
const pendingMessages = ref<string[]>([]);
```

### 2. Handle queueMessage event

```vue
<ChatInputBox
  :conversation-working="isBusy"
  @submit="handleSubmit"
  @queue-message="handleQueueMessage"
  @stop="handleStop"
/>
```

```typescript
function handleQueueMessage(content: string) {
  pendingMessages.value.push(content);
  // Show toast: "Message queued"
}
```

### 3. Process queue when response completes

```typescript
watch(isBusy, async (busy) => {
  if (!busy && pendingMessages.value.length > 0) {
    const nextMessage = pendingMessages.value.shift();
    if (nextMessage) {
      await handleSubmit(nextMessage);
    }
  }
});
```

### 4. Add UI indicator

Show queued message count in input area or toolbar.

## Testing

1. Start a conversation
2. While Claude is responding, type another message
3. Press Enter
4. Verify message appears in queue indicator
5. When response completes, verify queued message is sent
