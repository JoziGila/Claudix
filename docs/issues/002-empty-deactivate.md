# ISSUE-002: Extension Deactivation Does Not Clean Up

**Severity:** Critical
**Category:** Resource Leak
**Status:** Confirmed

## Location

- [extension.ts:130-132](../../src/extension.ts#L130-L132)

## Description

The `deactivate()` function is empty - no cleanup of services, channels, or subscriptions.

## Evidence

```typescript
/**
 * Extension Deactivation
 */
export function deactivate() {
  // Clean up resources  <-- Comment only, no actual cleanup!
}
```

## Impact

When VSCode deactivates the extension (reload, update, shutdown):

1. **Claude sessions continue running** - SDK processes not terminated
2. **Memory leaks** - Services not disposed, event listeners remain
3. **Orphaned connections** - WebView transport not closed
4. **File handles** - Log files or temp files not closed

## Fix Required

```typescript
// Store reference at module level
let instantiationService: IInstantiationService | undefined;

export function activate(context: vscode.ExtensionContext) {
  const builder = new InstantiationServiceBuilder();
  registerServices(builder, context);
  instantiationService = builder.seal();

  // ... rest of activation

  // Register disposal
  context.subscriptions.push({
    dispose: () => {
      instantiationService?.invokeFunction(accessor => {
        accessor.get(IClaudeAgentService).shutdown();
      });
      instantiationService?.dispose();
    }
  });
}

export function deactivate(): Thenable<void> | undefined {
  if (!instantiationService) return;

  return instantiationService.invokeFunction(async accessor => {
    const agentService = accessor.get(IClaudeAgentService);
    await agentService.shutdown();
    instantiationService?.dispose();
    instantiationService = undefined;
  });
}
```

## Services Requiring Cleanup

| Service | Cleanup Needed |
|---------|---------------|
| ClaudeAgentService | Close all channels, stop message loop |
| WebViewService | Unregister providers, clear webviews |
| TerminalService | Dispose terminals |
| Transport | Close connections |

## Testing

1. Open extension, start a conversation
2. Run "Developer: Reload Window"
3. Check Output panel for orphan process warnings
4. Verify no Node processes left running from extension
