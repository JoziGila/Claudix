# ISSUE-020: No Connection Recovery / Retry Logic

**Severity:** Medium
**Category:** Reliability
**Status:** FIXED

## Location

- [ConnectionManager.ts](../../src/webview/src/core/ConnectionManager.ts)
- [useRuntime.ts:99](../../src/webview/src/composables/useRuntime.ts#L99)

## Description

The WebView has no reconnection or retry logic if the extension connection fails during initialization or drops mid-session.

## Evidence

### ConnectionManager.ts - No Error Recovery

```typescript
async get(): Promise<BaseTransport> {
  const current = this.connectionSignal();
  if (current) {
    return current;
  }

  if (this.currentPromise) {
    return this.currentPromise;
  }

  // If factory() fails, currentPromise is set but never cleared
  // Subsequent calls return the failed promise forever
  this.currentPromise = Promise.resolve(this.factory()).then((connection) => {
    this.connectionSignal(connection);
    return connection;
  });

  return this.currentPromise;
}
```

### useRuntime.ts - Silent Failure

```typescript
try {
  await connection.opened;
} catch (e) {
  console.error('[runtime] open failed', e);
  return;  // Silent failure - user sees blank screen
}
```

## Impact

1. **Extension crash** - WebView can't recover, shows blank screen
2. **Network blip** - Temporary failure becomes permanent
3. **VSCode reload** - Extension reloads, WebView doesn't reconnect
4. **User confusion** - No error message, just frozen UI

## Fix Required

### Option 1: Retry with Exponential Backoff

```typescript
// ConnectionManager.ts
async get(retries = 3, delay = 1000): Promise<BaseTransport> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const current = this.connectionSignal();
      if (current) return current;

      const connection = await this.factory();
      this.connectionSignal(connection);
      return connection;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise(r => setTimeout(r, delay * attempt));
    }
  }
  throw new Error('Connection failed after retries');
}
```

### Option 2: User-Visible Retry UI

```typescript
// useRuntime.ts
onMounted(() => {
  const MAX_RETRIES = 3;
  let retryCount = 0;
  let connectionError = ref<string | null>(null);

  async function connect() {
    try {
      connectionError.value = null;
      const connection = await connectionManager.get();
      await connection.opened;
      // ... continue setup
    } catch (e) {
      retryCount++;
      connectionError.value = `Connection failed (attempt ${retryCount}/${MAX_RETRIES})`;

      if (retryCount < MAX_RETRIES) {
        setTimeout(connect, 1000 * retryCount);
      } else {
        connectionError.value = 'Could not connect to extension. Try reloading.';
      }
    }
  }

  connect();
});
```

### Option 3: Health Check + Auto-Recovery

```typescript
class ConnectionManager {
  private healthCheckInterval?: number;

  async get(): Promise<BaseTransport> {
    const connection = await this.getOrCreate();
    this.startHealthCheck(connection);
    return connection;
  }

  private startHealthCheck(connection: BaseTransport) {
    this.healthCheckInterval = setInterval(async () => {
      if (connection.state() === 'disconnected') {
        await this.reconnect();
      }
    }, 5000);
  }

  private async reconnect() {
    this.connectionSignal(undefined);
    this.currentPromise = undefined;
    try {
      await this.get();
    } catch (e) {
      // Schedule retry
    }
  }
}
```

## User Experience Improvement

Show connection status in UI:

```vue
<div v-if="connectionState === 'disconnected'" class="connection-banner">
  <span class="codicon codicon-warning"></span>
  Connection lost. <button @click="retry">Retry</button>
</div>
```

## Testing

1. Start extension, verify connection works
2. Kill extension host process
3. Verify WebView shows error message
4. Verify retry button works
5. Test with slow network (throttle)
6. Verify automatic retry recovers connection
