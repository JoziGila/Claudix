# ISSUE-011: Console.log Left in Production Code

**Severity:** Low
**Category:** Code Quality
**Status:** Confirmed

## Location

Multiple files in `src/webview/`

## Description

Debug console.log statements left in production code.

## Evidence

### ChatPage.vue

```typescript
// Line 341
console.log('[ChatPage] Added attachments:', conversions.map(a => a.fileName));
```

### ModeSelect.vue

```typescript
// Line 123
console.log('Selected mode:', item)
```

### ButtonArea.vue

```typescript
// Line 287
console.log('Command clicked:', item)

// Line 304
console.log('File clicked:', item)
```

### App.vue

```typescript
// Line 63
console.log('[App] runtime initialized', runtime);

// Line 65
console.log('[App] runtime not initialized for page', initialPage);

// Line 90
console.log('Switching to chat with session:', sessionId);
```

### useRuntime.ts

```typescript
// Line 79
console.log('[Runtime] Execute slash command:', cmd.name);

// Line 90
console.log('[Runtime] Registered', slashCommandDisposers.length, 'slash commands');
```

### VSCodeTransport.ts

```typescript
// Line 29
console.log('📨 [From Extension]', data.message);
```

## Impact

1. **Noisy console** - Clutters developer tools
2. **Performance** - Serialization overhead (especially for large objects)
3. **Information disclosure** - Logs user actions and data
4. **Unprofessional** - Users see debug output

## Fix Options

### Option 1: Remove All

```bash
# Find and review
grep -rn "console\.\(log\|warn\|error\)" src/webview/ --include="*.vue" --include="*.ts"

# Remove non-essential ones
```

### Option 2: Conditional Logging

```typescript
const DEBUG = import.meta.env.DEV;

if (DEBUG) {
  console.log('[App] runtime initialized', runtime);
}
```

### Option 3: Logging Service

```typescript
// utils/logger.ts
class Logger {
  private enabled = import.meta.env.DEV;

  log(tag: string, message: string, ...args: any[]) {
    if (this.enabled) {
      console.log(`[${tag}] ${message}`, ...args);
    }
  }

  // Also: warn, error, debug
}

export const logger = new Logger();

// Usage
logger.log('App', 'runtime initialized', runtime);
```

### Option 4: Build-time Removal

```typescript
// vite.config.ts
export default defineConfig({
  esbuild: {
    drop: ['console', 'debugger'],  // Remove in production
  },
});
```

## Recommended Approach

1. **Keep**: console.error for actual errors
2. **Keep with guard**: console.warn for deprecations/issues
3. **Remove**: console.log for debug output
4. **Use logger**: For structured logging that can be toggled

## List of Logs to Address

| File | Line | Action |
|------|------|--------|
| ChatPage.vue | 341 | Remove or DEBUG guard |
| ModeSelect.vue | 123 | Remove |
| ButtonArea.vue | 287, 304 | Remove |
| App.vue | 63, 65, 90 | DEBUG guard |
| useRuntime.ts | 79, 90 | DEBUG guard |
| VSCodeTransport.ts | 29 | DEBUG guard |
