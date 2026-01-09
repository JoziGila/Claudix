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

import * as vscode from 'vscode';
import * as fs from 'fs';
import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import { AsyncStream } from './transport';

// SDK type imports
import type {
    Options,
    Query,
    CanUseTool,
    PermissionMode,
    SDKUserMessage,
    HookCallbackMatcher,
} from '@anthropic-ai/claude-agent-sdk';

export const IClaudeSdkService = createDecorator<IClaudeSdkService>('claudeSdkService');

/**
 * SDK query parameters
 */
export interface SdkQueryParams {
    inputStream: AsyncStream<SDKUserMessage>;
    resume: string | null;
    canUseTool: CanUseTool;
    model: string | null;  // ← Accepts null, converted internally
    cwd: string;
    permissionMode: PermissionMode | string;  // ← Accepts string
    maxThinkingTokens?: number;  // ← Max thinking tokens
}

/**
 * SDK service interface
 */
export interface IClaudeSdkService {
    readonly _serviceBrand: undefined;

    /**
     * Call Claude SDK for query
     */
    query(params: SdkQueryParams): Promise<Query>;

    /**
     * Interrupt ongoing query
     */
    interrupt(query: Query): Promise<void>;
}

const VS_CODE_APPEND_PROMPT = `
  # VSCode Extension Context

  You are running inside a VSCode native extension environment.

  ## Code References in Text
  IMPORTANT: When referencing files or code locations, use markdown link syntax to make them clickable:
  - For files: [filename.ts](src/filename.ts)
  - For specific lines: [filename.ts:42](src/filename.ts#L42)
  - For a range of lines: [filename.ts:42-51](src/filename.ts#L42-L51)
  - For folders: [src/utils/](src/utils/)
  Unless explicitly asked for by the user, DO NOT USE backtickets \` or HTML tags like code for file references - always use markdown [text](link) format.
  The URL links should be relative paths from the root of  the user's workspace.

  ## User Selection Context
  The user's IDE selection (if any) is included in the conversation context and marked with ide_selection tags. This represents code or text the user has highlighted in their editor and may or may not be relevant to their request.`;

/**
 * ClaudeSdkService implementation
 */
export class ClaudeSdkService implements IClaudeSdkService {
    readonly _serviceBrand: undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService
    ) {
        this.logService.info('[ClaudeSdkService] Initialized');
    }

    /**
     * Call Claude SDK for query
     */
    async query(params: SdkQueryParams): Promise<Query> {
        const { inputStream, resume, canUseTool, model, cwd, permissionMode, maxThinkingTokens } = params;

        this.logService.info('========================================');
        this.logService.info('ClaudeSdkService.query() Starting call');
        this.logService.info('========================================');
        this.logService.info(`📋 Input parameters:`);
        this.logService.info(`  - model: ${model}`);
        this.logService.info(`  - cwd: ${cwd}`);
        this.logService.info(`  - permissionMode: ${permissionMode}`);
        this.logService.info(`  - resume: ${resume}`);
        this.logService.info(`  - maxThinkingTokens: ${maxThinkingTokens ?? 'undefined'}`);

        // Parameter conversion
        const modelParam = model === null ? "default" : model;
        const permissionModeParam = permissionMode as PermissionMode;
        const cwdParam = cwd;

        this.logService.info(`🔄 Parameter conversion:`);
        this.logService.info(`  - modelParam: ${modelParam}`);
        this.logService.info(`  - permissionModeParam: ${permissionModeParam}`);
        this.logService.info(`  - cwdParam: ${cwdParam}`);

        // Build SDK Options
        const options: Options = {
            // Basic parameters
            cwd: cwdParam,
            resume: resume || undefined,
            model: modelParam,
            permissionMode: permissionModeParam,
            maxThinkingTokens: maxThinkingTokens,

            // CanUseTool callback
            canUseTool,

            // Log callback - capture all stderr output from SDK process
            stderr: (data: string) => {
                const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
                const lines = data.trim().split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;

                    // Detect error level
                    const lowerLine = line.toLowerCase();
                    let level = 'INFO';

                    if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('exception')) {
                        level = 'ERROR';
                    } else if (lowerLine.includes('warn') || lowerLine.includes('warning')) {
                        level = 'WARN';
                    } else if (lowerLine.includes('exit') || lowerLine.includes('terminated')) {
                        level = 'EXIT';
                    }

                    this.logService.info(`[${timestamp}] [SDK ${level}] ${line}`);
                }
            },

            // Environment variables
            env: this.getEnvironmentVariables(),

            // System prompt append
            systemPrompt: {
                type: 'preset',
                preset: 'claude_code',
                append: VS_CODE_APPEND_PROMPT
            },

            // Hooks
            hooks: {
                // PreToolUse: Before tool execution
                PreToolUse: [{
                    matcher: "Edit|Write|MultiEdit",
                    hooks: [async (input, toolUseID, options) => {
                        if ('tool_name' in input) {
                            this.logService.info(`[Hook] PreToolUse: ${input.tool_name}`);
                        }
                        return { continue: true };
                    }]
                }] as HookCallbackMatcher[],
                // PostToolUse: After tool execution
                PostToolUse: [{
                    matcher: "Edit|Write|MultiEdit",
                    hooks: [async (input, toolUseID, options) => {
                        if ('tool_name' in input) {
                            this.logService.info(`[Hook] PostToolUse: ${input.tool_name}`);
                        }
                        return { continue: true };
                    }]
                }] as HookCallbackMatcher[]
            },

            // CLI executable path
            pathToClaudeCodeExecutable: this.getClaudeExecutablePath(),

            // Extra arguments
            extraArgs: {} as Record<string, string | null>,

            // Settings sources
            // 'user': ~/.claude/settings.json (API key)
            // 'project': .claude/settings.json (project settings, CLAUDE.md)
            // 'local': .claude/settings.local.json (local settings)
            settingSources: ['user', 'project', 'local'],

            includePartialMessages: true,
        };

        // Call SDK
        this.logService.info('');
        this.logService.info('🚀 Preparing to call Claude Agent SDK');
        this.logService.info('----------------------------------------');

        // Get CLI path (avoid TypeScript type inference issues)
        const cliPath = this.getClaudeExecutablePath();

        // Log CLI path
        this.logService.info(`📂 CLI executable:`);
        this.logService.info(`  - Path: ${cliPath}`);

        // Check if CLI exists
        if (!fs.existsSync(cliPath)) {
            this.logService.error(`❌ Claude CLI not found at: ${cliPath}`);
            throw new Error(`Claude CLI not found at: ${cliPath}`);
        }
        this.logService.info(`  ✓ CLI file exists`);

        // Check file permissions
        try {
            const stats = fs.statSync(cliPath);
            this.logService.info(`  - File size: ${stats.size} bytes`);
            this.logService.info(`  - Is executable: ${(stats.mode & fs.constants.X_OK) !== 0}`);
        } catch (e) {
            this.logService.warn(`  ⚠ Could not check file stats: ${e}`);
        }

        // Set entrypoint environment variable
        process.env.CLAUDE_CODE_ENTRYPOINT = "claude-vscode";
        this.logService.info(`🔧 Environment variables:`);
        this.logService.info(`  - CLAUDE_CODE_ENTRYPOINT: ${process.env.CLAUDE_CODE_ENTRYPOINT}`);

        this.logService.info('');
        this.logService.info('📦 Importing SDK...');

        try {
            // Call SDK query() function
            const { query } = await import('@anthropic-ai/claude-agent-sdk');

            this.logService.info(`  - Options: [configured parameters: ${Object.keys(options).join(', ')}]`);

            const result = query({ prompt: inputStream, options });
            return result;
        } catch (error) {
            this.logService.error('');
            this.logService.error('❌❌❌ SDK call failed ❌❌❌');
            this.logService.error(`Error: ${error}`);
            if (error instanceof Error) {
                this.logService.error(`Message: ${error.message}`);
                this.logService.error(`Stack: ${error.stack}`);
            }
            this.logService.error('========================================');
            throw error;
        }
    }

    /**
     * Interrupt ongoing query
     */
    async interrupt(query: Query): Promise<void> {
        try {
            this.logService.info('🛑 Interrupting Claude SDK query');
            await query.interrupt();
            this.logService.info('✓ Query interrupted');
        } catch (error) {
            this.logService.error(`❌ Failed to interrupt query: ${error}`);
            throw error;
        }
    }

    /**
     * Get environment variables
     */
    private getEnvironmentVariables(): Record<string, string> {
        const config = vscode.workspace.getConfiguration("claudix");
        const customVars = config.get<Array<{ name: string; value: string }>>("environmentVariables", []);

        const env = { ...process.env };
        for (const item of customVars) {
            if (item.name) {
                env[item.name] = item.value || "";
            }
        }

        return env as Record<string, string>;
    }

    /**
     * Get Claude CLI executable path
     */
    private getClaudeExecutablePath(): string {
        const binaryName = process.platform === "win32" ? "claude.exe" : "claude";
        const arch = process.arch;

        const nativePath = this.context.asAbsolutePath(
            `resources/native-binaries/${process.platform}-${arch}/${binaryName}`
        );

        if (fs.existsSync(nativePath)) {
            return nativePath;
        }

        return this.context.asAbsolutePath("resources/claude-code/cli.js");
    }
}
