# ISSUE-010: Unimplemented TODO Comments

**Severity:** Medium
**Category:** Incomplete Features
**Status:** Confirmed

## Location

Multiple files in `src/`

## Description

Several TODO comments indicate incomplete or missing functionality.

## Evidence

### handlers/handlers.ts

```typescript
// Line 72
// TODO: 从 AuthManager 获取认证状态

// Line 81
// TODO: 从配置获取 openNewInTab

// Line 716
// TODO: 通过 agentService 获取 channel

// Line 756
// TODO: 获取 extensionPath
```

### UserMessage.vue

```typescript
// Line 155
// TODO: 调用 session.send() 发送编辑后的消息

// Line 163
// TODO: 实现 restore checkpoint 逻辑
```

### Other Files

```typescript
// base/uri.ts:494
// TODO

// base/lifecycle.ts:533
// TODO: This should not be a static property.
```

## Affected Features

| TODO | Feature | User Impact |
|------|---------|-------------|
| AuthManager | Authentication status | May show incorrect auth state |
| openNewInTab config | Tab behavior | Uses default instead of user preference |
| session.send() for edit | Message editing | Edit button does nothing |
| restore checkpoint | Conversation rollback | Restore button does nothing |

## Priority

### High Priority (User-Facing)

1. **Message editing** - User clicks edit, types, saves - nothing happens
2. **Checkpoint restore** - User clicks restore - nothing happens

### Medium Priority (Config)

3. **openNewInTab** - Should read from settings
4. **extensionPath** - May affect resource loading

### Low Priority (Infrastructure)

5. **AuthManager** - Auth may be handled elsewhere now
6. **Static property warning** - Code smell, not user-facing

## Fix Required

### Message Editing (UserMessage.vue:155)

```typescript
async function saveEdit() {
  const finalContent = editedContent.value?.trim() || props.content;

  // Actually send the edited message
  if (session && finalContent !== props.content) {
    await session.send(finalContent, [], false);  // resend=false or edit mode
  }

  editMode.value = false;
}
```

### Checkpoint Restore (UserMessage.vue:163)

```typescript
function restoreCheckpoint() {
  if (!session || !props.messageIndex) return;

  // Truncate conversation to this point
  session.truncateTo(props.messageIndex);
  // Or use checkpoint API if available
}
```

## Tracking

Consider converting TODOs to GitHub issues for better tracking.

```bash
# Find all TODOs
grep -rn "TODO" src/ --include="*.ts" --include="*.vue"
```
