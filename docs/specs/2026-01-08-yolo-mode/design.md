# Design: YOLO Mode (Bypass Permissions)

**Status:** Proposed
**Date:** 2026-01-08
**Plan:** [./plan.md](./plan.md)

## Context

Users want a "YOLO mode" that auto-approves ALL tool executions (edits AND commands) without prompting. The Claude Agent SDK already supports this via the `bypassPermissions` permission mode.

## Decision

**Add `bypassPermissions` mode to the UI** as a 4th option in the mode dropdown.

**Rationale:** Single obvious approach - the SDK already has this capability, we just need to expose it.

## Approach

Add new mode to existing dropdown pattern:

```typescript
// ModeSelect.vue - new dropdown item
{
  id: 'bypassPermissions',
  label: 'YOLO',
  icon: 'codicon-flame',
  type: 'yolo-mode'
}

// ChatPage.vue - update toggle order
const order: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];
```

## Trade-offs

- **Security risk:** Users can accidentally run dangerous commands
- **Mitigation:** Visual warning styling (flame icon, potentially red/orange tint) makes mode obvious
- **Acceptable because:** Power users explicitly choosing this mode understand the risk
