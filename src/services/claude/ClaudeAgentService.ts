/**
 * ClaudeAgentService - Claude Agent Core Orchestration Service
 *
 * Responsibilities:
 * 1. Manage multiple Claude sessions (channels)
 * 2. Receive and dispatch messages from Transport
 * 3. Start and control Claude sessions (launchClaude, interruptClaude)
 * 4. Route requests to corresponding handlers
 * 5. RPC request-response management
 *
 * Dependencies:
 * - IClaudeSdkService: SDK calls
 * - IClaudeSessionService: Session history
 * - ILogService: Logging
 * - Other base services
 */

import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import { IWorkspaceService } from '../workspaceService';
import { IFileSystemService } from '../fileSystemService';
import { INotificationService } from '../notificationService';
import { ITerminalService } from '../terminalService';
import { ITabsAndEditorsService } from '../tabsAndEditorsService';
import { IClaudeSdkService } from './ClaudeSdkService';
import { IClaudeSessionService } from './ClaudeSessionService';
import { AsyncStream, ResilientMessageQueue, ITransport } from './transport';
import { HandlerContext } from './handlers/types';
import { IWebViewService } from '../webViewService';
import { withTimeout, getTimeoutForRequest, TimeoutError } from '../../shared/timeout';

// Message type imports
import type {
    WebViewToExtensionMessage,
    ExtensionToWebViewMessage,
    RequestMessage,
    ResponseMessage,
    ExtensionRequest,
    ToolPermissionRequest,
    ToolPermissionResponse,
} from '../../shared/messages';

// SDK type imports
import type {
    SDKMessage,
    SDKUserMessage,
    Query,
    PermissionResult,
    PermissionUpdate,
    CanUseTool,
    PermissionMode,
} from '@anthropic-ai/claude-agent-sdk';

// Handler imports
import {
    handleInit,
    handleGetClaudeState,
    handleGetMcpServers,
    handleGetAssetUris,
    handleOpenFile,
    handleGetCurrentSelection,
    handleShowNotification,
    handleNewConversationTab,
    handleRenameTab,
    handleOpenDiff,
    handleListSessions,
    handleGetSession,
    handleExec,
    handleListFiles,
    handleStatPath,
    handleOpenContent,
    handleOpenURL,
    handleOpenConfigFile,
    // handleOpenClaudeInTerminal,
    // handleGetAuthStatus,
    // handleLogin,
    // handleSubmitOAuthCode,
} from './handlers/handlers';

export const IClaudeAgentService = createDecorator<IClaudeAgentService>('claudeAgentService');

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Channel object: manages a single Claude session
 */
export interface Channel {
    in: AsyncStream<SDKUserMessage>;  // Input stream: send user messages to SDK
    query: Query;                      // Query object: receive responses from SDK
}

/**
 * Request handler
 */
interface RequestHandler {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
}

/**
 * Claude Agent service interface
 */
export interface IClaudeAgentService {
    readonly _serviceBrand: undefined;

    /**
     * Set Transport
     */
    setTransport(transport: ITransport): void;

    /**
     * Start message loop
     */
    start(): void;

    /**
     * Receive message from client
     */
    fromClient(message: WebViewToExtensionMessage): Promise<void>;

    /**
     * Start Claude session
     */
    launchClaude(
        channelId: string,
        resume: string | null,
        cwd: string,
        model: string | null,
        permissionMode: string,
        thinkingLevel: string | null
    ): Promise<void>;

    /**
     * Interrupt Claude session
     */
    interruptClaude(channelId: string): Promise<void>;

    /**
     * Close session
     */
    closeChannel(channelId: string, sendNotification: boolean, error?: string): Promise<void>;

    /**
     * Close all sessions
     */
    closeAllChannels(): Promise<void>;

    /**
     * Close all channels on credential change
     */
    closeAllChannelsWithCredentialChange(): Promise<void>;

    /**
     * Process request
     */
    processRequest(request: RequestMessage, signal: AbortSignal): Promise<unknown>;

    /**
     * Set permission mode
     */
    setPermissionMode(channelId: string, mode: PermissionMode): Promise<void>;

    /**
     * Set Thinking Level
     */
    setThinkingLevel(channelId: string, level: string): Promise<void>;

    /**
     * Set model
     */
    setModel(channelId: string, model: string): Promise<void>;

    /**
     * Shutdown
     */
    shutdown(): Promise<void>;
}

// ============================================================================
// ClaudeAgentService Implementation
// ============================================================================

/**
 * Claude Agent service implementation
 */
export class ClaudeAgentService implements IClaudeAgentService {
    readonly _serviceBrand: undefined;

    // Transport adapter
    private transport?: ITransport;

    // Session management
    private channels = new Map<string, Channel>();

    // Message queue from client (resilient - can recover from errors)
    private messageQueue = new ResilientMessageQueue<WebViewToExtensionMessage>();

    // Pending request handlers
    private outstandingRequests = new Map<string, RequestHandler>();

    // Abort controllers
    private abortControllers = new Map<string, AbortController>();

    // Track active forwarding loops for cleanup (Fix #3)
    private forwardingLoops = new Map<string, { promise: Promise<void>; abort: AbortController }>();

    // Handler 上下文（缓存）
    private handlerContext: HandlerContext;

    // Thinking Level 配置
    private thinkingLevel: string = 'default_on';

    constructor(
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService,
        @IWorkspaceService private readonly workspaceService: IWorkspaceService,
        @IFileSystemService private readonly fileSystemService: IFileSystemService,
        @INotificationService private readonly notificationService: INotificationService,
        @ITerminalService private readonly terminalService: ITerminalService,
        @ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
        @IClaudeSdkService private readonly sdkService: IClaudeSdkService,
        @IClaudeSessionService private readonly sessionService: IClaudeSessionService,
        @IWebViewService private readonly webViewService: IWebViewService
    ) {
        // Build handler context
        this.handlerContext = {
            logService: this.logService,
            configService: this.configService,
            workspaceService: this.workspaceService,
            fileSystemService: this.fileSystemService,
            notificationService: this.notificationService,
            terminalService: this.terminalService,
            tabsAndEditorsService: this.tabsAndEditorsService,
            sessionService: this.sessionService,
            sdkService: this.sdkService,
            agentService: this,  // Self reference
            webViewService: this.webViewService,
        };
    }

    /**
     * Set Transport
     */
    setTransport(transport: ITransport): void {
        this.transport = transport;

        // Listen for messages from client and push to queue
        transport.onMessage(async (message) => {
            await this.fromClient(message);
        });

        this.logService.info('[ClaudeAgentService] Transport connected');
    }

    /**
     * Start message loop
     */
    start(): void {
        // Start message loop
        this.readFromClient();

        this.logService.info('[ClaudeAgentService] Message loop started');
    }

    /**
     * Receive message from client
     */
    async fromClient(message: WebViewToExtensionMessage): Promise<void> {
        this.messageQueue.enqueue(message);
    }

    /**
     * Read and dispatch messages from client (resilient loop - continues on individual message errors)
     */
    private async readFromClient(): Promise<void> {
        while (true) {
            try {
                const message = await this.messageQueue.dequeue();
                if (message === null) {
                    // Queue closed - exit loop
                    this.logService.info('[ClaudeAgentService] Message queue closed, stopping loop');
                    break;
                }

                await this.processMessage(message);
            } catch (error) {
                // Log error but continue processing - don't break the loop
                this.logService.error(`[ClaudeAgentService] Error processing message: ${error}`);
            }
        }
    }

    /**
     * Process single message
     */
    private async processMessage(message: WebViewToExtensionMessage): Promise<void> {
        switch (message.type) {
            case "launch_claude":
                await this.launchClaude(
                    message.channelId,
                    message.resume || null,
                    message.cwd || this.getCwd(),
                    message.model || null,
                    message.permissionMode || "default",
                    message.thinkingLevel || null
                );
                break;

            case "close_channel":
                await this.closeChannel(message.channelId, false);
                break;

            case "interrupt_claude":
                await this.interruptClaude(message.channelId);
                break;

            case "io_message":
                this.transportMessage(
                    message.channelId,
                    message.message,
                    message.done
                );
                break;

            case "request":
                this.handleRequest(message);
                break;

            case "response":
                this.handleResponse(message);
                break;

            case "cancel_request":
                this.handleCancellation(message.targetRequestId);
                break;

            default:
                this.logService.error(`Unknown message type: ${(message as { type: string }).type}`);
        }
    }

    /**
     * Start Claude session
     */
    async launchClaude(
        channelId: string,
        resume: string | null,
        cwd: string,
        model: string | null,
        permissionMode: string,
        thinkingLevel: string | null
    ): Promise<void> {
        // Save thinkingLevel
        if (thinkingLevel) {
            this.thinkingLevel = thinkingLevel;
        }

        // Calculate maxThinkingTokens
        const maxThinkingTokens = this.getMaxThinkingTokens(this.thinkingLevel);

        this.logService.info('');
        this.logService.info('╔════════════════════════════════════════╗');
        this.logService.info('║  Starting Claude Session               ║');
        this.logService.info('╚════════════════════════════════════════╝');
        this.logService.info(`  Channel ID: ${channelId}`);
        this.logService.info(`  Resume: ${resume || 'null'}`);
        this.logService.info(`  CWD: ${cwd}`);
        this.logService.info(`  Model: ${model || 'null'}`);
        this.logService.info(`  Permission: ${permissionMode}`);
        this.logService.info(`  Thinking Level: ${this.thinkingLevel}`);
        this.logService.info(`  Max Thinking Tokens: ${maxThinkingTokens}`);
        this.logService.info('');

        // Check if channel already exists
        if (this.channels.has(channelId)) {
            this.logService.error(`❌ Channel already exists: ${channelId}`);
            throw new Error(`Channel already exists: ${channelId}`);
        }

        try {
            // 1. Create input stream
            this.logService.info('📝 Step 1: Creating input stream');
            const inputStream = new AsyncStream<SDKUserMessage>();
            this.logService.info('  ✓ Input stream created');

            // 2. Call spawnClaude
            this.logService.info('');
            this.logService.info('📝 Step 2: Calling spawnClaude()');
            const query = await this.spawnClaude(
                inputStream,
                resume,
                async (toolName, input, options) => {
                    // Tool permission callback: request WebView confirmation via RPC
                    this.logService.info(`🔧 Tool permission request: ${toolName}`);
                    return this.requestToolPermission(
                        channelId,
                        toolName,
                        input,
                        options.suggestions || []
                    );
                },
                model,
                cwd,
                permissionMode,
                maxThinkingTokens
            );
            this.logService.info('  ✓ spawnClaude() complete, Query object created');

            // 3. Store in channels Map
            this.logService.info('');
            this.logService.info('📝 Step 3: Registering channel');
            this.channels.set(channelId, {
                in: inputStream,
                query: query
            });
            this.logService.info(`  ✓ Channel registered, ${this.channels.size} active sessions`);

            // 4. Start listener task: forward SDK output to client (tracked with AbortController)
            this.logService.info('');
            this.logService.info('📝 Step 4: Starting message forwarding loop');
            this.startMessageForwarding(channelId, query);

            this.logService.info('');
            this.logService.info('✓ Claude session started successfully');
            this.logService.info('════════════════════════════════════════');
            this.logService.info('');
        } catch (error) {
            this.logService.error('');
            this.logService.error('❌❌❌ Claude session startup failed ❌❌❌');
            this.logService.error(`Channel: ${channelId}`);
            this.logService.error(`Error: ${error}`);
            if (error instanceof Error) {
                this.logService.error(`Stack: ${error.stack}`);
            }
            this.logService.error('════════════════════════════════════════');
            this.logService.error('');

            await this.closeChannel(channelId, true, String(error));
            throw error;
        }
    }

    /**
     * Interrupt Claude session
     */
    async interruptClaude(channelId: string): Promise<void> {
        const channel = this.channels.get(channelId);
        if (!channel) {
            this.logService.warn(`[ClaudeAgentService] Channel does not exist: ${channelId}`);
            return;
        }

        try {
            await this.sdkService.interrupt(channel.query);
            this.logService.info(`[ClaudeAgentService] Channel interrupted: ${channelId}`);
        } catch (error) {
            this.logService.error(`[ClaudeAgentService] Interrupt failed:`, error);
        }
    }

    /**
     * Close session (Fix #5: async with proper cleanup)
     */
    async closeChannel(channelId: string, sendNotification: boolean, error?: string): Promise<void> {
        this.logService.info(`[ClaudeAgentService] Closing channel: ${channelId}`);

        // 1. Abort any active forwarding loop and wait for cleanup (Fix #3 + #5)
        const forwardingLoop = this.forwardingLoops.get(channelId);
        if (forwardingLoop) {
            forwardingLoop.abort.abort();
            // Wait for loop to finish cleanup
            await forwardingLoop.promise.catch(() => {});
            this.forwardingLoops.delete(channelId);
        }

        // 2. Send close notification
        if (sendNotification && this.transport) {
            this.transport.send({
                type: "close_channel",
                channelId,
                error
            });
        }

        // 3. Clean up channel
        const channel = this.channels.get(channelId);
        if (channel) {
            channel.in.done();
            try {
                await channel.query.return?.();
            } catch (e) {
                this.logService.warn(`Error cleaning up channel: ${e}`);
            }
            this.channels.delete(channelId);
        }

        this.logService.info(`  ✓ Channel closed, ${this.channels.size} active sessions remaining`);
    }

    /**
     * Start message forwarding loop with tracking (Fix #3)
     */
    private startMessageForwarding(channelId: string, query: Query): void {
        const abortController = new AbortController();

        const forwardingPromise = this.runMessageForwardingLoop(
            channelId,
            query,
            abortController.signal
        );

        this.forwardingLoops.set(channelId, {
            promise: forwardingPromise,
            abort: abortController
        });

        // Clean up when done
        forwardingPromise.finally(() => {
            this.forwardingLoops.delete(channelId);
        });
    }

    /**
     * Run the message forwarding loop (Fix #3)
     */
    private async runMessageForwardingLoop(
        channelId: string,
        query: Query,
        signal: AbortSignal
    ): Promise<void> {
        let messageCount = 0;

        try {
            this.logService.info(`  → Starting to listen to Query output...`);

            for await (const message of query) {
                if (signal.aborted) {
                    this.logService.info(`  ⏹ Forwarding loop aborted: ${channelId}`);
                    break;
                }

                messageCount++;
                this.logService.info(`  ← Received message #${messageCount}: ${message.type}`);

                if (this.transport) {
                    this.transport.send({
                        type: "io_message",
                        channelId,
                        message,
                        done: false
                    });
                }
            }

            // Normal completion
            if (!signal.aborted) {
                this.logService.info(`  ✓ Query output complete, ${messageCount} messages total`);
                await this.closeChannel(channelId, true);
            }
        } catch (error) {
            // Error occurred
            if (!signal.aborted) {
                this.logService.error(`  ❌ Query output error: ${error}`);
                if (error instanceof Error) {
                    this.logService.error(`     Stack: ${error.stack}`);
                }
                await this.closeChannel(channelId, true, String(error));
            }
        }
    }

    /**
     * Start Claude SDK
     *
     * @param inputStream Input stream for sending user messages
     * @param resume Resume session ID
     * @param canUseTool Tool permission callback
     * @param model Model name
     * @param cwd Working directory
     * @param permissionMode Permission mode
     * @param maxThinkingTokens Maximum thinking tokens
     * @returns SDK Query object
     */
    protected async spawnClaude(
        inputStream: AsyncStream<SDKUserMessage>,
        resume: string | null,
        canUseTool: CanUseTool,
        model: string | null,
        cwd: string,
        permissionMode: string,
        maxThinkingTokens: number
    ): Promise<Query> {
        return this.sdkService.query({
            inputStream,
            resume,
            canUseTool,
            model,
            cwd,
            permissionMode,
            maxThinkingTokens
        });
    }

    /**
     * Close all sessions
     */
    async closeAllChannels(): Promise<void> {
        const promises = Array.from(this.channels.keys()).map(channelId =>
            this.closeChannel(channelId, false)
        );
        await Promise.all(promises);
        this.channels.clear();
    }

    /**
     * Close all channels on credential change
     */
    async closeAllChannelsWithCredentialChange(): Promise<void> {
        const promises = Array.from(this.channels.keys()).map(channelId =>
            this.closeChannel(channelId, true)
        );
        await Promise.all(promises);
        this.channels.clear();
    }

    /**
     * Transport message to channel
     */
    private transportMessage(
        channelId: string,
        message: SDKMessage | SDKUserMessage,
        done: boolean
    ): void {
        const channel = this.channels.get(channelId);
        if (!channel) {
            throw new Error(`Channel not found: ${channelId}`);
        }

        // Add user message to input stream
        if (message.type === "user") {
            channel.in.enqueue(message as SDKUserMessage);
        }

        // If marked as done, close input stream
        if (done) {
            channel.in.done();
        }
    }

    /**
     * Handle request from client
     */
    private async handleRequest(message: RequestMessage): Promise<void> {
        const abortController = new AbortController();
        this.abortControllers.set(message.requestId, abortController);

        try {
            const response = await this.processRequest(message, abortController.signal);
            this.ensureTransport().send({
                type: "response",
                requestId: message.requestId,
                response
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.ensureTransport().send({
                type: "response",
                requestId: message.requestId,
                response: {
                    type: "error",
                    error: errorMsg
                }
            });
        } finally {
            this.abortControllers.delete(message.requestId);
        }
    }

    /**
     * Process request
     */
    async processRequest(message: RequestMessage, signal: AbortSignal): Promise<unknown> {
        const request = message.request;
        const channelId = message.channelId;

        if (!request || typeof request !== 'object' || !('type' in request)) {
            throw new Error('Invalid request format');
        }

        this.logService.info(`[ClaudeAgentService] Processing request: ${request.type}`);

        // Route table: map request types to handlers
        switch (request.type) {
            // Initialization and state
            case "init":
                return handleInit(request, this.handlerContext);

            case "get_claude_state":
                return handleGetClaudeState(request, this.handlerContext);

            case "get_mcp_servers":
                return handleGetMcpServers(request, this.handlerContext, channelId);

            case "get_asset_uris":
                return handleGetAssetUris(request, this.handlerContext);

            // Editor operations
            case "open_file":
                return handleOpenFile(request, this.handlerContext);

            case "get_current_selection":
                return handleGetCurrentSelection(this.handlerContext);

            case "open_diff":
                return handleOpenDiff(request, this.handlerContext, signal);

            case "open_content":
                return handleOpenContent(request, this.handlerContext, signal);

            // UI operations
            case "show_notification":
                return handleShowNotification(request, this.handlerContext);

            case "new_conversation_tab":
                return handleNewConversationTab(request, this.handlerContext);

            case "rename_tab":
                return handleRenameTab(request, this.handlerContext);

            case "open_url":
                return handleOpenURL(request, this.handlerContext);

            // Settings
            case "set_permission_mode": {
                if (!channelId) {
                    throw new Error('channelId is required for set_permission_mode');
                }
                const permReq = request as any;
                await this.setPermissionMode(channelId, permReq.mode);
                return {
                    type: "set_permission_mode_response",
                    success: true
                };
            }

            case "set_model": {
                if (!channelId) {
                    throw new Error('channelId is required for set_model');
                }
                const modelReq = request as any;
                const targetModel = modelReq.model?.value ?? "";
                if (!targetModel) {
                    throw new Error("Invalid model selection");
                }
                await this.setModel(channelId, targetModel);
                return {
                    type: "set_model_response",
                    success: true
                };
            }

            case "set_thinking_level": {
                if (!channelId) {
                    throw new Error('channelId is required for set_thinking_level');
                }
                const thinkReq = request as any;
                await this.setThinkingLevel(channelId, thinkReq.thinkingLevel);
                return {
                    type: "set_thinking_level_response"
                };
            }

            case "open_config_file":
                return handleOpenConfigFile(request, this.handlerContext);

            // Session management
            case "list_sessions_request":
                return handleListSessions(request, this.handlerContext);

            case "get_session_request":
                return handleGetSession(request, this.handlerContext);

        // File operations
        case "list_files_request":
            return handleListFiles(request, this.handlerContext);

        case "stat_path_request":
            return handleStatPath(request as any, this.handlerContext);

            // Process operations
            case "exec":
                return handleExec(request, this.handlerContext);

            // case "open_claude_in_terminal":
            //     return handleOpenClaudeInTerminal(request, this.handlerContext);

            // Authentication
            // case "get_auth_status":
            //     return handleGetAuthStatus(request, this.handlerContext);

            // case "login":
            //     return handleLogin(request, this.handlerContext);

            // case "submit_oauth_code":
            //     return handleSubmitOAuthCode(request, this.handlerContext);

            default:
                throw new Error(`Unknown request type: ${request.type}`);
        }
    }

    /**
     * Handle response
     */
    private handleResponse(message: ResponseMessage): void {
        const handler = this.outstandingRequests.get(message.requestId);
        if (handler) {
            const response = message.response;
            if (typeof response === 'object' && response !== null && 'type' in response && response.type === "error") {
                handler.reject(new Error((response as { error: string }).error));
            } else {
                handler.resolve(response);
            }
            this.outstandingRequests.delete(message.requestId);
        } else {
            this.logService.warn(`[ClaudeAgentService] Request handler not found: ${message.requestId}`);
        }
    }

    /**
     * Handle cancellation
     */
    private handleCancellation(requestId: string): void {
        const abortController = this.abortControllers.get(requestId);
        if (abortController) {
            abortController.abort();
            this.abortControllers.delete(requestId);
        }
    }

    /**
     * Send request to client (ISSUE-003: with timeout)
     *
     * @param channelId - Channel ID
     * @param request - Request to send
     * @param timeoutMs - Optional timeout override (default based on request type)
     */
    protected async sendRequest<TRequest extends ExtensionRequest, TResponse>(
        channelId: string,
        request: TRequest,
        timeoutMs?: number
    ): Promise<TResponse> {
        const requestId = this.generateId();
        const timeout = timeoutMs ?? getTimeoutForRequest(request.type);

        const requestPromise = new Promise<TResponse>((resolve, reject) => {
            // Register Promise handlers
            this.outstandingRequests.set(requestId, { resolve, reject });

            // Send request
            this.ensureTransport().send({
                type: "request",
                channelId,
                requestId,
                request
            } as RequestMessage);
        });

        try {
            return await withTimeout(requestPromise, timeout);
        } catch (error) {
            // Clean up on timeout or error
            this.outstandingRequests.delete(requestId);

            if (error instanceof TimeoutError) {
                this.logService.warn(`[ClaudeAgentService] Request ${request.type} timed out after ${timeout}ms`);
                throw new Error(`Request to channel ${channelId} timed out after ${timeout}ms`);
            }
            throw error;
        } finally {
            // Cleanup
            this.outstandingRequests.delete(requestId);
        }
    }

    /**
     * Request tool permission
     */
    protected async requestToolPermission(
        channelId: string,
        toolName: string,
        inputs: Record<string, unknown>,
        suggestions: PermissionUpdate[]
    ): Promise<PermissionResult> {
        const request: ToolPermissionRequest = {
            type: "tool_permission_request",
            toolName,
            inputs,
            suggestions
        };

        const response = await this.sendRequest<ToolPermissionRequest, ToolPermissionResponse>(
            channelId,
            request
        );

        return response.result;
    }

    /**
     * Shutdown service (ISSUE-002)
     *
     * Clean up all resources:
     * - Close all active channels
     * - Stop message loop
     * - Reject outstanding requests
     * - Cancel pending operations
     */
    async shutdown(): Promise<void> {
        this.logService.info('[ClaudeAgentService] Shutting down...');

        // 1. Close all channels
        await this.closeAllChannels();

        // 2. Stop message loop
        this.messageQueue.close();

        // 3. Reject all outstanding requests
        for (const [requestId, handler] of this.outstandingRequests) {
            handler.reject(new Error('Extension shutting down'));
            this.logService.info(`[ClaudeAgentService] Rejected request: ${requestId}`);
        }
        this.outstandingRequests.clear();

        // 4. Abort all pending operations
        for (const [requestId, controller] of this.abortControllers) {
            controller.abort();
            this.logService.info(`[ClaudeAgentService] Aborted operation: ${requestId}`);
        }
        this.abortControllers.clear();

        this.logService.info('[ClaudeAgentService] Shutdown complete');
    }

    // ========================================================================
    // Utility Methods
    // ========================================================================

    /**
     * Ensure transport is initialized (Fix #4)
     * @throws Error if transport not set
     */
    private ensureTransport(): ITransport {
        if (!this.transport) {
            throw new Error('[ClaudeAgentService] Transport not initialized. Call setTransport() first.');
        }
        return this.transport;
    }

    /**
     * Generate unique ID
     */
    private generateId(): string {
        return Math.random().toString(36).substring(2, 15);
    }

    /**
     * Get current working directory
     */
    private getCwd(): string {
        return this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    }

    /**
     * Get maxThinkingTokens (based on thinking level)
     */
    private getMaxThinkingTokens(level: string): number {
        return level === 'off' ? 0 : 31999;
    }

    /**
     * Set thinking level
     */
    async setThinkingLevel(channelId: string, level: string): Promise<void> {
        this.thinkingLevel = level;

        // Update running channel
        const channel = this.channels.get(channelId);
        if (channel?.query) {
            const maxTokens = this.getMaxThinkingTokens(level);
            await channel.query.setMaxThinkingTokens(maxTokens);
            this.logService.info(`[setThinkingLevel] Updated channel ${channelId} to ${level} (${maxTokens} tokens)`);
        }
    }

    /**
     * Set permission mode
     */
    async setPermissionMode(channelId: string, mode: PermissionMode): Promise<void> {
        const channel = this.channels.get(channelId);
        if (!channel) {
            this.logService.warn(`[setPermissionMode] Channel ${channelId} not found`);
            throw new Error(`Channel ${channelId} not found`);
        }

        await channel.query.setPermissionMode(mode);
        this.logService.info(`[setPermissionMode] Set channel ${channelId} to mode: ${mode}`);
    }

    /**
     * Set model
     */
    async setModel(channelId: string, model: string): Promise<void> {
        const channel = this.channels.get(channelId);
        if (!channel) {
            this.logService.warn(`[setModel] Channel ${channelId} not found`);
            throw new Error(`Channel ${channelId} not found`);
        }

        // Set model on channel
        await channel.query.setModel(model);

        // Save to configuration
        await this.configService.updateValue('claudix.selectedModel', model);

        this.logService.info(`[setModel] Set channel ${channelId} to model: ${model}`);
    }
}
