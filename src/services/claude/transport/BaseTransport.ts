/**
 * BaseTransport - Transport Layer Abstract Interface
 *
 * Defines the basic contract for Transport, used for passing messages
 * between Agent and client.
 *
 * Implementations:
 * - VSCodeTransport: VSCode WebView transport implementation
 * - NestJSTransport: NestJS WebSocket transport (future)
 * - ElectronTransport: Electron IPC transport (future)
 *
 * Design principles:
 * - Bidirectional: send() to send, onMessage() to receive
 * - Platform-agnostic: No dependency on specific host environment APIs
 * - Simple abstraction: Only defines core transport capabilities
 */

/**
 * Transport interface
 *
 * For passing messages between Claude Agent and client (WebView/WebSocket/IPC)
 */
export interface ITransport {
    /**
     * Send message to client
     *
     * @param message - Message object to send
     */
    send(message: any): void;

    /**
     * Listen for messages from client (Fix #8: supports multiple callbacks)
     *
     * @param callback - Message receive callback
     * @returns Unsubscribe function
     */
    onMessage(callback: (message: any) => void): () => void;
}

/**
 * Transport abstract base class (optional)
 *
 * Provides common functionality, implementations can inherit from this class
 */
export abstract class BaseTransport implements ITransport {
    // Fix #8: Support multiple callbacks with Set
    protected messageCallbacks = new Set<(message: any) => void>();

    /**
     * Send message (implemented by subclass)
     */
    abstract send(message: any): void;

    /**
     * Register message listener (Fix #8: supports multiple callbacks)
     * @returns Unsubscribe function
     */
    onMessage(callback: (message: any) => void): () => void {
        this.messageCallbacks.add(callback);
        // Return unsubscribe function
        return () => {
            this.messageCallbacks.delete(callback);
        };
    }

    /**
     * Trigger message callback (for subclass use)
     */
    protected triggerMessage(message: any): void {
        for (const callback of this.messageCallbacks) {
            try {
                callback(message);
            } catch (error) {
                console.error('[BaseTransport] Callback error:', error);
            }
        }
    }
}
