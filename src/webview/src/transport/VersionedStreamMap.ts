/**
 * VersionedStreamMap - Version-tracked stream management (ISSUE-005)
 *
 * Prevents race condition where delayed cleanup deletes a recreated stream
 * with the same channel ID. Each stream is assigned a version number, and
 * cleanup only proceeds if versions match.
 *
 * Problem this solves:
 * ```
 * T+0ms:  close_channel for "abc123"
 * T+10ms: launchClaude creates new channel "abc123"
 * T+50ms: setTimeout fires, deletes the NEW stream!  <- BUG
 * ```
 *
 * Solution:
 * ```
 * T+0ms:  close_channel for "abc123" version=1
 * T+10ms: launchClaude creates "abc123" version=2
 * T+50ms: close(version=1) → version mismatch → no deletion ✓
 * ```
 */

import { AsyncQueue } from './AsyncQueue'

interface StreamEntry<T> {
  stream: AsyncQueue<T>
  version: number
}

export class VersionedStreamMap<T> {
  private streams = new Map<string, StreamEntry<T>>()
  private nextVersion = 0

  /**
   * Create a new stream for the given channel ID.
   * Returns the stream and its version number.
   */
  create(channelId: string): AsyncQueue<T> {
    const stream = new AsyncQueue<T>()
    const version = this.nextVersion++

    this.streams.set(channelId, { stream, version })
    return stream
  }

  /**
   * Get stream for channel ID, or undefined if not found.
   */
  get(channelId: string): AsyncQueue<T> | undefined {
    return this.streams.get(channelId)?.stream
  }

  /**
   * Get version for channel ID, or undefined if not found.
   */
  getVersion(channelId: string): number | undefined {
    return this.streams.get(channelId)?.version
  }

  /**
   * Close stream only if version matches.
   * Prevents race condition where delayed close deletes newer stream.
   *
   * @param channelId - Channel ID
   * @param version - Version to match (if undefined, always close)
   * @param error - Optional error to propagate
   * @returns true if stream was closed, false if version mismatch
   */
  close(channelId: string, version?: number, error?: Error): boolean {
    const entry = this.streams.get(channelId)
    if (!entry) {
      return false
    }

    // If version provided, only close if it matches
    if (version !== undefined && entry.version !== version) {
      // Version mismatch - stream was recreated, don't delete
      return false
    }

    // Propagate error if provided
    if (error) {
      entry.stream.error(error)
    }

    // Mark stream as done
    entry.stream.done()

    // Delete synchronously - no setTimeout needed with versioning
    this.streams.delete(channelId)
    return true
  }

  /**
   * Check if stream exists for channel ID.
   */
  has(channelId: string): boolean {
    return this.streams.has(channelId)
  }

  /**
   * Clear all streams, calling done() on each.
   */
  clear(): void {
    for (const entry of this.streams.values()) {
      entry.stream.done()
    }
    this.streams.clear()
  }

  /**
   * Get number of active streams.
   */
  get size(): number {
    return this.streams.size
  }
}
