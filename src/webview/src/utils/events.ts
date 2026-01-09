/**
 * EventEmitter - Simple event emitter
 *
 * Used to manage event callback registration and triggering
 * Primarily used for Tool request/response callback management and session state change notifications
 */
export class EventEmitter<T = any> {
    private callbacks: Array<(data: T) => void> = [];

    /**
     * Add event listener
     * @param callback Callback function
     * @returns Unsubscribe function
     */
    add(callback: (data: T) => void): () => void {
        this.callbacks.push(callback);

        // Return unsubscribe function
        return () => {
            const index = this.callbacks.indexOf(callback);
            if (index !== -1) {
                this.callbacks.splice(index, 1);
            }
        };
    }

    /**
     * Emit event, notify all listeners
     * @param data Event data
     */
    emit(data: T): void {
        for (const callback of this.callbacks) {
            try {
                callback(data);
            } catch (error) {
                console.error('[EventEmitter] Callback error:', error);
            }
        }
    }

    /**
     * Clear all listeners
     */
    clear(): void {
        this.callbacks = [];
    }

    /**
     * Get listener count
     */
    get listenerCount(): number {
        return this.callbacks.length;
    }
}
