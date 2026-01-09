/**
 * WebView Service
 *
 * Responsibilities:
 * 1. Implement vscode.WebviewViewProvider interface
 * 2. Manage WebView instances and lifecycle
 * 3. Generate WebView HTML content
 * 4. Provide message send/receive interface
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';

export const IWebViewService = createDecorator<IWebViewService>('webViewService');

export type WebviewHost = 'sidebar' | 'editor';

export interface WebviewBootstrapConfig {
	host: WebviewHost;
	page?: string;
	id?: string;
}

export interface IWebViewService extends vscode.WebviewViewProvider {
	readonly _serviceBrand: undefined;

	/**
	 * Get current WebView instance (for scenarios requiring webviewUri)
	 */
	getWebView(): vscode.Webview | undefined;

	/**
	 * Broadcast message to all registered WebView instances
	 */
	postMessage(message: any): void;

	/**
	 * Set message receive handler, all WebView messages will be forwarded through this handler
	 */
	setMessageHandler(handler: (message: any) => void): void;

	/**
	 * Open (or focus) a page in the main editor
	 *
	 * @param page Page type identifier, e.g. 'settings', 'diff'
	 * @param title VSCode tab title
	 * @param instanceId Page instance ID for multiple tabs (defaults to page for singleton)
	 */
	openEditorPage(page: string, title: string, instanceId?: string): void;

	/**
	 * Update editor panel title (editor panels only)
	 *
	 * @param instanceId Panel instance ID
	 * @param title New title (will be truncated to 40 chars)
	 */
	updatePanelTitle(instanceId: string, title: string): void;
}

/**
 * WebView service implementation
 */
export class WebViewService implements IWebViewService {
	readonly _serviceBrand: undefined;

	private readonly webviews = new Set<vscode.Webview>();
	private readonly webviewConfigs = new Map<vscode.Webview, WebviewBootstrapConfig>();
	private messageHandler?: (message: any) => void;
	private readonly editorPanels = new Map<string, vscode.WebviewPanel>();

	// Fix #7: Buffer messages when no webviews available
	private pendingMessages: any[] = [];
	private readonly MAX_PENDING_MESSAGES = 100;

	constructor(
		private readonly context: vscode.ExtensionContext,
		@ILogService private readonly logService: ILogService
	) {}

	/**
	 * Implement WebviewViewProvider.resolveWebviewView (sidebar host)
	 */
	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void | Thenable<void> {
		this.logService.info('Resolving sidebar WebView view');

		this.registerWebview(webviewView.webview, {
			host: 'sidebar',
			page: 'chat'
		});

		// Clean up webview references on dispose (matching editor panel pattern)
		const webviewRef = webviewView.webview;
		webviewView.onDidDispose(
			() => {
				this.webviews.delete(webviewRef);
				this.webviewConfigs.delete(webviewRef);
				this.logService.info('Sidebar WebView disposed');
			},
			undefined,
			this.context.subscriptions
		);

		this.logService.info('Sidebar WebView resolved');
	}

	/**
	 * Get current WebView instance
	 * For multi-WebView scenarios, returns any available instance (currently only used for resource URIs)
	 */
	getWebView(): vscode.Webview | undefined {
		for (const webview of this.webviews) {
			return webview;
		}
		return undefined;
	}

	/**
	 * Broadcast message to all registered WebViews (Fix #7: with buffering)
	 */
	postMessage(message: any): void {
		// Send to all page === 'chat' WebViews (including sidebar and editor panels)
		// Each WebView filters messages by channelId

		// Fix #7: Buffer messages when no chat webviews available
		const chatWebviews = this.getChatWebviews();
		if (chatWebviews.length === 0) {
			if (this.pendingMessages.length < this.MAX_PENDING_MESSAGES) {
				this.pendingMessages.push(message);
				this.logService.warn(`[WebViewService] No WebView available, message buffered (${this.pendingMessages.length})`);
			} else {
				this.logService.error('[WebViewService] Message buffer full, dropping message');
			}
			return;
		}

		const payload = {
			type: 'from-extension',
			message
		};

		const toRemove: vscode.Webview[] = [];

		for (const webview of chatWebviews) {
			try {
				webview.postMessage(payload);
			} catch (error) {
				this.logService.warn('[WebViewService] Failed to send message to WebView, removing instance', error as Error);
				toRemove.push(webview);
			}
		}

		for (const webview of toRemove) {
			this.webviews.delete(webview);
			this.webviewConfigs.delete(webview);
		}
	}

	/**
	 * Get all chat webviews
	 */
	private getChatWebviews(): vscode.Webview[] {
		const result: vscode.Webview[] = [];
		for (const webview of this.webviews) {
			const config = this.webviewConfigs.get(webview);
			if (config?.page === 'chat') {
				result.push(webview);
			}
		}
		return result;
	}

	/**
	 * Set message receive handler
	 */
	setMessageHandler(handler: (message: any) => void): void {
		this.messageHandler = handler;
	}

	/**
	 * Open (or focus) a page in the main editor
	 */
	openEditorPage(page: string, title: string, instanceId?: string): void {
		const key = instanceId || page;
		const existing = this.editorPanels.get(key);
		if (existing) {
			try {
				existing.reveal(vscode.ViewColumn.Active);
				this.logService.info(`[WebViewService] Reusing existing editor panel: page=${page}, id=${key}`);
				return;
			} catch (error) {
				// May encounter panel already disposed but not yet removed from mapping
				this.logService.warn(
					`[WebViewService] Existing editor panel invalid, recreating: page=${page}, id=${key}`,
					error as Error
				);
				this.editorPanels.delete(key);
			}
		}

		this.logService.info(`[WebViewService] Creating editor WebView panel: page=${page}, id=${key}`);

		const panel = vscode.window.createWebviewPanel(
			'claudix.pageView',
			title,
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.file(path.join(this.context.extensionPath, 'dist')),
					vscode.Uri.file(path.join(this.context.extensionPath, 'resources'))
				]
			}
		);

		// Set panel icon (same as sidebar for consistency)
		panel.iconPath = vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'claude-logo.svg'));

		this.registerWebview(panel.webview, {
			host: 'editor',
			page,
			id: key
		});

		panel.onDidDispose(
			() => {
				this.webviews.delete(panel.webview);
				this.webviewConfigs.delete(panel.webview);
				this.editorPanels.delete(key);
				this.logService.info(`[WebViewService] Editor WebView panel disposed: page=${page}, id=${key}`);
			},
			undefined,
			this.context.subscriptions
		);

		this.editorPanels.set(key, panel);
	}

	/**
	 * Update editor panel title
	 */
	updatePanelTitle(instanceId: string, title: string): void {
		const panel = this.editorPanels.get(instanceId);
		if (!panel) {
			return;
		}

		// Clean and truncate title
		const cleaned = title.replace(/\s+/g, ' ').trim();
		const truncated = cleaned.length > 40 ? cleaned.slice(0, 40) + '…' : cleaned;
		panel.title = truncated || 'Claudix Chat';
	}

	/**
	 * Configure options, message channel and HTML for given WebView
	 */
	private registerWebview(webview: vscode.Webview, bootstrap: WebviewBootstrapConfig): void {
		// Configure WebView options
		webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.file(path.join(this.context.extensionPath, 'dist')),
				vscode.Uri.file(path.join(this.context.extensionPath, 'resources'))
			]
		};

		// Save instance and its config
		this.webviews.add(webview);
		this.webviewConfigs.set(webview, bootstrap);

		// Connect message handler
		webview.onDidReceiveMessage(
			message => {
				this.logService.info(`[WebView → Extension] Received message: ${message.type}`);
				if (this.messageHandler) {
					this.messageHandler(message);
				}
			},
			undefined,
			this.context.subscriptions
		);

		// Set WebView HTML (switches based on dev/production mode)
		webview.html = this.getHtmlForWebview(webview, bootstrap);

		// Fix #7: Flush pending messages when chat webview connects
		if (bootstrap.page === 'chat' && this.pendingMessages.length > 0) {
			this.logService.info(`[WebViewService] Flushing ${this.pendingMessages.length} buffered messages`);
			const pending = this.pendingMessages;
			this.pendingMessages = [];
			for (const msg of pending) {
				this.postMessage(msg);
			}
		}
	}

	/**
	 * Generate WebView HTML
	 */
	private getHtmlForWebview(webview: vscode.Webview, bootstrap: WebviewBootstrapConfig): string {
		const isDev = this.context.extensionMode === vscode.ExtensionMode.Development;
		const nonce = this.getNonce();

		if (isDev) {
			return this.getDevHtml(webview, nonce, bootstrap);
		}

		const extensionUri = vscode.Uri.file(this.context.extensionPath);
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, 'dist', 'media', 'main.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, 'dist', 'media', 'style.css')
		);

		// CSP: 'unsafe-eval' and 'blob:' required for mermaid diagram rendering
		// Mermaid v10+ uses dynamic ESM imports and eval for diagram parsing
		// See: https://github.com/mermaid-js/mermaid/issues/5453
		const csp = [
			`default-src 'none';`,
			`img-src ${webview.cspSource} https: data:;`,
			`style-src ${webview.cspSource} 'unsafe-inline' https://*.vscode-cdn.net;`,
			`font-src ${webview.cspSource} data:;`,
			`script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval' blob:;`,
			`connect-src ${webview.cspSource} https:;`,
			`worker-src ${webview.cspSource} blob:;`,
		].join(' ');

		const bootstrapScript = `
    <script nonce="${nonce}">
      window.CLAUDIX_BOOTSTRAP = ${JSON.stringify(bootstrap)};
    </script>`;

		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claudex Chat</title>
    <link href="${styleUri}" rel="stylesheet" />
    ${bootstrapScript}
</head>
<body>
    <div id="app"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	private getDevHtml(webview: vscode.Webview, nonce: string, bootstrap: WebviewBootstrapConfig): string {
		// Read dev server address (can be overridden via environment variables)
		const devServer = process.env.VITE_DEV_SERVER_URL
			|| process.env.WEBVIEW_DEV_SERVER_URL
			|| `http://localhost:${process.env.VITE_DEV_PORT || 5173}`;

		let origin = '';
		let wsUrl = '';
		try {
			const u = new URL(devServer);
			origin = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
			const wsProtocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
			wsUrl = `${wsProtocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
		} catch {
			origin = devServer; // Fallback (allow as much as possible)
			wsUrl = 'ws://localhost:5173';
		}

		// Dev CSP: allows devServer + HMR websocket
		// 'unsafe-eval' and 'blob:' required for mermaid (see production CSP comment)
		const csp = [
			`default-src 'none';`,
			`img-src ${webview.cspSource} https: data:;`,
			`style-src ${webview.cspSource} 'unsafe-inline' ${origin} https://*.vscode-cdn.net;`,
			`font-src ${webview.cspSource} data: ${origin};`,
			`script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval' ${origin} blob:;`,
			`connect-src ${webview.cspSource} ${origin} ${wsUrl} https:;`,
			`worker-src ${webview.cspSource} blob:;`,
		].join(' ');

		const client = `${origin}/@vite/client`;
		const entry = `${origin}/src/main.ts`;

		const bootstrapScript = `
    <script nonce="${nonce}">
      window.CLAUDIX_BOOTSTRAP = ${JSON.stringify(bootstrap)};
    </script>`;

		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <base href="${origin}/" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claudex Chat (Dev)</title>
    ${bootstrapScript}
</head>
<body>
    <div id="app"></div>
    <script type="module" nonce="${nonce}" src="${client}"></script>
    <script type="module" nonce="${nonce}" src="${entry}"></script>
</body>
</html>`;
	}

	/**
	 * Generate random nonce
	 */
	private getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}
