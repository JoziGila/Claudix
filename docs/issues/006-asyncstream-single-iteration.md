# ISSUE-006: AsyncStream Single Iteration Limitation

**Severity:** Medium
**Category:** API Design
**Status:** Confirmed

## Location

- [AsyncStream.ts:32-38](../../src/services/claude/transport/AsyncStream.ts#L32-L38)

## Description

AsyncStream throws a cryptic error if iterated more than once.

## Evidence

```typescript
/**
 * 实现异步迭代器协议
 */
[Symbol.asyncIterator](): AsyncIterator<T> {
  if (this.started) {
    throw new Error("Stream can only be iterated once");
  }
  this.started = true;
  return this;
}
```

## Current Behavior

```typescript
const stream = new AsyncStream<string>();

// First iteration - works
for await (const msg of stream) { /* ... */ }

// Second iteration - throws
for await (const msg of stream) { /* crashes */ }
// Error: "Stream can only be iterated once"
```

## Impact

1. **Confusing error message** - Doesn't explain WHY or what to do
2. **No replay capability** - Can't re-read stream contents
3. **Debugging difficulty** - Error happens at iteration start, not at cause

## Analysis

This is likely intentional - the stream is a one-way pipe:

```typescript
// Producer pushes values
stream.enqueue("value1");
stream.enqueue("value2");
stream.done();

// Consumer reads once
for await (const v of stream) { }
// Stream is now exhausted
```

But the error message and lack of documentation makes this a footgun.

## Fix Options

### Option 1: Better Error Message

```typescript
[Symbol.asyncIterator](): AsyncIterator<T> {
  if (this.started) {
    throw new Error(
      "AsyncStream can only be iterated once. " +
      "If you need to re-read values, collect them into an array during first iteration."
    );
  }
  this.started = true;
  return this;
}
```

### Option 2: Add Documentation

```typescript
/**
 * AsyncStream - Single-use async iterator
 *
 * IMPORTANT: This stream can only be iterated ONCE.
 * Once consumed, the values are gone.
 *
 * If you need to:
 * - Re-read values: Collect into array during iteration
 * - Share with multiple consumers: Use a broadcasting pattern
 *
 * @example
 * // Correct - single iteration
 * for await (const msg of stream) { process(msg); }
 *
 * // Incorrect - will throw
 * for await (const msg of stream) { }
 * for await (const msg of stream) { } // Error!
 */
```

### Option 3: Allow Reset (Breaking Change)

```typescript
reset(): void {
  if (!this.isDone) {
    throw new Error("Cannot reset active stream");
  }
  this.started = false;
  this.isDone = false;
  this.queue = [];
}
```

### Option 4: Tee Function

```typescript
tee(): [AsyncStream<T>, AsyncStream<T>] {
  if (this.started) {
    throw new Error("Cannot tee a started stream");
  }

  const stream1 = new AsyncStream<T>();
  const stream2 = new AsyncStream<T>();

  (async () => {
    for await (const value of this) {
      stream1.enqueue(value);
      stream2.enqueue(value);
    }
    stream1.done();
    stream2.done();
  })();

  return [stream1, stream2];
}
```

## Recommendation

Implement Option 1 (better error) + Option 2 (documentation). The single-use design is correct for a producer/consumer stream.

## Testing

1. Attempt to iterate stream twice
2. Verify clear error message
3. Document in README/API docs
