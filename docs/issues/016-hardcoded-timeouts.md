# ISSUE-016: Hardcoded Timeouts

**Severity:** Low
**Category:** Configuration
**Status:** Confirmed

## Location

- [StreamingController.ts:68-73](../../src/webview/src/core/StreamingController.ts#L68-L73)

## Description

Timeout values are hardcoded constants with no way for users to configure them.

## Evidence

```typescript
const TIMEOUTS = {
  TEXT_BLOCK: 30_000,      // 30 seconds
  THINKING_BLOCK: 120_000, // 2 minutes
  TOOL_USE_BLOCK: 60_000,  // 1 minute
  DEFAULT: 30_000          // 30 seconds
} as const;
```

## Impact

### Users with Slow Networks

- 30 second text timeout may be too short
- Streams timeout prematurely
- User gets error, has to retry

### Users with Fast Networks

- 2 minute thinking timeout feels long
- UI appears frozen
- No way to shorten

### Corporate/VPN Users

- Higher latency environments
- May need longer timeouts
- Currently no recourse

## Fix Options

### Option 1: VSCode Settings

```typescript
// configurationService.ts or settings schema
const timeoutConfig = vscode.workspace.getConfiguration('claudix.timeouts');

const TIMEOUTS = {
  TEXT_BLOCK: timeoutConfig.get('textBlock', 30_000),
  THINKING_BLOCK: timeoutConfig.get('thinkingBlock', 120_000),
  TOOL_USE_BLOCK: timeoutConfig.get('toolUse', 60_000),
  DEFAULT: timeoutConfig.get('default', 30_000)
};
```

```json
// package.json contribution
{
  "contributes": {
    "configuration": {
      "title": "Claudix",
      "properties": {
        "claudix.timeouts.textBlock": {
          "type": "number",
          "default": 30000,
          "description": "Timeout for text streaming (ms)"
        },
        "claudix.timeouts.thinkingBlock": {
          "type": "number",
          "default": 120000,
          "description": "Timeout for thinking blocks (ms)"
        }
      }
    }
  }
}
```

### Option 2: Adaptive Timeouts

```typescript
class AdaptiveTimeout {
  private recentLatencies: number[] = [];
  private baseTimeout: number;

  constructor(baseTimeout: number) {
    this.baseTimeout = baseTimeout;
  }

  recordLatency(ms: number) {
    this.recentLatencies.push(ms);
    if (this.recentLatencies.length > 10) {
      this.recentLatencies.shift();
    }
  }

  getTimeout(): number {
    if (this.recentLatencies.length === 0) {
      return this.baseTimeout;
    }

    const avgLatency = this.recentLatencies.reduce((a, b) => a + b, 0)
      / this.recentLatencies.length;

    // Timeout = 3x average latency, minimum base
    return Math.max(this.baseTimeout, avgLatency * 3);
  }
}
```

### Option 3: User Override in Context

```typescript
// Session options
interface SessionOptions {
  timeouts?: Partial<typeof TIMEOUTS>;
}

// Usage
const session = new Session(..., {
  timeouts: {
    TEXT_BLOCK: 60_000,  // User needs longer
  }
});
```

## Recommended Approach

1. **Add VSCode settings** for power users
2. **Keep sensible defaults** for most users
3. **Document** what each timeout controls
4. **Consider adaptive** for future enhancement

## Testing

1. Set very short timeout (1 second)
2. Verify timeout error appears
3. Set very long timeout
4. Verify no premature timeout on slow network
5. Reset to default
