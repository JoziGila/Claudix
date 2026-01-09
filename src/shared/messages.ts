/**
 * Shared Message Type Definitions
 *
 * Bidirectional communication protocol: Extension ↔ WebView
 */

// Import SDK types
import type {
    SDKMessage,
    SDKUserMessage,
    PermissionResult,
    PermissionUpdate,
    PermissionMode
} from '@anthropic-ai/claude-agent-sdk';

// ============================================================================
// Base Message Types
// ============================================================================

/**
 * Base message class
 */
export interface BaseMessage {
    type: string;
}

// ============================================================================
// WebView → Extension Messages
// ============================================================================

/**
 * Launch Claude session
 */
export interface LaunchClaudeMessage extends BaseMessage {
    type: "launch_claude";
    channelId: string;
    resume?: string | null;        // Resume session ID
    cwd?: string;                  // Working directory
    model?: string | null;         // Model name
    permissionMode?: PermissionMode; // Permission mode
    thinkingLevel?: string | null; // Thinking level (off | default_on)
}

/**
 * Input/Output message (bidirectional)
 */
export interface IOMessage extends BaseMessage {
    type: "io_message";
    channelId: string;
    message: SDKMessage | SDKUserMessage;  // SDK message type
    done: boolean;                         // Whether this is the last message in stream
    panelTitle?: string;                   // Editor panel title (editor host only)
    instanceId?: string;                   // Panel instance ID (editor host only)
}

/**
 * Interrupt Claude
 */
export interface InterruptClaudeMessage extends BaseMessage {
    type: "interrupt_claude";
    channelId: string;
}

/**
 * Close channel (bidirectional)
 */
export interface CloseChannelMessage extends BaseMessage {
    type: "close_channel";
    channelId: string;
    error?: string;
}

// ============================================================================
// Request-Response Messages (bidirectional)
// ============================================================================

/**
 * Request message
 */
export interface RequestMessage<T = any> extends BaseMessage {
    type: "request";
    channelId?: string;
    requestId: string;
    request: T;
}

/**
 * Response message
 */
export interface ResponseMessage<T = any> extends BaseMessage {
    type: "response";
    requestId: string;
    response: T | ErrorResponse;
}

/**
 * Error response
 */
export interface ErrorResponse {
    type: "error";
    error: string;
}

/**
 * Cancel request
 */
export interface CancelRequestMessage extends BaseMessage {
    type: "cancel_request";
    targetRequestId: string;
}

// ============================================================================
// WebView → Extension Request Types
// ============================================================================

/**
 * Init request
 */
export interface InitRequest {
    type: "init";
}

export interface InitResponse {
    type: "init_response";
    state: {
        defaultCwd: string;
        openNewInTab: boolean;
        // authStatus: null | { authenticated: boolean };
        modelSetting: string;
        platform: string;
        thinkingLevel?: string;        // Thinking level (off | default_on)
    };
}

/**
 * Open file request
 */
export interface OpenFileRequest {
    type: "open_file";
    filePath: string;
    location?: {
        startLine?: number;
        endLine?: number;
        startColumn?: number;
        endColumn?: number;
    };
}

export interface OpenFileResponse {
    type: "open_file_response";
}

/**
 * Open Diff request
 */
export interface OpenDiffRequest {
    type: "open_diff";
    originalFilePath: string;
    newFilePath: string;
    edits: Array<{
        oldString: string;
        newString: string;
        replaceAll?: boolean;
    }>;
    supportMultiEdits: boolean;
}

export interface OpenDiffResponse {
    type: "open_diff_response";
    newEdits: Array<{
        oldString: string;
        newString: string;
        replaceAll?: boolean;
    }>;
}

/**
 * Set permission mode
 */
export interface SetPermissionModeRequest {
    type: "set_permission_mode";
    mode: PermissionMode;
}

export interface SetPermissionModeResponse {
    type: "set_permission_mode_response";
    success: boolean;
}

/**
 * Model option
 */
export interface ModelOption {
    value: string;
    label?: string;
    description?: string;
    provider?: string;
}

/**
 * Set model
 */
export interface SetModelRequest {
    type: "set_model";
    model: ModelOption;
}

export interface SetModelResponse {
    type: "set_model_response";
    success: boolean;
}

/**
 * Set Thinking Level
 */
export interface SetThinkingLevelRequest {
    type: "set_thinking_level";
    channelId: string;
    thinkingLevel: string;  // "off" | "default_on"
}

export interface SetThinkingLevelResponse {
    type: "set_thinking_level_response";
}

/**
 * Get Claude state
 */
export interface GetClaudeStateRequest {
    type: "get_claude_state";
}

export interface GetClaudeStateResponse {
    type: "get_claude_state_response";
    config: any;
}

/**
 * Get MCP servers
 */
export interface GetMcpServersRequest {
    type: "get_mcp_servers";
}

export interface GetMcpServersResponse {
    type: "get_mcp_servers_response";
    mcpServers: Array<{ name: string; status: string }>;
}

/**
 * Get asset URIs
 */
export interface GetAssetUrisRequest {
    type: "get_asset_uris";
}

export interface GetAssetUrisResponse {
    type: "asset_uris_response";
    assetUris: any;
}

/**
 * List sessions
 */
export interface ListSessionsRequest {
    type: "list_sessions_request";
}

export interface ListSessionsResponse {
    type: "list_sessions_response";
    sessions: Array<{
        id: string;
        lastModified: number;
        messageCount: number;
        summary: string;
        worktree?: string;
        isCurrentWorkspace: boolean;
    }>;
}

/**
 * Get session details
 */
export interface GetSessionRequest {
    type: "get_session_request";
    sessionId: string;
}

export interface GetSessionResponse {
    type: "get_session_response";
    messages: any[];
}

/**
 * Execute command
 */
export interface ExecRequest {
    type: "exec";
    command: string;
    params: string[];
}

export interface ExecResponse {
    type: "exec_response";
    stdout: string;
    stderr: string;
    exitCode: number;
}

/**
 * List files
 */
export interface ListFilesRequest {
    type: "list_files_request";
    pattern?: string;
}

export interface ListFilesResponse {
    type: "list_files_response";
    files: Array<{
        path: string;
        name: string;
        type: "file" | "directory";
    }>;
}

/**
 * Get path type (file / directory)
 */
export interface StatPathRequest {
    type: "stat_path_request";
    /**
     * Path array, can be workspace relative paths or absolute paths
     */
    paths: string[];
}

export interface StatPathResponse {
    type: "stat_path_response";
    entries: Array<{
        path: string;
        /**
         * File type: file / directory / other / not_found
         */
        type: "file" | "directory" | "other" | "not_found";
    }>;
}

/**
 * Open content (temporary file)
 */
export interface OpenContentRequest {
    type: "open_content";
    content: string;
    fileName: string;
    editable: boolean;
}

export interface OpenContentResponse {
    type: "open_content_response";
    updatedContent?: string;
}

/**
 * Current selection
 */
export interface SelectionRange {
    filePath: string;
    startLine: number;
    endLine: number;
    startColumn?: number;
    endColumn?: number;
    selectedText: string;
}

export interface GetCurrentSelectionRequest {
    type: "get_current_selection";
}

export interface GetCurrentSelectionResponse {
    type: "get_current_selection_response";
    selection: SelectionRange | null;
}

/**
 * Open URL
 */
export interface OpenURLRequest {
    type: "open_url";
    url: string;
}

export interface OpenURLResponse {
    type: "open_url_response";
}

/**
 * Show notification
 */
export interface ShowNotificationRequest {
    type: "show_notification";
    message: string;
    severity: "info" | "warning" | "error";
    buttons?: string[];
    onlyIfNotVisible?: boolean;
}

export interface ShowNotificationResponse {
    type: "show_notification_response";
    buttonValue?: string;
}

/**
 * New conversation tab
 */
export interface NewConversationTabRequest {
    type: "new_conversation_tab";
    initialPrompt?: string;
}

export interface NewConversationTabResponse {
    type: "new_conversation_tab_response";
}

/**
 * Rename tab
 */
export interface RenameTabRequest {
    type: "rename_tab";
    title: string;
}

export interface RenameTabResponse {
    type: "rename_tab_response";
}

/**
 * Get auth status
 */
// export interface GetAuthStatusRequest {
//     type: "get_auth_status";
// }

// export interface GetAuthStatusResponse {
//     type: "get_auth_status_response";
//     status: null | { authenticated: boolean };
// }

/**
 * Login request
 */
// export interface LoginRequest {
//     type: "login";
//     method: "claude.ai" | "console.anthropic.com";
// }

// export interface LoginResponse {
//     type: "login_response";
//     auth: {
//         authenticated: boolean;
//         apiKey?: string;
//     };
// }

/**
 * Submit OAuth code
 */
// export interface SubmitOAuthCodeRequest {
//     type: "submit_oauth_code";
//     code: string;
// }

// export interface SubmitOAuthCodeResponse {
//     type: "submit_oauth_code_response";
// }

/**
 * Open config file
 */
export interface OpenConfigFileRequest {
    type: "open_config_file";
    configType: string;
}

export interface OpenConfigFileResponse {
    type: "open_config_file_response";
}

/**
 * Open Claude in terminal
 */
export interface OpenClaudeInTerminalRequest {
    type: "open_claude_in_terminal";
}

export interface OpenClaudeInTerminalResponse {
    type: "open_claude_in_terminal_response";
}

/**
 * Auth URL notification (Extension → WebView)
 */
// export interface AuthURLRequest {
//     type: "auth_url";
//     url: string;
//     method: string;
// }

// ============================================================================
// Extension → WebView Request Types
// ============================================================================

/**
 * Tool permission request
 */
export interface ToolPermissionRequest {
    type: "tool_permission_request";
    toolName: string;
    inputs: Record<string, unknown>;
    suggestions: PermissionUpdate[];
}

export interface ToolPermissionResponse {
    type: "tool_permission_response";
    result: PermissionResult;
}

/**
 * @ mention insertion
 */
export interface InsertAtMentionRequest {
    type: "insert_at_mention";
    text: string;
}

/**
 * Selection change notification
 */
export interface SelectionChangedRequest {
    type: "selection_changed";
    selection: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

/**
 * State update
 */
export interface UpdateStateRequest {
    type: "update_state";
    // Aligned with init_response.state to ensure consistency
    state: InitResponse['state'];
    // Claude config object from backend
    config: GetClaudeStateResponse['config'];
}

// ============================================================================
// Union Types
// ============================================================================

/**
 * All WebView → Extension messages
 */
export type WebViewToExtensionMessage =
    | LaunchClaudeMessage
    | IOMessage
    | InterruptClaudeMessage
    | CloseChannelMessage
    | RequestMessage
    | ResponseMessage
    | CancelRequestMessage;

/**
 * All Extension → WebView messages
 */
export type ExtensionToWebViewMessage =
    | IOMessage
    | CloseChannelMessage
    | RequestMessage
    | ResponseMessage;

/**
 * Extension message wrapper format
 */
export interface FromExtensionWrapper {
    type: "from-extension";
    message: ExtensionToWebViewMessage;
}

// ============================================================================
// Request and Response Union Types
// ============================================================================

/**
 * All WebView → Extension request types
 */
export type WebViewRequest =
    | InitRequest
    | OpenFileRequest
    | OpenDiffRequest
    | OpenContentRequest
    | SetPermissionModeRequest
    | SetModelRequest
    | SetThinkingLevelRequest
    | GetCurrentSelectionRequest
    | ShowNotificationRequest
    | NewConversationTabRequest
    | RenameTabRequest
    | GetClaudeStateRequest
    | GetMcpServersRequest
    | GetAssetUrisRequest
    | ListSessionsRequest
    | GetSessionRequest
    | ExecRequest
    | ListFilesRequest
    | OpenURLRequest
    | StatPathRequest
    // | GetAuthStatusRequest
    // | LoginRequest
    // | SubmitOAuthCodeRequest
    | OpenConfigFileRequest
    | OpenClaudeInTerminalRequest;

/**
 * All Extension → WebView response types
 */
export type WebViewRequestResponse =
    | InitResponse
    | OpenFileResponse
    | OpenDiffResponse
    | OpenContentResponse
    | SetPermissionModeResponse
    | SetModelResponse
    | SetThinkingLevelResponse
    | GetCurrentSelectionResponse
    | ShowNotificationResponse
    | NewConversationTabResponse
    | RenameTabResponse
    | GetClaudeStateResponse
    | GetMcpServersResponse
    | GetAssetUrisResponse
    | ListSessionsResponse
    | GetSessionResponse
    | ExecResponse
    | ListFilesResponse
    | OpenURLResponse
    | StatPathResponse
    // | GetAuthStatusResponse
    // | LoginResponse
    // | SubmitOAuthCodeResponse
    | OpenConfigFileResponse
    | OpenClaudeInTerminalResponse;

/**
 * All Extension → WebView request types
 */
export type ExtensionRequest =
    | ToolPermissionRequest
    | InsertAtMentionRequest
    | SelectionChangedRequest
    | UpdateStateRequest
    | VisibilityChangedRequest;
    // | AuthURLRequest;

/**
 * Visibility change (Extension → WebView)
 *
 * Original code: Analyze/extension.unpack.js:2648-2656
 */
export interface VisibilityChangedRequest {
    type: "visibility_changed";
    isVisible: boolean;
}

/**
 * All WebView → Extension response types
 */
export type ExtensionRequestResponse =
    | ToolPermissionResponse;
