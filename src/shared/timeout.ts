/**
 * Timeout utilities for RPC requests (ISSUE-003)
 *
 * Provides timeout functionality using modern AbortSignal.timeout() pattern.
 * Prevents promises from hanging forever when responses never arrive.
 */

/**
 * Error thrown when a request times out
 */
export class TimeoutError extends Error {
  readonly name = 'TimeoutError'

  constructor(public readonly timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`)
  }
}

/**
 * Wrap a promise with a timeout using AbortSignal.timeout()
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param signal - Optional external AbortSignal to combine with timeout
 * @returns Promise that rejects with TimeoutError if timeout exceeded
 *
 * @example
 * ```ts
 * try {
 *   const result = await withTimeout(fetchData(), 5000)
 * } catch (e) {
 *   if (e instanceof TimeoutError) {
 *     // Handle timeout
 *   }
 * }
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  // Use modern AbortSignal.timeout if available
  const timeoutSignal = AbortSignal.timeout(timeoutMs)

  // Combine signals if external signal provided
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal

  return new Promise<T>((resolve, reject) => {
    // Handle abort
    const onAbort = () => {
      if (timeoutSignal.aborted) {
        reject(new TimeoutError(timeoutMs))
      } else {
        reject(new Error('Request aborted'))
      }
    }

    // Check if already aborted
    if (combinedSignal.aborted) {
      onAbort()
      return
    }

    // Listen for abort
    combinedSignal.addEventListener('abort', onAbort, { once: true })

    // Race against the original promise
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        combinedSignal.removeEventListener('abort', onAbort)
      })
  })
}

/**
 * Default timeouts by request type (in milliseconds)
 */
export const REQUEST_TIMEOUTS = {
  /** Initial connection setup */
  init: 10_000,
  /** Opening a file */
  open_file: 5_000,
  /** Getting Claude state */
  get_claude_state: 10_000,
  /** Tool permission request (requires user interaction) */
  tool_permission_request: 300_000, // 5 minutes
  /** Default for unspecified requests */
  default: 30_000
} as const

export type RequestType = keyof typeof REQUEST_TIMEOUTS

/**
 * Get timeout for a specific request type
 *
 * @param type - Request type or 'default'
 * @returns Timeout in milliseconds
 */
export function getTimeoutForRequest(type: string): number {
  if (type in REQUEST_TIMEOUTS) {
    return REQUEST_TIMEOUTS[type as RequestType]
  }
  return REQUEST_TIMEOUTS.default
}
