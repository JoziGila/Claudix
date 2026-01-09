# Claude Service Module

Claude Agent core services based on Dependency Injection (DI), using modular architecture design.

## Directory Structure

```
claude/
├── transport/                      # Transport layer module
│   ├── index.ts                   # Unified exports
│   ├── AsyncStream.ts             # Stream abstraction (generic)
│   ├── BaseTransport.ts           # Transport layer abstract base class
│   └── VSCodeTransport.ts         # VSCode WebView implementation
│
├── handlers/                       # Request handlers
│   ├── types.ts                   # Handler type definitions
│   ├── sessions.ts                # Session handling
│   ├── auth.ts                    # Authentication handling
│   └── ...                        # Other handlers
│
├── ClaudeAgentService.ts          # Core orchestration service
├── ClaudeSdkService.ts            # SDK thin wrapper
└── ClaudeSessionService.ts        # Historical session service
```

## Architecture Layers

```
┌─────────────────────────────────────────────────┐
│              ClaudeAgentService                 │  Core Orchestration
│  (Orchestration, Routing, Session Mgmt, RPC)   │
└────────────┬──────────────┬─────────────────────┘
             │              │
    ┌────────▼───────┐ ┌───▼──────────────┐
    │  ITransport    │ │  ClaudeSdkService│      Service Layer
    │  (Transport    │ │  (SDK Wrapper)   │
    │   Interface)   │ │                  │
    └────────┬───────┘ └───┬──────────────┘
             │              │
    ┌────────▼───────┐ ┌───▼──────────────┐
    │ BaseTransport  │ │  AsyncStream     │      Infrastructure
    │ (Generic       │ │  (Stream         │
    │  Transport)    │ │   Abstraction)   │
    └────────┬───────┘ └──────────────────┘
             │
    ┌────────▼───────┐
    │VSCodeTransport │                            Platform Implementation
    │(VSCode WebView)│
    └────────────────┘
```

## Core Components

### Transport Layer (transport/)

**BaseTransport** - Abstract Base Class
- Provides message buffering, error handling, listener management
- Defines ITransport interface
- Subclasses only need to implement `doSend()` and `doClose()`

**VSCodeTransport** - VSCode Implementation
- Extends BaseTransport
- Wraps VSCode WebView communication
- Auto-manages resources (Disposable)

**AsyncStream** - Stream Abstraction
- Producer-consumer pattern
- Backpressure control, error propagation
- Reusable by Agent, SDK, Transport

### Core Services

**ClaudeAgentService**
- Manages multiple Claude sessions (channels)
- Routes requests to handlers
- RPC request-response management
- Depends on ITransport interface (decoupled)

**ClaudeSdkService**
- Wraps Claude Agent SDK
- Provides query() and interrupt() methods
- Configuration management (Options, Hooks, Environment Variables)

**ClaudeSessionService**
- Historical session loading and management
- Provides listSessions() and getSession()
- Internal cache optimization

### Handlers

Unified signature:
```typescript
async function handleXxx(
    request: TRequest,
    context: HandlerContext,
    signal?: AbortSignal
): Promise<TResponse>
```

HandlerContext only includes service interfaces, direct use of VS Code native APIs is prohibited.

## Usage Examples

### Initialization

```typescript
// 1. Get service instance (via DI container)
const agentService = instantiationService.get(IClaudeAgentService);
const logService = instantiationService.get(ILogService);

// 2. Create Transport
const transport = new VSCodeTransport(webview, logService);

// 3. Initialize Agent
agentService.init(transport);
```

### Start Session

```typescript
await agentService.launchClaude(
    'channel-1',
    null,                    // resume
    '/path/to/workspace',
    'claude-sonnet-4-5',
    'default'                // permissionMode
);
```

### Extending to Other Platforms

```typescript
// NestJS WebSocket Transport
class NestJSTransport extends BaseTransport {
    constructor(
        private gateway: WebSocketGateway,
        logService: ILogService
    ) {
        super(logService);
        gateway.onMessage((msg) => this.handleIncomingMessage(msg));
    }

    protected doSend(message: any): void {
        this.gateway.emit('message', message);
    }

    protected doClose(): void {
        this.gateway.close();
    }
}

// Usage is exactly the same
const transport = new NestJSTransport(gateway, logService);
agentService.init(transport);
```

## Design Principles

1. **Dependency Injection**: All services managed via DI container
2. **Separation of Concerns**: Each module has clear responsibility boundaries
3. **Interface Segregation**: Transport, Handler etc. all defined via interfaces
4. **Open-Closed**: Easy to extend (new Handler, new Transport), hard to modify
5. **Platform Decoupling**: Core logic does not depend on specific platform APIs

## Extension Guide

### Adding New Handler

1. Create new file in `handlers/`
2. Implement handler function with unified signature
3. Add routing in `ClaudeAgentService.handleRequest()`

### Adding New Transport

1. Extend `BaseTransport`
2. Implement `doSend()` and `doClose()`
3. Optional: Override error handling methods

### Adding New Service

1. Define service interface (using createDecorator)
2. Implement service class
3. Register in serviceRegistry
4. Inject via constructor

## Testing

Modular transport layer design makes testing easier:

```typescript
// Mock Transport
class MockTransport extends BaseTransport {
    messages: any[] = [];

    protected doSend(message: any): void {
        this.messages.push(message);
    }

    protected doClose(): void {
        this.messages = [];
    }

    // Simulate receiving message
    simulateMessage(message: any): void {
        this.handleIncomingMessage(message);
    }
}

// Test using Mock Transport
const mockTransport = new MockTransport(logService);
agentService.init(mockTransport);

// Verify sent messages
expect(mockTransport.messages).toContainEqual({
    type: 'io_message',
    channelId: 'test',
    // ...
});
```

## Reference Documentation

- [RefactorFunctions.md](../../../RefactorFunctions.md) - Detailed refactoring plan
- [REFACTOR_SUMMARY.md](../../../REFACTOR_SUMMARY.md) - Refactoring summary and architecture analysis
