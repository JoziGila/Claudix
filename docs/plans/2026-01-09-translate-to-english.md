# Translate Codebase to English Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Translate all Chinese comments, log messages, and documentation to English for code consistency and international collaboration.

**Architecture:** Systematic file-by-file translation, prioritizing files with the most Chinese text first. Translation covers: JSDoc comments, inline comments, log messages, and error messages.

**Tech Stack:** TypeScript, VSCode Extension API

---

## Summary

| Priority | File | Chinese Occurrences |
|----------|------|---------------------|
| 1 | ClaudeAgentService.ts | ~52 |
| 2 | messageUtils.ts | ~38 |
| 3 | ClaudeSessionService.ts | ~29 |
| 4 | messages.ts | ~21 |
| 5 | webViewService.ts | ~21 |
| 6 | BaseTransport.ts | ~18 |
| 7 | handlers.ts | ~16 |
| 8 | ClaudeSdkService.ts | ~15 |
| 9 | fileSystemService.ts | ~11 |
| 10 | configurationService.ts | ~10 |
| 11+ | Other files | ~50 |

---

### Task 1: ClaudeAgentService.ts

**Files:**
- Modify: `src/services/claude/ClaudeAgentService.ts`

**Step 1: Translate file header and interface comments**

Replace Chinese JSDoc with English:

```typescript
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
```

**Step 2: Translate inline comments**

Key translations:
- `// 消息类型导入` → `// Message type imports`
- `// SDK 类型导入` → `// SDK type imports`
- `// Handlers 导入` → `// Handler imports`
- `// 类型定义` → `// Type definitions`
- `// Transport 适配器` → `// Transport adapter`
- `// 会话管理` → `// Session management`
- `// 等待响应的请求` → `// Pending request handlers`
- `// 取消控制器` → `// Abort controllers`

**Step 3: Translate log messages**

Key translations:
- `'启动 Claude 会话'` → `'Starting Claude session'`
- `'Channel 已存在'` → `'Channel already exists'`
- `'步骤 1: 创建输入流'` → `'Step 1: Creating input stream'`
- `'输入流创建完成'` → `'Input stream created'`
- `'调用 spawnClaude()'` → `'Calling spawnClaude()'`
- `'注册 Channel'` → `'Registering channel'`
- `'启动消息转发循环'` → `'Starting message forwarding loop'`
- `'Claude 会话启动成功'` → `'Claude session started successfully'`
- `'Claude 会话启动失败'` → `'Claude session startup failed'`
- `'Channel 不存在'` → `'Channel does not exist'`
- `'已中断 Channel'` → `'Channel interrupted'`
- `'中断失败'` → `'Interrupt failed'`
- `'关闭 Channel'` → `'Closing channel'`
- `'Channel 已关闭，剩余 X 个活跃会话'` → `'Channel closed, X active sessions remaining'`
- `'发送关闭通知'` → `'Sending close notification'`
- `'清理 channel'` → `'Cleaning up channel'`
- `'正常结束'` → `'Normal completion'`
- `'Query 输出完成，共 X 条消息'` → `'Query output complete, X messages total'`
- `'Query 输出错误'` → `'Query output error'`
- `'消息循环已启动'` → `'Message loop started'`
- `'Transport 已连接'` → `'Transport connected'`
- `'处理请求'` → `'Processing request'`
- `'没有找到请求处理器'` → `'Request handler not found'`
- `'工具方法'` → `'Utility methods'`
- `'生成唯一 ID'` → `'Generate unique ID'`
- `'获取当前工作目录'` → `'Get current working directory'`
- `'设置模型到 channel'` → `'Setting model for channel'`
- `'保存到配置'` → `'Saving to configuration'`

**Step 4: Run typecheck**

```bash
npm run typecheck
```

**Step 5: Commit**

```bash
git add src/services/claude/ClaudeAgentService.ts
git commit -m "i18n: translate ClaudeAgentService to English"
```

---

### Task 2: webViewService.ts

**Files:**
- Modify: `src/services/webViewService.ts`

**Step 1: Translate file header**

```typescript
/**
 * WebView Service
 *
 * Responsibilities:
 * 1. Implement vscode.WebviewViewProvider interface
 * 2. Manage WebView instances and lifecycle
 * 3. Generate WebView HTML content
 * 4. Provide message send/receive interface
 */
```

**Step 2: Translate comments and logs**

Key translations:
- `'开始解析侧边栏 WebView 视图'` → `'Resolving sidebar WebView view'`
- `'侧边栏 WebView 视图已销毁'` → `'Sidebar WebView disposed'`
- `'侧边栏 WebView 视图解析完成'` → `'Sidebar WebView resolved'`
- `'当前没有可用的 WebView 实例，消息已缓存'` → `'No WebView available, message buffered'`
- `'消息缓存已满，丢弃消息'` → `'Message buffer full, dropping message'`
- `'向 WebView 发送消息失败，将移除该实例'` → `'Failed to send message to WebView, removing instance'`
- `'刷新 X 条缓存消息'` → `'Flushing X buffered messages'`
- `'复用已存在的编辑器面板'` → `'Reusing existing editor panel'`
- `'现有编辑器面板已失效，将重新创建'` → `'Existing editor panel invalid, recreating'`
- `'创建主编辑器 WebView 面板'` → `'Creating editor WebView panel'`
- `'主编辑器 WebView 面板已销毁'` → `'Editor WebView panel disposed'`
- `// 配置 WebView 选项` → `// Configure WebView options`
- `// 保存实例及其配置` → `// Save instance and its config`
- `// 连接消息处理器` → `// Connect message handler`
- `// 设置 WebView HTML` → `// Set WebView HTML`
- `// 生成 WebView HTML` → `// Generate WebView HTML`
- `// 读取 dev server 地址` → `// Read dev server address`
- `// 生成随机 nonce` → `// Generate random nonce`

**Step 3: Run typecheck**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add src/services/webViewService.ts
git commit -m "i18n: translate webViewService to English"
```

---

### Task 3: ClaudeSessionService.ts

**Files:**
- Modify: `src/services/claude/ClaudeSessionService.ts`

**Step 1: Translate file header**

```typescript
/**
 * ClaudeSessionService - Session History Loading and Management
 *
 * Responsibilities:
 * 1. Load session history from ~/.claude/projects/ directory
 * 2. Parse .jsonl files (one JSON object per line)
 * 3. Organize session messages and generate summaries
 * 4. Support session list queries and message retrieval
 *
 * Dependencies:
 * - ILogService: Logging service
 */
```

**Step 2: Translate comments and logs**

Key translations:
- `'加载会话列表'` → `'Loading session list'`
- `'找到 X 个会话'` → `'Found X sessions'`
- `'获取会话消息'` → `'Getting session messages'`
- `'获取到 X 条消息'` → `'Retrieved X messages'`
- `'加载会话列表失败'` → `'Failed to load session list'`
- `'获取会话消息失败'` → `'Failed to get session messages'`
- `// 会话消息类型` → `// Session message type`
- `// 会话信息` → `// Session info`
- `// 会话服务接口` → `// Session service interface`
- `// 路径管理函数` → `// Path management functions`
- `// 获取 Claude 配置目录` → `// Get Claude config directory`
- `// 获取项目历史目录` → `// Get project history directory`
- `// UUID 正则表达式` → `// UUID regex`
- `// 验证 UUID` → `// Validate UUID`
- `// 读取 JSONL 文件` → `// Read JSONL file`
- `// 转换消息格式` → `// Convert message format`
- `// 生成会话摘要` → `// Generate session summary`
- `// 会话数据容器` → `// Session data container`
- `// 加载项目的会话历史` → `// Load project session history`
- `// 获取所有会话的对话链` → `// Get all session transcripts`
- `// 重建完整的对话链` → `// Rebuild complete transcript`
- `'已初始化'` → `'Initialized'`

**Step 3: Run typecheck**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add src/services/claude/ClaudeSessionService.ts
git commit -m "i18n: translate ClaudeSessionService to English"
```

---

### Task 4: ClaudeSdkService.ts

**Files:**
- Modify: `src/services/claude/ClaudeSdkService.ts`

**Step 1: Translate file header and comments**

```typescript
/**
 * ClaudeSdkService - Claude Agent SDK Thin Wrapper
 *
 * Responsibilities:
 * 1. Wrap @anthropic-ai/claude-agent-sdk query() calls
 * 2. Build SDK Options object
 * 3. Handle parameter conversion and environment configuration
 * 4. Provide interrupt() method to stop queries
 *
 * Dependencies:
 * - ILogService: Logging service
 * - IConfigurationService: Configuration service
 */
```

**Step 2: Translate log messages**

Key translations:
- `'开始调用'` → `'Starting call'`
- `'输入参数'` → `'Input parameters'`
- `'参数转换'` → `'Parameter conversion'`
- `'准备调用 Claude Agent SDK'` → `'Preparing to call Claude Agent SDK'`
- `'CLI 可执行文件'` → `'CLI executable'`
- `'CLI 文件存在'` → `'CLI file exists'`
- `'环境变量'` → `'Environment variables'`
- `'导入 SDK...'` → `'Importing SDK...'`
- `'SDK 调用失败'` → `'SDK call failed'`
- `'中断 Claude SDK 查询'` → `'Interrupting Claude SDK query'`
- `'查询已中断'` → `'Query interrupted'`
- `'中断查询失败'` → `'Failed to interrupt query'`
- `'已初始化'` → `'Initialized'`
- `// 获取环境变量` → `// Get environment variables`
- `// 获取 Claude CLI 可执行文件路径` → `// Get Claude CLI executable path`

**Step 3: Run typecheck**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add src/services/claude/ClaudeSdkService.ts
git commit -m "i18n: translate ClaudeSdkService to English"
```

---

### Task 5: Transport files

**Files:**
- Modify: `src/services/claude/transport/BaseTransport.ts`
- Modify: `src/services/claude/transport/VSCodeTransport.ts`
- Modify: `src/services/claude/transport/index.ts`
- Modify: `src/services/claude/transport/AsyncStream.ts`
- Modify: `src/services/claude/transport/ResilientMessageQueue.ts`

**Step 1: Translate BaseTransport.ts**

```typescript
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
```

Key translations:
- `// 发送消息到客户端` → `// Send message to client`
- `// 要发送的消息对象` → `// Message object to send`
- `// 监听来自客户端的消息` → `// Listen for messages from client`
- `// 消息接收回调函数` → `// Message receive callback`
- `// 取消订阅函数` → `// Unsubscribe function`
- `// 发送消息（由子类实现）` → `// Send message (implemented by subclass)`
- `// 注册消息监听器` → `// Register message listener`
- `// 触发消息回调（供子类调用）` → `// Trigger message callback (for subclass use)`

**Step 2: Translate index.ts**

```typescript
/**
 * Transport Module Unified Exports
 *
 * Contains:
 * - AsyncStream: Async stream abstraction (single-use)
 * - ResilientMessageQueue: Restartable message queue (for persistent loops)
 * - BaseTransport/ITransport: Transport layer interface
 * - VSCodeTransport: VSCode WebView transport implementation
 */
```

**Step 3: Run typecheck**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add src/services/claude/transport/
git commit -m "i18n: translate transport module to English"
```

---

### Task 6: handlers.ts

**Files:**
- Modify: `src/services/claude/handlers/handlers.ts`

**Step 1: Translate file header and function comments**

Translate all Chinese comments to English following the same pattern as above.

**Step 2: Run typecheck**

```bash
npm run typecheck
```

**Step 3: Commit**

```bash
git add src/services/claude/handlers/
git commit -m "i18n: translate handlers to English"
```

---

### Task 7: Other service files

**Files:**
- Modify: `src/services/fileSystemService.ts`
- Modify: `src/services/configurationService.ts`
- Modify: `src/services/logService.ts`
- Modify: `src/services/workspaceService.ts`
- Modify: `src/services/notificationService.ts`
- Modify: `src/services/terminalService.ts`
- Modify: `src/services/tabsAndEditorsService.ts`

**Step 1: Translate all service files**

Follow the same pattern - translate file headers, comments, and log messages.

**Step 2: Run typecheck**

```bash
npm run typecheck
```

**Step 3: Commit**

```bash
git add src/services/
git commit -m "i18n: translate remaining services to English"
```

---

### Task 8: Shared types and messages

**Files:**
- Modify: `src/shared/messages.ts`
- Modify: `src/shared/timeout.ts`

**Step 1: Translate comments**

**Step 2: Run typecheck**

```bash
npm run typecheck
```

**Step 3: Commit**

```bash
git add src/shared/
git commit -m "i18n: translate shared modules to English"
```

---

### Task 9: Extension entry point

**Files:**
- Modify: `src/extension.ts`

**Step 1: Translate log messages**

Key translations:
- `'Claude Chat 扩展已激活'` → `'Claude Chat extension activated'`
- `'Claude Agent Service 已连接 Transport'` → `'Claude Agent Service connected to Transport'`
- `'WebView Service 已注册为 View Provider'` → `'WebView Service registered as View Provider'`
- `'Settings 命令已注册'` → `'Settings command registered'`
- `'Claude Chat 视图已注册'` → `'Claude Chat view registered'`
- `// Settings 页为单实例` → `// Settings page is singleton`

**Step 2: Run typecheck**

```bash
npm run typecheck
```

**Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "i18n: translate extension entry point to English"
```

---

### Task 10: WebView source files

**Files:**
- Modify: `src/webview/src/types/*.ts`
- Modify: `src/webview/src/composables/*.ts`
- Modify: `src/webview/src/transport/*.ts`
- Modify: `src/webview/src/core/*.ts`
- Modify: `src/webview/src/utils/*.ts`
- Modify: `src/webview/vite.config.ts`

**Step 1: Translate all webview source files**

This is the largest task. Translate:
- All JSDoc comments
- All inline comments
- All console.log/warn/error messages

**Step 2: Run build**

```bash
cd src/webview && npm run build
```

**Step 3: Commit**

```bash
git add src/webview/
git commit -m "i18n: translate webview source to English"
```

---

### Task 11: DI module

**Files:**
- Modify: `src/di/*.ts`

**Step 1: Translate all DI module files**

**Step 2: Run typecheck**

```bash
npm run typecheck
```

**Step 3: Commit**

```bash
git add src/di/
git commit -m "i18n: translate DI module to English"
```

---

### Task 12: Final verification

**Step 1: Run full build**

```bash
npm run build
```

**Step 2: Run tests**

```bash
npm test
```

**Step 3: Run lint**

```bash
npm run lint
```

**Step 4: Verify no Chinese remains**

```bash
grep -r "日志\|服务\|配置\|消息\|会话\|初始化\|实现\|接口" src/ --include="*.ts"
```

Expected: No output (all Chinese translated)

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "i18n: final cleanup and verification"
```

---

## Notes

- Keep English log messages concise and consistent with existing English logs
- Preserve technical terms (e.g., "Transport", "Channel", "Query")
- Use active voice in comments (e.g., "Get config" not "Gets the config")
- Follow existing English patterns in the codebase for consistency
