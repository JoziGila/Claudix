# ISSUE-008: CSP Includes unsafe-eval

**Severity:** Medium
**Category:** Security
**Status:** Known/Documented

## Location

- [webViewService.ts:291-299](../../src/services/webViewService.ts#L291-L299)

## Description

Content Security Policy includes `'unsafe-eval'` which weakens XSS protection.

## Evidence

```typescript
// CSP: 'unsafe-eval' and 'blob:' required for mermaid diagram rendering
// Mermaid v10+ uses dynamic ESM imports and eval for diagram parsing
// See: https://github.com/mermaid-js/mermaid/issues/5453
const csp = [
  `default-src 'none';`,
  `img-src ${webview.cspSource} https: data:;`,
  `style-src ${webview.cspSource} 'unsafe-inline' https://*.vscode-cdn.net;`,
  `font-src ${webview.cspSource} data:;`,
  `script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval' blob:;`,  // HERE
  `connect-src ${webview.cspSource} https:;`,
  `worker-src ${webview.cspSource} blob:;`,
].join(' ');
```

## Why It's Needed

Mermaid.js v10+ requires `eval()` for:
- Dynamic ESM module imports
- Diagram parsing and rendering
- Plugin system

This is a known Mermaid issue: https://github.com/mermaid-js/mermaid/issues/5453

## Risk Assessment

### What unsafe-eval Allows

- `eval()` - Execute arbitrary strings as code
- `new Function()` - Create functions from strings
- `setTimeout/setInterval` with string argument

### Attack Surface

If an attacker can inject content into the WebView:
1. Malicious Mermaid diagram could execute code
2. XSS in markdown rendering could escalate

### Mitigations in Place

1. **Nonce required** - Scripts must have matching nonce
2. **Sanitization** - Markdown sanitized before rendering (verify this)
3. **VSCode sandbox** - WebView runs in restricted context

## Options

### Option 1: Accept Risk (Current)

Document the requirement and ensure:
- [ ] Mermaid diagrams are sanitized
- [ ] No user-controlled strings reach eval
- [ ] Regular security audits

### Option 2: Sandboxed iframe for Mermaid

```typescript
// Render Mermaid in sandboxed iframe
const mermaidFrame = document.createElement('iframe');
mermaidFrame.sandbox = 'allow-scripts';  // No allow-same-origin
mermaidFrame.srcdoc = `
  <script src="mermaid.js"></script>
  <script>mermaid.render('diagram', '${escapedCode}')</script>
`;
```

This isolates Mermaid's eval from main WebView context.

### Option 3: Use Mermaid Ink (Server-side)

Render diagrams server-side via Mermaid Ink API:
- No client-side eval needed
- Requires network access
- Adds latency

### Option 4: Alternative Diagramming Library

Consider libraries that don't require eval:
- Rough.js for hand-drawn style
- D3.js with explicit configurations
- Custom SVG generation

## Recommendation

For now: **Option 1** with documented mitigations.

Future: Investigate **Option 2** (sandboxed iframe) as it provides strong isolation without breaking functionality.

## Verification Checklist

- [ ] Mermaid input is sanitized before rendering
- [ ] User-supplied strings don't reach eval directly
- [ ] CSP still blocks inline scripts without nonce
- [ ] No other libraries depend on unsafe-eval
