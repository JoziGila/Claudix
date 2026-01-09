# ISSUE-018: Potential Performance Bottlenecks

**Severity:** Medium
**Category:** Performance
**Status:** Investigation Needed

## Symptoms Reported

- Extension sometimes gets stuck
- Responses feel slow
- UI occasionally freezes

## Potential Causes

### 1. Synchronous Signal Updates in Tight Loops

**Location:** [Session.ts](../../src/webview/src/core/Session.ts)

```typescript
// StreamingController processes messages and updates signals
for await (const message of stream) {
  this.messages([...this.messages(), message]);  // Creates new array each time
}
```

**Problem:** Each `messages()` call:
- Creates new array
- Triggers all computed dependencies
- May cause Vue re-renders

**Fix:**
```typescript
// Batch updates
const batch: Message[] = [];
for await (const message of stream) {
  batch.push(message);
  if (batch.length >= 10 || /* timeout */) {
    this.messages([...this.messages(), ...batch]);
    batch.length = 0;
  }
}
```

### 2. No Debouncing on Selection Updates

**Location:** [Session.ts:142-144](../../src/webview/src/core/Session.ts#L142-L144)

```typescript
effect(() => {
  this.selection(this.context.currentSelection());
});
```

**Problem:** Every cursor movement triggers signal update.

**Fix:**
```typescript
let debounceTimer: number | undefined;
effect(() => {
  const selection = this.context.currentSelection();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    this.selection(selection);
  }, 100);
});
```

### 3. Large Message Arrays in Memory

**Location:** [Session.ts messages signal](../../src/webview/src/core/Session.ts)

```typescript
readonly messages = signal<any[]>([]);
```

**Problem:** Long conversations accumulate large arrays. Each update copies entire array.

**Fix Options:**
- Use immutable data structures (Immer)
- Paginate/virtualize message list
- Only keep recent N messages in signal, rest in IndexedDB

### 4. Mermaid Rendering Blocking Main Thread

**Location:** [MermaidDiagram.vue](../../src/webview/src/components/Messages/MermaidDiagram.vue)

**Problem:** Complex diagrams render synchronously.

**Fix:**
```typescript
// Use Web Worker or requestIdleCallback
requestIdleCallback(() => {
  mermaid.render(id, code);
});
```

### 5. Console.log with Large Objects

**Location:** Multiple files (see ISSUE-011)

```typescript
console.log('📨 [From Extension]', data.message);
```

**Problem:** Logging serializes entire message objects.

**Fix:** Remove or guard with DEV check.

### 6. File Completion Provider - No Caching

**Location:** [fileReferenceProvider.ts](../../src/webview/src/providers/fileReferenceProvider.ts)

```typescript
export async function getFileReferences(query: string, runtime: any, signal?: AbortSignal) {
  const connection = await runtime.connectionManager.get()
  const response = await connection.listFiles(query, signal)
  // No caching - every keystroke = new API call
}
```

**Fix:**
```typescript
const cache = new Map<string, { files: any[], timestamp: number }>();
const CACHE_TTL = 5000;

export async function getFileReferences(query: string, ...) {
  const cacheKey = query.slice(0, 3); // Cache by prefix
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.files.filter(f => f.name.includes(query));
  }

  const files = await connection.listFiles(query, signal);
  cache.set(cacheKey, { files, timestamp: Date.now() });
  return files;
}
```

### 7. SDK Process Communication Overhead

**Location:** [ClaudeSdkService.ts](../../src/services/claude/ClaudeSdkService.ts)

**Problem:** Each message goes through:
- JavaScript serialization
- IPC to subprocess
- SDK processing
- IPC back
- JavaScript deserialization

**Monitoring:**
```typescript
const start = performance.now();
const result = await query(params);
console.log(`SDK round-trip: ${performance.now() - start}ms`);
```

## Investigation Steps

### 1. Add Performance Marks

```typescript
performance.mark('send-start');
await session.send(message);
performance.mark('send-end');
performance.measure('send-duration', 'send-start', 'send-end');
```

### 2. Use Chrome DevTools Profiler

1. Open WebView DevTools
2. Start recording
3. Reproduce slow behavior
4. Analyze flame chart

### 3. Check for Memory Leaks

```javascript
// In DevTools Console
const baseline = performance.memory.usedJSHeapSize;
// Do operations
const after = performance.memory.usedJSHeapSize;
console.log('Memory delta:', (after - baseline) / 1024 / 1024, 'MB');
```

### 4. Monitor Signal Updates

```typescript
// Temporary debugging
let updateCount = 0;
effect(() => {
  this.messages();
  console.log('messages updated:', ++updateCount);
});
```

## Recommended Actions

1. **Profile first** - Don't optimize without data
2. **Batch signal updates** - Reduce reactivity churn
3. **Add file caching** - Quick win for @ completion
4. **Remove console.logs** - Free performance boost
5. **Consider virtualization** - For long conversations
