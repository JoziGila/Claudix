# ISSUE-005: Stream Cleanup with setTimeout Race Condition

**Severity:** High
**Category:** Race Condition
**Status:** Confirmed

## Location

- [BaseTransport.ts:270-272](../../src/webview/src/transport/BaseTransport.ts#L270-L272)

## Description

Streams are deleted with a 50ms delay, creating potential race conditions.

## Evidence

```typescript
case "close_channel": {
  const stream = this.streams.get(message.channelId);
  if (stream) {
    if (message.error) stream.error(new Error(message.error));
    stream.done();
    // Delay deletion by 50ms
    setTimeout(() => {
      this.streams.delete(message.channelId);
    }, 50);
  } else {
    this.streams.delete(message.channelId);
  }
  break;
}
```

## The Comment Explains Intent

```typescript
// 延迟删除，给尾部 io_message/result 留出时间片
// (Delay deletion to give trailing io_message/result time to arrive)
```

## Problems

### 1. Race with New Channel Same ID

```
T+0ms:  close_channel for "abc123"
T+10ms: launchClaude creates new channel "abc123" (Math.random collision or reuse)
T+50ms: setTimeout fires, deletes the NEW stream!
```

### 2. Rapid Channel Creation/Destruction

```
Loop: create channel, send message, close channel
Result: Many setTimeout callbacks queued, streams Map grows during delay
```

### 3. Memory Pressure

Under load, 50ms * N channels = significant memory held unnecessarily.

## Fix Options

### Option 1: Synchronous Cleanup (Recommended)

The 50ms delay is a workaround for message ordering. Fix the ordering instead:

```typescript
case "close_channel": {
  const stream = this.streams.get(message.channelId);
  if (stream) {
    if (message.error) stream.error(new Error(message.error));
    stream.done();
    this.streams.delete(message.channelId);  // Immediate
  }
  break;
}
```

Ensure SDK sends `close_channel` AFTER all `io_message` events.

### Option 2: Reference Counting

```typescript
interface StreamEntry {
  stream: AsyncQueue<any>;
  refCount: number;
  closeRequested: boolean;
}

private streams = new Map<string, StreamEntry>();

case "close_channel": {
  const entry = this.streams.get(message.channelId);
  if (entry) {
    entry.closeRequested = true;
    if (entry.refCount === 0) {
      entry.stream.done();
      this.streams.delete(message.channelId);
    }
    // Otherwise, deletion happens when refCount hits 0
  }
}
```

### Option 3: Versioned Channels

```typescript
// Include version in channel ID
const channelId = `${baseId}_${Date.now()}`;

// Or track generation
interface StreamEntry {
  stream: AsyncQueue<any>;
  generation: number;
}

// On close, check generation matches before deleting
```

### Option 4: WeakRef (if streams can be GC'd)

```typescript
private streams = new Map<string, WeakRef<AsyncQueue<any>>>();
```

## Testing

1. Rapidly create/close channels (100 in 1 second)
2. Verify no "Missing stream" warnings
3. Verify memory doesn't grow unbounded
4. Test with artificial latency (simulate slow network)
