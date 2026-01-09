# ISSUE-022: Completion System Performance and Accuracy

**Severity:** Medium
**Category:** Performance/UX
**Status:** Partial (Caching implemented, fuzzy matching pending)

## Location

- [useCompletionDropdown.ts](../../src/webview/src/composables/useCompletionDropdown.ts)
- [fileReferenceProvider.ts](../../src/webview/src/providers/fileReferenceProvider.ts)
- [ChatInputBox.vue](../../src/webview/src/components/ChatInputBox.vue)

## Description

Command suggestions (`/`) and file suggestions (`@`) are neither fast nor accurate. The completion system has several architectural issues that cause poor responsiveness and suboptimal matching results.

## Evidence

### 1. No Caching - Every Keystroke = API Call

```typescript
// fileReferenceProvider.ts:20-46
export async function getFileReferences(
  query: string,
  runtime: RuntimeInstance | undefined,
  signal?: AbortSignal
): Promise<FileReference[]> {
  // NO CACHE - every call goes to backend
  const connection = await runtime.connectionManager.get()
  const response = await connection.listFiles(pattern, signal)
  return response.files || []
}
```

Typing `@src/comp` makes 8+ API calls (one per character after debounce).

### 2. Fixed 200ms Debounce - Not Adaptive

```typescript
// useCompletionDropdown.ts:107
function loadItemsDebounced(searchQuery: string, delay = 200) {
  debounceTimerId = window.setTimeout(() => {
    // Fixed 200ms delay regardless of query complexity
  }, delay)
}
```

- Too slow for fast typers (feels laggy)
- Too fast for expensive backend operations (wastes resources)
- No adaptive adjustment based on typing speed

### 3. No Client-Side Fuzzy Matching

The system relies entirely on backend filtering. No fuzzy matching like:
- `scmp` → `src/components`
- `uidx` → `useIndex.ts`

### 4. No Result Prefetching or Caching

```typescript
// Every search is independent
async function loadItems(searchQuery: string, signal?: AbortSignal) {
  const data = provider(searchQuery, signal)  // Always fetches fresh
  rawItems.value = data
}
```

Common patterns not cached:
- `/` trigger with empty query (slash commands list)
- `@` trigger with empty query (top-level files)
- Recently accessed paths

### 5. Backend Round-Trip for Every Filter

```
User types: @src/
  -> WebView sends "src/" to Extension Host
  -> Extension Host calls vscode.workspace.findFiles()
  -> Returns results to WebView
  -> WebView displays

User types: @src/c
  -> REPEAT ENTIRE PROCESS (previous results discarded)
```

## Impact

1. **Slow response** - 200ms debounce + API round-trip = 300-500ms per keystroke
2. **Inaccurate suggestions** - No fuzzy matching means exact prefix matching only
3. **Wasted resources** - Same queries repeated, no caching
4. **Poor UX** - Feels sluggish compared to native VSCode completions

## Fix Required

### Option 1: Add Caching Layer

```typescript
// fileReferenceProvider.ts
const cache = new Map<string, { files: FileReference[], timestamp: number }>()
const CACHE_TTL = 5000 // 5 seconds

export async function getFileReferences(
  query: string,
  runtime: RuntimeInstance | undefined,
  signal?: AbortSignal
): Promise<FileReference[]> {
  const cacheKey = query.trim()
  const cached = cache.get(cacheKey)

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.files
  }

  const files = await fetchFromBackend(query, runtime, signal)
  cache.set(cacheKey, { files, timestamp: Date.now() })
  return files
}
```

### Option 2: Client-Side Fuzzy Filtering

```typescript
// Add fuzzy matching library (fuse.js or similar)
import Fuse from 'fuse.js'

const fuse = new Fuse(allFiles, {
  keys: ['name', 'path'],
  threshold: 0.4,
  distance: 100
})

function filterFiles(query: string): FileReference[] {
  if (!query) return allFiles.slice(0, 20)
  return fuse.search(query).map(r => r.item)
}
```

### Option 3: Prefetch Common Queries

```typescript
// On @mention trigger, prefetch top-level
function onAtTrigger() {
  // Prefetch top-level files in background
  prefetchFiles('')
  prefetchFiles('src/')
  prefetchFiles('test/')
}
```

### Option 4: Adaptive Debounce

```typescript
function getAdaptiveDelay(query: string, lastKeyTime: number): number {
  const timeSinceLastKey = Date.now() - lastKeyTime

  // Fast typer - shorter debounce
  if (timeSinceLastKey < 100) return 150

  // Slow typer - longer debounce to reduce calls
  if (timeSinceLastKey > 300) return 300

  return 200 // default
}
```

## Recommended Fix Order

1. **Cache empty query results** (quick win, big impact)
2. **Add fuzzy matching** (accuracy improvement)
3. **Implement prefetching** (perceived speed)
4. **Adaptive debounce** (polish)

## Testing

1. Type `@` and measure time to first suggestion
2. Type `@src/comp` and count API calls (should be 1, currently 8+)
3. Type `@scmp` and verify fuzzy match to `src/components`
4. Repeat same query twice - second should be instant (cached)
5. Measure total response time for file completion

## Git Workflow

**This issue must be committed separately:**

```bash
git checkout -b fix/022-completion-performance
# ... make changes ...
git commit -m "perf(completion): add caching and fuzzy matching

- Add LRU cache for file references (5s TTL)
- Implement client-side fuzzy matching with fuse.js
- Prefetch top-level files on @ trigger
- Add adaptive debounce based on typing speed

Resolves: ISSUE-022"
```
