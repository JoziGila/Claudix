# ISSUE-009: Excessive `any` Type Usage

**Severity:** Medium
**Category:** Type Safety
**Status:** Confirmed

## Location

Multiple files throughout the codebase.

## Description

Heavy use of `any` type reduces TypeScript's effectiveness for catching bugs at compile time.

## Evidence

### shared/messages.ts - Loose Response Types

```typescript
// Line 235
config: any;

// Line 259
assetUris: any;

// Line 291
messages: any[];
```

### webViewService.ts - Untyped Message Handlers

```typescript
// Line 37
postMessage(message: any): void;

// Line 42
setMessageHandler(handler: (message: any) => void): void;
```

### handlers/handlers.ts - SDK Type Casts

```typescript
// Lines 692-694
slashCommands: await (query as any).supportedCommands?.() || [],
models: await (query as any).supportedModels?.() || [],
accountInfo: await (query as any).accountInfo?.() || null
```

### BaseTransport.ts - Request/Response Handling

```typescript
// Multiple lines with any
const req: any = (message as any).request;
const response = (message as any).response;
```

## Impact

1. **Runtime errors not caught** - Type mismatches only found at runtime
2. **Reduced IDE support** - No autocomplete or refactoring help
3. **Documentation loss** - Types serve as documentation
4. **Refactoring risk** - Changes may break unknown code paths

## Count by File

| File | `any` Count | Priority |
|------|-------------|----------|
| shared/messages.ts | 3 | High - core protocol |
| base/errors.ts | 15 | Low - error handling |
| base/lifecycle.ts | 5 | Low - infrastructure |
| webViewService.ts | 3 | Medium |
| handlers/handlers.ts | 3 | Medium |
| logService.ts | 8 | Low - varargs logging |

## Fix Strategy

### 1. Define Proper Types for Messages

```typescript
// Instead of
config: any;

// Define
interface ClaudeConfig {
  maxTokens: number;
  model: string;
  apiVersion: string;
  // ... other fields
}
config: ClaudeConfig;
```

### 2. Use Generics for Message Handlers

```typescript
// Instead of
postMessage(message: any): void;

// Use union type
postMessage(message: ExtensionToWebViewMessage): void;

// Or generic
postMessage<T extends ExtensionToWebViewMessage>(message: T): void;
```

### 3. Type Guard Functions

```typescript
function isIOMessage(msg: unknown): msg is IOMessage {
  return typeof msg === 'object' && msg !== null && (msg as any).type === 'io_message';
}

// Usage
if (isIOMessage(message)) {
  // TypeScript knows message.channelId exists
}
```

### 4. Use `unknown` Instead of `any`

```typescript
// Instead of
function handleError(error: any): void { }

// Use unknown (forces type checking)
function handleError(error: unknown): void {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
}
```

## Priority Order

1. **shared/messages.ts** - Core protocol types affect everything
2. **BaseTransport.ts** - High traffic code path
3. **handlers/handlers.ts** - SDK integration
4. **webViewService.ts** - WebView boundary
5. **Others** - Lower priority

## Testing

1. Enable `noImplicitAny` in tsconfig.json (if not already)
2. Fix errors incrementally
3. Run full type check: `npx tsc --noEmit`
4. Add type tests for critical paths
