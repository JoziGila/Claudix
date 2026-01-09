# ISSUE-007: ID Generation Not Cryptographically Secure

**Severity:** Medium
**Category:** Security
**Status:** Confirmed

## Location

- [ClaudeAgentService.ts:837-839](../../src/services/claude/ClaudeAgentService.ts#L837-L839)
- [Session.ts:293](../../src/webview/src/core/Session.ts#L293)
- [BaseTransport.ts:232](../../src/webview/src/transport/BaseTransport.ts#L232)

## Description

Using `Math.random()` for generating IDs throughout the codebase.

## Evidence

```typescript
// ClaudeAgentService.ts:837-839
private generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Session.ts:293
const channelId = Math.random().toString(36).slice(2);

// BaseTransport.ts:232
const requestId = Math.random().toString(36).slice(2);
```

## Why This Matters

### Math.random() Properties

- **Not cryptographically secure** - Uses PRNG, can be predicted
- **Not guaranteed unique** - ~13 characters = ~67 bits, collision possible
- **Same seed = same sequence** - In some environments

### Attack Vectors (Theoretical)

1. **ID Prediction** - If attacker can observe some IDs, may predict future ones
2. **Collision Attack** - Generate enough requests to hit existing ID
3. **Session Hijacking** - Predict channel ID before creation

### Practical Risk: LOW

For this application:
- IDs are internal, not exposed to users
- Short-lived (request/response)
- Validated by other means (channel existence)

But for defense in depth, use proper random IDs.

## Fix Required

### Node.js / Extension Side

```typescript
import { randomBytes } from 'crypto';

private generateId(): string {
  return randomBytes(16).toString('hex');
}

// Or using UUID
import { randomUUID } from 'crypto';

private generateId(): string {
  return randomUUID();
}
```

### WebView Side

```typescript
function generateId(): string {
  return crypto.randomUUID();
}

// Or for broader compatibility
function generateId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}
```

## Affected Code Paths

| Location | ID Used For | Risk |
|----------|-------------|------|
| ClaudeAgentService | Request IDs | Low |
| Session | Channel IDs | Low |
| BaseTransport | Request IDs | Low |

## Testing

1. Generate 1 million IDs
2. Check for collisions
3. Verify proper entropy (compression test)
4. Check across process restarts
