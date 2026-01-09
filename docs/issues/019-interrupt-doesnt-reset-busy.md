# ISSUE-019: Interrupt Doesn't Reset Busy State (FREEZE BUG)

**Severity:** Critical
**Category:** UX/Reliability
**Status:** Confirmed - Root Cause Found

## Symptom

Extension freezes in "responding" state. Stop button doesn't work - clicking it does nothing visible.

## Root Cause

The `interrupt()` method sends an interrupt signal but **does not reset `busy(false)`**. It relies entirely on the SDK sending a `result` event, which may never arrive.

## Evidence

### Session.interrupt() - No State Reset

```typescript
// Session.ts:323-330
async interrupt(): Promise<void> {
  const channelId = this.claudeChannelId();
  if (!channelId) {
    return;
  }
  const connection = await this.getConnection();
  connection.interruptClaude(channelId);
  // NO busy(false) here!
  // NO stream cleanup here!
  // Just fires and forgets
}
```

### busy(false) Only Set in 4 Places

```typescript
// Line 281 - send() error
catch (error) {
  this.busy(false);
  throw error;
}

// Line 335 - restartClaude() explicit
this.busy(false);

// Line 434 - readMessages() error
catch (error) {
  this.busy(false);
}

// Line 470 - result event received
} else if (event?.type === 'result') {
  this.busy(false);  // ONLY WAY TO STOP NORMALLY
}
```

### readMessages() Blocks Forever

```typescript
// Session.ts:427-437
private async readMessages(stream: AsyncIterable<any>): Promise<void> {
  try {
    for await (const event of stream) {  // BLOCKS HERE
      this.processIncomingMessage(event);
    }
  } catch (error) {
    this.busy(false);
  } finally {
    this.claudeChannelId(undefined);
    // NO busy(false) in finally!
  }
}
```

## The Failure Sequence

```
1. User sends message
2. busy(true) set
3. readMessages() starts for-await loop
4. User clicks Stop
5. interrupt() sends interrupt_claude message
6. Extension calls sdkService.interrupt(query)
7. SDK receives interrupt...

IF SDK RESPONDS:
8a. SDK sends 'result' event
9a. processIncomingMessage sees type === 'result'
10a. busy(false) ✓

IF SDK DOESN'T RESPOND (BUG PATH):
8b. SDK hangs / crashes / network issue
9b. for-await loop still waiting
10b. busy stays true FOREVER
11b. UI frozen, stop button useless
```

## Why Stop Button Seems Dead

The stop button IS working - it sends the interrupt. But:
1. The UI is bound to `busy` signal
2. `busy` is still `true`
3. UI still shows "responding" state
4. User thinks stop didn't work

## Fix Required

### Option 1: Optimistic Reset (Recommended)

```typescript
async interrupt(): Promise<void> {
  const channelId = this.claudeChannelId();
  if (!channelId) {
    return;
  }

  // Optimistically reset state
  this.busy(false);

  // Mark current message as interrupted
  const messages = this.messages();
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.isAssistant?.()) {
    lastMessage.markInterrupted();
  }

  // Then send interrupt
  const connection = await this.getConnection();
  connection.interruptClaude(channelId);

  // Clear channel (stream will end on its own or timeout)
  this.claudeChannelId(undefined);
}
```

### Option 2: Timeout After Interrupt

```typescript
async interrupt(): Promise<void> {
  const channelId = this.claudeChannelId();
  if (!channelId) return;

  const connection = await this.getConnection();
  connection.interruptClaude(channelId);

  // Force reset after timeout if SDK doesn't respond
  setTimeout(() => {
    if (this.busy() && this.claudeChannelId() === channelId) {
      console.warn('[Session] Interrupt timeout - forcing reset');
      this.busy(false);
      this.claudeChannelId(undefined);
    }
  }, 5000);
}
```

### Option 3: Add finally clause

```typescript
private async readMessages(stream: AsyncIterable<any>): Promise<void> {
  try {
    for await (const event of stream) {
      this.processIncomingMessage(event);
    }
  } catch (error) {
    this.error(error instanceof Error ? error.message : String(error));
  } finally {
    // ALWAYS reset busy when stream ends
    this.busy(false);
    this.claudeChannelId(undefined);
  }
}
```

## Additional Issues Found

### 1. Stream Has No Abort Mechanism

The `readMessages` loop has no way to be aborted:
```typescript
for await (const event of stream) {  // No AbortSignal
```

Should use AbortController:
```typescript
private abortController?: AbortController;

async launchClaude() {
  this.abortController = new AbortController();
  void this.readMessages(stream, this.abortController.signal);
}

async interrupt() {
  this.abortController?.abort();
  // ...
}
```

### 2. No Interrupt Acknowledgment

Extension side doesn't confirm interrupt success:
```typescript
// ClaudeAgentService.ts:458-471
async interruptClaude(channelId: string): Promise<void> {
  try {
    await this.sdkService.interrupt(channel.query);
    // Should send acknowledgment back to WebView!
  } catch (error) {
    // Error not propagated to WebView
  }
}
```

## Testing

1. Start a long response (ask for lengthy code)
2. Click Stop while streaming
3. Verify:
   - UI immediately shows "stopped" state
   - Input becomes available
   - Can send new message
4. Test with network disconnect during response
5. Verify recovery works

## Priority

**CRITICAL** - This is the freeze bug users are experiencing.
