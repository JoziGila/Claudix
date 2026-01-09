import { BaseTransport } from './BaseTransport';
import { EventEmitter } from '../utils/events';
import type { FromExtensionWrapper, WebViewToExtensionMessage } from '../../../shared/messages';

interface VsCodeApi {
    postMessage(message: any): void;
}

export class VSCodeTransport extends BaseTransport {
    private readonly api: VsCodeApi;
    private readonly openedPromise: Promise<void>;
    private readonly closedPromise: Promise<void>;

    override get opened(): Promise<void> {
        return this.openedPromise;
    }

    override get closed(): Promise<void> {
        return this.closedPromise;
    }

    private handleMessage = (event: MessageEvent<FromExtensionWrapper>) => {
        const data = event.data;
        if (!data || data.type !== 'from-extension') {
            return;
        }

        // Debug log: print raw message received from Extension
        console.log('📨 [From Extension]', data.message);

        this.fromHost.enqueue(data.message);
    };

    constructor(atMentionEvents: EventEmitter<string>, selectionChangedEvents: EventEmitter<any>) {
        super(atMentionEvents, selectionChangedEvents);

        this.api = (window as any).acquireVsCodeApi();

        window.addEventListener('message', this.handleMessage);

        this.openedPromise = this.initialize();
        this.closedPromise = new Promise(() => {
            /* resolved when extension disposes webview */
        });
    }

    protected send(message: WebViewToExtensionMessage): void {
        this.api.postMessage(message);
    }

    override close(): void {
        window.removeEventListener('message', this.handleMessage);
        super.close();
    }
}
