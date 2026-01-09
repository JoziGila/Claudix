# ISSUE-015: Mixed Language in Logging

**Severity:** Low
**Category:** Consistency
**Status:** Confirmed

## Location

Multiple files in `src/services/`

## Description

Log messages mix Chinese and English, creating inconsistency.

## Evidence

### ClaudeSdkService.ts

```typescript
this.logService.info('[ClaudeSdkService] 已初始化');
this.logService.info('ClaudeSdkService.query() 开始调用');
this.logService.info('🚀 准备调用 Claude Agent SDK');
```

### ClaudeAgentService.ts

```typescript
this.logService.info(`✓ 会话已创建: ${sessionId}`);
this.logService.error(`❌ Channel 已存在: ${channelId}`);
this.logService.error('❌❌❌ Claude 会话启动失败 ❌❌❌');
this.logService.error('[ClaudeAgentService] 中断失败:', error);
```

### ClaudeSessionService.ts

```typescript
this.logService.error(`[ClaudeSessionService] 加载会话列表失败:`, error);
this.logService.error(`[ClaudeSessionService] 获取会话消息失败:`, error);
```

### extension.ts

```typescript
this.logService.info('Claude Chat 扩展已激活');
this.logService.info('✓ Claude Agent Service 已连接 Transport');
```

## Impact

1. **Inconsistent UX** - Users see mixed languages in Output panel
2. **Search difficulty** - Hard to grep for specific messages
3. **Localization challenges** - Need to change every message for i18n
4. **Accessibility** - Screen readers may struggle

## Fix Options

### Option 1: Standardize to English

```typescript
// Before
this.logService.info('[ClaudeSdkService] 已初始化');

// After
this.logService.info('[ClaudeSdkService] Initialized');
```

### Option 2: Standardize to Chinese

```typescript
// Consistent Chinese for Chinese-market product
this.logService.info('[ClaudeSdkService] 已初始化');
```

### Option 3: Localization System

```typescript
// i18n approach
import { t } from '../i18n';

this.logService.info(t('sdk.initialized'));
// en: "SDK initialized"
// zh: "SDK 已初始化"
```

## Recommended Approach

For an English-primary product:
1. **Standardize to English** for code/logs
2. **Keep Chinese comments** if helpful for maintainers
3. **Use i18n for user-facing strings** (error messages, notifications)

## Migration Guide

```bash
# Find all Chinese log messages
grep -rn "logService\.\(info\|warn\|error\|debug\)" src/ | grep -P "[\x{4e00}-\x{9fff}]"
```

| Original | Replacement |
|----------|-------------|
| 已初始化 | Initialized |
| 开始调用 | Starting call |
| 准备调用 | Preparing to call |
| 会话已创建 | Session created |
| Channel 已存在 | Channel already exists |
| 会话启动失败 | Session startup failed |
| 中断失败 | Interrupt failed |
| 加载会话列表失败 | Failed to load session list |
| 获取会话消息失败 | Failed to get session messages |
| 扩展已激活 | Extension activated |
| 已连接 | Connected |
