# ISSUE-014: Environment Variable Exposure

**Severity:** Medium
**Category:** Security
**Status:** Confirmed

## Location

- [ClaudeSdkService.ts:280-291](../../src/services/claude/ClaudeSdkService.ts#L280-L291)

## Description

Entire `process.env` is spread and passed to the Claude SDK subprocess.

## Evidence

```typescript
private getEnvironmentVariables(): Record<string, string> {
  const config = vscode.workspace.getConfiguration("claudix");
  const customVars = config.get<Array<{ name: string; value: string }>>("environmentVariables", []);

  const env = { ...process.env };  // ALL env vars copied
  for (const item of customVars) {
    if (item.name) {
      env[item.name] = item.value || "";
    }
  }

  return env as Record<string, string>;
}
```

## What Gets Exposed

The VSCode extension host's `process.env` includes:

| Category | Examples | Risk |
|----------|----------|------|
| System | PATH, HOME, USER | Low |
| VSCode | VSCODE_*, ELECTRON_* | Low |
| User Secrets | AWS_*, GITHUB_TOKEN, DATABASE_URL | **High** |
| API Keys | OPENAI_API_KEY, STRIPE_KEY | **High** |
| Auth Tokens | NPM_TOKEN, DOCKER_* | **High** |

## Impact

The Claude CLI subprocess receives ALL these variables:
- Could log them
- Could send to API
- Could be captured in error reports

## Fix Required

### Option 1: Allowlist (Recommended)

```typescript
private getEnvironmentVariables(): Record<string, string> {
  const config = vscode.workspace.getConfiguration("claudix");
  const customVars = config.get<Array<{ name: string; value: string }>>("environmentVariables", []);

  // Only allow specific env vars
  const ALLOWED_ENV_VARS = [
    'PATH',
    'HOME',
    'USER',
    'SHELL',
    'LANG',
    'LC_ALL',
    'TERM',
    'ANTHROPIC_API_KEY',  // Needed for Claude
    'CLAUDE_CODE_*',      // Claude-specific
  ];

  const env: Record<string, string> = {};

  for (const key of Object.keys(process.env)) {
    if (this.isAllowedEnvVar(key, ALLOWED_ENV_VARS)) {
      env[key] = process.env[key] as string;
    }
  }

  // Add user-configured vars
  for (const item of customVars) {
    if (item.name) {
      env[item.name] = item.value || "";
    }
  }

  return env;
}

private isAllowedEnvVar(key: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    if (pattern.endsWith('*')) {
      return key.startsWith(pattern.slice(0, -1));
    }
    return key === pattern;
  });
}
```

### Option 2: Denylist

```typescript
const DENIED_ENV_VARS = [
  /^AWS_/,
  /^GITHUB_/,
  /^NPM_/,
  /^DOCKER_/,
  /TOKEN$/i,
  /SECRET$/i,
  /PASSWORD$/i,
  /KEY$/i,  // Be careful - this blocks ANTHROPIC_API_KEY
];

const env: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (!DENIED_ENV_VARS.some(pattern => pattern.test(key))) {
    env[key] = value as string;
  }
}
```

### Option 3: User Control

Let users configure which env vars to pass:

```json
// settings.json
{
  "claudix.inheritEnvironment": false,
  "claudix.environmentVariables": [
    { "name": "PATH", "inherit": true },
    { "name": "ANTHROPIC_API_KEY", "inherit": true },
    { "name": "MY_VAR", "value": "custom" }
  ]
}
```

## Testing

1. Log env vars passed to SDK
2. Verify sensitive vars not included
3. Verify Claude still works (PATH, API key present)
4. Test custom env var injection
