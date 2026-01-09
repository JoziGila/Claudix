/**
 * useMessageQueue - Queue messages when Claude is busy
 *
 * Handles the case where user sends a message while Claude is responding.
 * Messages are queued and automatically sent when Claude becomes idle.
 *
 * Fixes ISSUE-001: Missing Message Queue While Responding
 */

import { ref, watch, type Ref } from 'vue'

export interface UseMessageQueueOptions {
  /** Maximum number of messages to queue (default: 10) */
  maxQueueSize?: number
}

export interface UseMessageQueueReturn {
  /** Array of queued messages */
  pendingMessages: Ref<string[]>
  /** Queue a message (sends immediately if not busy, queues if busy) */
  queueMessage: (message: string) => void
  /** Clear all queued messages */
  clearQueue: () => void
  /** Whether queue is currently being processed */
  isProcessing: Ref<boolean>
}

/**
 * Composable for managing message queue when Claude is busy
 *
 * @param isBusy - Reactive ref indicating if Claude is processing
 * @param submitFn - Function to submit a message
 * @param options - Configuration options
 * @returns Queue management functions and state
 *
 * @example
 * ```ts
 * const { pendingMessages, queueMessage, clearQueue } = useMessageQueue(
 *   isBusy,
 *   handleSubmit
 * )
 *
 * // In template:
 * // @queue-message="queueMessage"
 * // v-if="pendingMessages.length > 0"
 * ```
 */
export function useMessageQueue(
  isBusy: Ref<boolean>,
  submitFn: (message: string) => Promise<void> | void,
  options: UseMessageQueueOptions = {}
): UseMessageQueueReturn {
  const { maxQueueSize = 10 } = options
  const pendingMessages = ref<string[]>([])
  const isProcessing = ref(false)

  /**
   * Process the next message in the queue
   */
  async function processQueue(): Promise<void> {
    if (isProcessing.value || isBusy.value || pendingMessages.value.length === 0) {
      return
    }

    isProcessing.value = true
    try {
      const nextMessage = pendingMessages.value.shift()
      if (nextMessage) {
        await submitFn(nextMessage)
      }
    } catch (error) {
      console.error('[useMessageQueue] Error processing queued message:', error)
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Queue a message or submit directly if not busy
   */
  function queueMessage(message: string): void {
    const trimmed = message.trim()
    if (!trimmed) return

    if (isBusy.value) {
      // Queue the message if busy
      if (pendingMessages.value.length < maxQueueSize) {
        pendingMessages.value.push(trimmed)
        console.log(`[useMessageQueue] Message queued (${pendingMessages.value.length} in queue)`)
      } else {
        console.warn('[useMessageQueue] Queue full, message dropped')
      }
    } else {
      // Submit directly if not busy
      void submitFn(trimmed)
    }
  }

  /**
   * Clear all queued messages
   */
  function clearQueue(): void {
    pendingMessages.value = []
    console.log('[useMessageQueue] Queue cleared')
  }

  // Watch for busy state change to process queue
  watch(isBusy, async (busy) => {
    if (!busy && pendingMessages.value.length > 0) {
      // Small delay to ensure UI has updated
      await new Promise(resolve => setTimeout(resolve, 100))
      await processQueue()
    }
  })

  return {
    pendingMessages,
    queueMessage,
    clearQueue,
    isProcessing
  }
}
