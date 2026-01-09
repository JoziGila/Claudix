import type { DropdownItemType } from '../types/dropdown'
import type { RuntimeInstance } from '../composables/useRuntime'

/**
 * 文件引用项
 */
export interface FileReference {
  path: string
  name: string
  type: 'file' | 'directory'
}

// ISSUE-022: Cache for file references with TTL
interface CacheEntry {
  files: FileReference[]
  timestamp: number
}

const fileCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5000 // 5 seconds
const MAX_CACHE_SIZE = 100 // Limit cache size to prevent memory bloat

/**
 * Clear expired cache entries (ISSUE-022)
 */
function cleanExpiredCache(): void {
  const now = Date.now()
  for (const [key, entry] of fileCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      fileCache.delete(key)
    }
  }
}

/**
 * Get cached files if valid (ISSUE-022)
 */
function getCached(query: string): FileReference[] | undefined {
  const entry = fileCache.get(query)
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.files
  }
  return undefined
}

/**
 * Add files to cache (ISSUE-022)
 */
function setCache(query: string, files: FileReference[]): void {
  // Evict if cache is full
  if (fileCache.size >= MAX_CACHE_SIZE) {
    cleanExpiredCache()
    // If still full, delete oldest entry
    if (fileCache.size >= MAX_CACHE_SIZE) {
      const firstKey = fileCache.keys().next().value
      if (firstKey) fileCache.delete(firstKey)
    }
  }
  fileCache.set(query, { files, timestamp: Date.now() })
}

/**
 * 获取文件列表 with caching (ISSUE-022)
 * @param query 搜索查询
 * @param runtime Runtime 实例
 * @param signal 可选的 AbortSignal,用于取消请求
 * @returns 文件引用数组
 */
export async function getFileReferences(
  query: string,
  runtime: RuntimeInstance | undefined,
  signal?: AbortSignal
): Promise<FileReference[]> {
  if (!runtime) {
    console.warn('[fileReferenceProvider] No runtime available')
    return []
  }

  const cacheKey = (query && query.trim()) ? query.trim() : ''

  // ISSUE-022: Check cache first
  const cached = getCached(cacheKey)
  if (cached) {
    return cached
  }

  try {
    const connection = await runtime.connectionManager.get()

    // 空查询传递空字符串,让后端返回顶层内容（目录 + 顶层文件）
    const pattern = cacheKey
    const response = await connection.listFiles(pattern, signal)

    // response.files 格式：{ path, name, type }
    const files = response.files || []

    // ISSUE-022: Cache the result
    setCache(cacheKey, files)

    return files
  } catch (error) {
    // 如果是 AbortError,静默处理
    if (error instanceof Error && error.name === 'AbortError') {
      return []
    }
    console.error('[fileReferenceProvider] Failed to list files:', error)
    return []
  }
}

/**
 * Prefetch common file paths for faster suggestions (ISSUE-022)
 * Call this when user triggers @ mention
 */
export function prefetchCommonPaths(runtime: RuntimeInstance | undefined): void {
  if (!runtime) return

  // Prefetch top-level (empty query)
  void getFileReferences('', runtime)

  // Prefetch common directories
  const commonPaths = ['src/', 'test/', 'tests/', 'lib/', 'app/']
  for (const path of commonPaths) {
    void getFileReferences(path, runtime)
  }
}

/**
 * Clear the file cache (ISSUE-022)
 * Call this when files might have changed
 */
export function clearFileCache(): void {
  fileCache.clear()
}

/**
 * 将文件引用转换为 DropdownItem 格式
 */
export function fileToDropdownItem(file: FileReference): DropdownItemType {
  return {
    id: `file-${file.path}`,
    type: 'item',
    label: file.name,
    detail: file.path,
    // 不设置 icon，交由 FileIcon 组件根据 isDirectory/folderName 匹配
    data: {
      file
    }
  }
}
