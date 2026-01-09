# ISSUE-021: Bullet Dot Misaligned After Thinking Block

**Severity:** Low
**Category:** Visual/CSS
**Status:** FIXED

## Description

The bullet dot (•) that appears before assistant messages is misaligned when the message starts with a thinking block. The dot appears at the top of the container (aligned with "Thought") instead of next to the actual text content.

## Visual Evidence

```
Current (buggy):
┌─────────────────────────────────────────┐
│ •  Thought ▾                            │  ← Dot aligned here (wrong)
│                                         │
│    Let me check the current git state   │  ← Text starts here
└─────────────────────────────────────────┘

Expected:
┌─────────────────────────────────────────┐
│    Thought ▾                            │
│                                         │
│ •  Let me check the current git state   │  ← Dot should be here
└─────────────────────────────────────────┘
```

## Location

- [AssistantMessage.vue:86-94](../../src/webview/src/components/Messages/AssistantMessage.vue#L86-L94)

## Root Cause

The dot is rendered using CSS `::before` pseudo-element with fixed positioning:

```css
.assistant-message.prefix::before {
  content: "\25cf";
  position: absolute;
  left: 8px;
  padding-top: 2px;  /* Fixed at top of container */
  font-size: 10px;
  color: var(--vscode-input-border);
  z-index: 1;
}
```

The `padding-top: 2px` positions the dot at the TOP of the `.assistant-message` container. When a thinking block renders first, the dot aligns with the thinking block header instead of the text content that follows.

## Content Block Order

When Claude "thinks" before responding:
1. ThinkingBlock renders first (collapsed "Thought ▾" header)
2. TextBlock renders second ("Let me check...")

The dot is positioned relative to the container, not the text block.

## Fix Options

### Option 1: Move Dot Into TextBlock (Recommended)

Instead of putting the dot on the container, put it on the first text block:

```vue
<!-- TextBlock.vue -->
<template>
  <div class="text-block" :class="{ 'with-prefix': isFirstText }">
    <MarkdownRenderer :content="displayText" />
  </div>
</template>

<style scoped>
.text-block.with-prefix::before {
  content: "\25cf";
  position: absolute;
  left: -16px;
  top: 2px;
  /* ... */
}
</style>
```

### Option 2: CSS Only - Target First Text Block

```css
/* Remove from container */
.assistant-message.prefix::before {
  display: none;
}

/* Add to first text block child */
.assistant-message.prefix > .text-block:first-of-type::before,
.assistant-message.prefix > :not(.thinking-block) ~ .text-block:first-of-type::before {
  content: "\25cf";
  /* ... positioning ... */
}
```

### Option 3: JS-Calculated Position

```typescript
const firstTextBlockIndex = computed(() => {
  const content = props.message.message.content;
  if (!Array.isArray(content)) return 0;
  return content.findIndex(w => w.content.type === 'text');
});
```

Then apply a CSS variable for positioning.

### Option 4: Don't Show Dot When Thinking Present

```typescript
// In messageClasses computed
if (Array.isArray(content)) {
  const hasThinking = content.some(w => w.content.type === 'thinking');
  const hasToolUse = content.some(w => w.content.type === 'tool_use');

  // Only show dot for pure text messages (no thinking, no tool_use)
  if (!hasToolUse && !hasThinking) {
    classes.push('prefix');
  }
}
```

## Recommendation

**Option 1** is cleanest - move the dot responsibility to the TextBlock component and pass a prop indicating if it's the first text block in the message.

## Testing

1. Send a message that triggers thinking (complex question)
2. Verify dot appears next to actual text, not "Thought"
3. Send simple message (no thinking) - verify dot still appears
4. Send message with tool use - verify no dot appears
