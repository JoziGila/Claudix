/**
 * ResilientMessageQueue - A restartable message queue for producer/consumer patterns
 *
 * Unlike AsyncStream which is single-use, this queue:
 * - Can be reset and restarted after errors
 * - Continues processing even if individual messages fail
 * - Supports graceful shutdown with close()
 *
 * Use cases:
 * 1. Main message loop from WebView to Extension
 * 2. Any persistent communication channel that needs error recovery
 */

export class ResilientMessageQueue<T> {
	private queue: T[] = [];
	private waitingResolve?: (value: T | null) => void;
	private closed = false;

	/**
	 * Add a message to the queue (producer API)
	 */
	enqueue(value: T): void {
		if (this.closed) {
			return;
		}

		if (this.waitingResolve) {
			const resolve = this.waitingResolve;
			this.waitingResolve = undefined;
			resolve(value);
		} else {
			this.queue.push(value);
		}
	}

	/**
	 * Get the next message from the queue (consumer API)
	 * Returns null if the queue is closed
	 */
	async dequeue(): Promise<T | null> {
		if (this.closed) {
			return null;
		}

		if (this.queue.length > 0) {
			return this.queue.shift()!;
		}

		return new Promise<T | null>((resolve) => {
			this.waitingResolve = resolve;
		});
	}

	/**
	 * Close the queue - signals consumers to stop
	 */
	close(): void {
		this.closed = true;
		if (this.waitingResolve) {
			this.waitingResolve(null);
			this.waitingResolve = undefined;
		}
	}

	/**
	 * Reset the queue for restart after error recovery
	 */
	reset(): void {
		this.closed = false;
		this.queue = [];
		this.waitingResolve = undefined;
	}

	/**
	 * Check if the queue is closed
	 */
	get isClosed(): boolean {
		return this.closed;
	}

	/**
	 * Get current queue length (for debugging)
	 */
	get length(): number {
		return this.queue.length;
	}
}
