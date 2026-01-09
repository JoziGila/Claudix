/**
 * VSCodeTransport - VSCode WebView Transport Adapter
 *
 * Responsibilities:
 * 1. Implement BaseTransport abstract class
 * 2. Encapsulate VSCode WebView communication via WebViewService
 * 3. Pass messages between Agent and WebView
 *
 * Features:
 * - Isolates VSCode native API from core logic
 * - All dependency services injected via DI
 * - Easy to replace with other transports (e.g., NestJS WebSocket)
 */

import { BaseTransport } from './BaseTransport';
import { ILogService } from '../../logService';
import { IWebViewService } from '../../webViewService';

/**
 * VSCode WebView Transport implementation
 */
export class VSCodeTransport extends BaseTransport {
    constructor(
        @IWebViewService private readonly webViewService: IWebViewService,
        @ILogService private readonly logService: ILogService
    ) {
        super();
        this.logService.info('[VSCodeTransport] Initialized');
    }

    /**
     * Send message to WebView
     */
    send(message: any): void {
        try {
            this.logService.info(`[VSCodeTransport] Sending message: ${message.type}`);
            this.webViewService.postMessage(message);
        } catch (error) {
            this.logService.error('[VSCodeTransport] Failed to send message:', error);
        }
    }
}
