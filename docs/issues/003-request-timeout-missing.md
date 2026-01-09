# ISSUE-003: Outstanding Requests Never Timeout

**Severity:** High
**Category:** Reliability
**Status:** Confirmed

## Location

- [ClaudeAgentService.ts:200-201](../../src/services/claude/ClaudeAgentService.ts#L200-L201)
- [BaseTransport.ts:48](../../src/webview/src/transport/BaseTransport.ts#L48)

## Description

RPC requests are stored in a Map but never timeout. If a response never arrives, the Promise hangs forever.

## Evidence

### Extension Side (ClaudeAgentService.ts)

```typescript
// Line 200-201
private outstandingRequests = new Map<string, RequestHandler>();

// Line 775-796 - sendRequest never times out
protected sendRequest<TRequest, TResponse>(
  channelId: string,
  request: TRequest
): Promise<TResponse> {
  const requestId = this.generateId();

  return new Promise<TResponse>((resolve, reject) => {
    this.outstandingRequests.set(requestId, { resolve, reject });
    this.transport!.send({
      type: "request",
      channelId,
      requestId,
      request
    });
  }).finally(() => {
    this.outstandingRequests.delete(requestId);
  });
  // No timeout!
}
```

### WebView Side (BaseTransport.ts)

```typescript
// Line 48
protected readonly outstandingRequests = new Map<string, RequestHandler>();

// Line 227-244 - also no timeout
protected async sendRequest<TResponse>(
  request: WebViewRequest,
  channelId?: string,
  abortSignal?: AbortSignal
): Promise<TResponse> {
  const requestId = Math.random().toString(36).slice(2);
  // ...
  return new Promise<TResponse>((resolve, reject) => {
    this.outstandingRequests.set(requestId, { resolve, reject });
    this.send({ type: "request", channelId, requestId, request });
  });
  // No timeout!
}
```

## Impact

1. **WebView closes** - Extension side Promise hangs forever
2. **Extension crashes** - WebView side Promise hangs forever
3. **Network issues** - Both sides can hang
4. **Memory leak** - Unresolved Promise handlers accumulate
5. **UI freeze** - `await` on dead Promise blocks UI

## Fix Required

### Option 1: Timeout Wrapper

```typescript
private sendRequestWithTimeout<TRequest, TResponse>(
  channelId: string,
  request: TRequest,
  timeoutMs = 30000
): Promise<TResponse> {
  return new Promise<TResponse>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      this.outstandingRequests.delete(requestId);
      reject(new Error(`Request timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const requestId = this.generateId();
    this.outstandingRequests.set(requestId, {
      resolve: (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    this.transport!.send({
      type: "request",
      channelId,
      requestId,
      request
    });
  });
}
```

### Option 2: AbortController Integration

```typescript
protected async sendRequest<TResponse>(
  request: WebViewRequest,
  channelId?: string,
  abortSignal?: AbortSignal,
  timeoutMs = 30000
): Promise<TResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Combine with provided signal
  const combinedSignal = abortSignal
    ? AbortSignal.any([abortSignal, controller.signal])
    : controller.signal;

  try {
    return await this.sendRequestInternal(request, channelId, combinedSignal);
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### Option 3: Cleanup on Channel Close

```typescript
closeChannel(channelId: string, sendNotification: boolean, error?: string): void {
  // Reject all outstanding requests for this channel
  for (const [requestId, handler] of this.outstandingRequests) {
    if (requestId.startsWith(channelId)) {
      handler.reject(new Error('Channel closed'));
      this.outstandingRequests.delete(requestId);
    }
  }
  // ... rest of cleanup
}
```

## Recommended Timeouts

| Request Type | Timeout |
|-------------|---------|
| init | 10s |
| open_file | 5s |
| get_claude_state | 10s |
| tool_permission_request | 5 minutes (user interaction) |
| Default | 30s |

## Testing

1. Start conversation
2. Kill extension host process
3. Verify WebView shows error, doesn't hang
4. Reverse: Close WebView while request pending
5. Verify extension doesn't hang
