# ISSUE-013: Effect Cleanup May Not Be Set

**Severity:** Medium
**Category:** Potential Bug
**Status:** Confirmed

## Location

- [Session.ts:68](../../src/webview/src/core/Session.ts#L68)
- [Session.ts:142-144](../../src/webview/src/core/Session.ts#L142-L144)

## Description

`effectCleanup` is declared but may never be assigned, causing disposal to be incomplete.

## Evidence

### Declaration (Line 68)

```typescript
private effectCleanup?: () => void;  // Optional, may be undefined
```

### Constructor Usage (Lines 142-144)

```typescript
// Effect created but return value NOT stored
effect(() => {
  this.selection(this.context.currentSelection());
});
// Should be: this.effectCleanup = effect(() => { ... });
```

### Disposal (Lines 417-425)

```typescript
dispose(): void {
  if (this.effectCleanup) {  // May be undefined!
    this.effectCleanup();
  }
  this.streamingController.dispose();
}
```

## Impact

1. **Effect continues running** after Session.dispose()
2. **Memory leak** - Effect holds references to session and context
3. **Stale updates** - Selection changes affect disposed session

## alien-signals Effect API

```typescript
// effect() returns a cleanup function
const cleanup = effect(() => {
  // reactive code
});

// Later
cleanup();  // Stops the effect
```

## Fix Required

### Store Effect Cleanup

```typescript
constructor(...) {
  // ... existing code ...

  // Store the cleanup function
  this.effectCleanup = effect(() => {
    this.selection(this.context.currentSelection());
  });
}
```

### If Multiple Effects

```typescript
private effectCleanups: Array<() => void> = [];

constructor(...) {
  // Effect 1
  this.effectCleanups.push(
    effect(() => {
      this.selection(this.context.currentSelection());
    })
  );

  // Effect 2 (if any)
  this.effectCleanups.push(
    effect(() => {
      // another reactive computation
    })
  );
}

dispose(): void {
  // Clean up all effects
  for (const cleanup of this.effectCleanups) {
    cleanup();
  }
  this.effectCleanups = [];

  this.streamingController.dispose();
}
```

## Pattern in SessionStore.ts (Correct)

```typescript
// SessionStore.ts does it correctly
private effectCleanups: Array<() => void> = [];

constructor(...) {
  this.effectCleanups.push(
    effect(() => {
      if (this.connectionManager.connection()) {
        void this.listSessions();
      }
    })
  );
  // ... more effects with push
}

dispose(): void {
  for (const cleanup of this.effectCleanups) {
    cleanup();
  }
  this.effectCleanups = [];
}
```

## Testing

1. Create a Session
2. Verify selection updates work
3. Call dispose()
4. Change context.currentSelection()
5. Verify Session.selection does NOT update (effect stopped)
