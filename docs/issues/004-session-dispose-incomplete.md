# ISSUE-004: Session.dispose() Incomplete

**Severity:** High
**Category:** Memory Leak
**Status:** Confirmed

## Location

- [Session.ts:417-425](../../src/webview/src/core/Session.ts#L417-L425)
- [Session.ts:68](../../src/webview/src/core/Session.ts#L68)

## Description

Session disposal doesn't clean up all resources, leading to memory leaks.

## Evidence

```typescript
// Line 68
private effectCleanup?: () => void;  // May never be set!

// Lines 417-425
dispose(): void {
  if (this.effectCleanup) {
    this.effectCleanup();  // May be undefined
  }
  this.streamingController.dispose();
  // That's it - many resources NOT cleaned up
}
```

## Missing Cleanup

| Resource | Current | Should |
|----------|---------|--------|
| effectCleanup | Optional, may not exist | Always set in constructor |
| claudeChannelId | Not cleared | Set to undefined |
| currentConnectionPromise | Not cancelled | Cancel/reject |
| Active stream | Not interrupted | Call interrupt() |
| Permission listeners | Not removed | Track and remove |
| Signals | Not reset | Reset to initial values |

## Fix Required

```typescript
dispose(): void {
  // 1. Interrupt any active operation
  if (this.claudeChannelId()) {
    void this.interrupt();
  }

  // 2. Clean up effects
  if (this.effectCleanup) {
    this.effectCleanup();
    this.effectCleanup = undefined;
  }

  // 3. Cancel pending connection
  if (this.currentConnectionPromise) {
    // If using AbortController, abort it
    this.currentConnectionPromise = undefined;
  }

  // 4. Dispose streaming controller
  this.streamingController.dispose();

  // 5. Clear signals to release references
  this.messages([]);
  this.claudeChannelId(undefined);
  this.error(undefined);
  this.connection(undefined);

  // 6. Remove permission listeners
  // (Need to track listener cleanup functions)
}
```

## Also Need to Fix Constructor

```typescript
constructor(...) {
  // ... existing code ...

  // Store effect cleanup (currently not stored!)
  this.effectCleanup = effect(() => {
    this.selection(this.context.currentSelection());
  });
}
```

## Related: SessionStore.dispose()

```typescript
// SessionStore.ts:178-189 - Good example
dispose(): void {
  // Clean up all effects
  for (const cleanup of this.effectCleanups) {
    cleanup();
  }
  this.effectCleanups = [];

  // Clean up all sessions
  for (const session of this.sessions()) {
    session.dispose();  // Calls our incomplete dispose()
  }
}
```

## Testing

1. Create multiple sessions
2. Check memory usage (Chrome DevTools)
3. Dispose sessions
4. Run GC
5. Verify memory released
6. Check for detached DOM nodes
