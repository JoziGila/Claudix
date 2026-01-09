# ISSUE-017: Event Emitter Error Swallowing

**Severity:** Low
**Category:** Error Handling
**Status:** Confirmed

## Location

- [events.ts:31-40](../../src/webview/src/utils/events.ts#L31-L40)

## Description

EventEmitter catches and logs errors in callbacks, preventing upstream handling.

## Evidence

```typescript
emit(data: T): void {
  for (const callback of this.listeners) {
    try {
      callback(data);
    } catch (error) {
      console.error('[EventEmitter] Callback error:', error);
      // Error swallowed - other listeners continue
    }
  }
}
```

## Analysis

### Good Aspects

- **Fault isolation** - One bad callback doesn't break others
- **Resilience** - Event loop continues
- **Explicit logging** - Errors aren't silent

### Problems

- **No upstream notification** - Caller doesn't know callbacks failed
- **Lost context** - Error message doesn't include which listener
- **No recovery** - Can't retry or handle error

## Comparison with Other Libraries

### Node.js EventEmitter

```javascript
// Throws by default, but catches with 'error' event
emitter.on('error', (err) => console.error(err));
emitter.emit('someEvent'); // If listener throws, goes to 'error' handler
```

### RxJS

```javascript
// Errors propagate to error handler
observable.subscribe({
  next: (val) => { /* may throw */ },
  error: (err) => { /* catches throws from next */ }
});
```

## Fix Options

### Option 1: Error Callback

```typescript
interface EventEmitterOptions {
  onError?: (error: unknown, event: T) => void;
}

class EventEmitter<T> {
  private onError?: (error: unknown, event: T) => void;

  constructor(options?: EventEmitterOptions) {
    this.onError = options?.onError;
  }

  emit(data: T): void {
    for (const callback of this.listeners) {
      try {
        callback(data);
      } catch (error) {
        if (this.onError) {
          this.onError(error, data);
        } else {
          console.error('[EventEmitter] Callback error:', error);
        }
      }
    }
  }
}
```

### Option 2: Return Errors

```typescript
emit(data: T): Error[] {
  const errors: Error[] = [];
  for (const callback of this.listeners) {
    try {
      callback(data);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  return errors;
}

// Usage
const errors = emitter.emit(data);
if (errors.length > 0) {
  // Handle errors
}
```

### Option 3: Async with Error Collection

```typescript
async emitAsync(data: T): Promise<{ errors: Error[] }> {
  const errors: Error[] = [];
  for (const callback of this.listeners) {
    try {
      await callback(data);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  return { errors };
}
```

### Option 4: Better Logging

```typescript
emit(data: T): void {
  for (const [index, callback] of this.listeners.entries()) {
    try {
      callback(data);
    } catch (error) {
      console.error(`[EventEmitter] Listener ${index} threw:`, {
        error,
        eventData: data,
        listener: callback.name || 'anonymous'
      });
    }
  }
}
```

## Recommended

For this codebase, **Option 4** (better logging) is sufficient. The current behavior is acceptable for resilience, just needs better diagnostics.

## Testing

1. Add listener that throws
2. Emit event
3. Verify other listeners still called
4. Verify error logged with useful info
