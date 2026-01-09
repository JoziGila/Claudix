# ISSUE-012: Permission Listener Leak in SessionStore

**Severity:** Medium
**Category:** Memory Leak
**Status:** Confirmed

## Location

- [SessionStore.ts:191-200](../../src/webview/src/core/SessionStore.ts#L191-L200)

## Description

Permission listeners attached to sessions are never removed.

## Evidence

```typescript
private attachPermissionListener(session: Session): void {
  session.onPermissionRequested((request) => {
    this.permissionRequested.emit({
      session,
      permissionRequest: request
    });
    if (this.activeSession() !== session) {
      this.activeSession(session);
    }
  });
  // Return value (cleanup function) is IGNORED!
}
```

Compare to proper pattern in Session.ts:

```typescript
// Session.ts - returns cleanup function
onPermissionRequested(callback: (request: PermissionRequest) => void): () => void {
  return this.connection()?.permissionRequested.add(callback) ?? (() => {});
}
```

## Impact

1. **Listener accumulation** - Each session.onPermissionRequested adds a listener
2. **Memory growth** - Closures capture references to SessionStore
3. **Zombie listeners** - After session dispose, listener still fires

## Fix Required

### Track Cleanup Functions

```typescript
private permissionListenerCleanups = new Map<Session, () => void>();

private attachPermissionListener(session: Session): void {
  const cleanup = session.onPermissionRequested((request) => {
    this.permissionRequested.emit({
      session,
      permissionRequest: request
    });
    if (this.activeSession() !== session) {
      this.activeSession(session);
    }
  });

  this.permissionListenerCleanups.set(session, cleanup);
}
```

### Clean Up on Session Removal

```typescript
removeSession(session: Session): void {
  // Remove permission listener
  const cleanup = this.permissionListenerCleanups.get(session);
  if (cleanup) {
    cleanup();
    this.permissionListenerCleanups.delete(session);
  }

  // Dispose session
  session.dispose();

  // Remove from list
  this.sessions(this.sessions().filter(s => s !== session));
}
```

### Clean Up in dispose()

```typescript
dispose(): void {
  // Clean up all permission listeners
  for (const cleanup of this.permissionListenerCleanups.values()) {
    cleanup();
  }
  this.permissionListenerCleanups.clear();

  // ... rest of dispose
}
```

## Alternative: WeakMap

If sessions are expected to be GC'd independently:

```typescript
private permissionListenerCleanups = new WeakMap<Session, () => void>();
```

But explicit cleanup is still preferred for deterministic behavior.

## Testing

1. Create 10 sessions
2. Record memory usage
3. Dispose all sessions
4. Force GC
5. Verify memory returned to baseline
6. Check no listeners fire after dispose
