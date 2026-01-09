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

import * as fs from 'fs/promises';
import type { Stats } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';

export const IClaudeSessionService = createDecorator<IClaudeSessionService>('claudeSessionService');

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Session message type
 */
interface SessionMessage {
    uuid: string;
    sessionId: string;
    parentUuid?: string;
    timestamp: string;
    type: "user" | "assistant" | "attachment" | "system" | "summary";
    message?: any;
    isMeta?: boolean;
    isSidechain?: boolean;
    leafUuid?: string;
    summary?: string;
    toolUseResult?: any;
    gitBranch?: string;
    cwd?: string;

}

/**
 * Session info
 */
export interface SessionInfo {
    id: string;
    lastModified: number;
    messageCount: number;
    summary: string;
    isSidechain?: boolean;
    worktree?: string;
    isCurrentWorkspace: boolean;
}

/**
 * Session service interface
 */
export interface IClaudeSessionService {
    readonly _serviceBrand: undefined;

    /**
     * List all sessions for specified working directory
     */
    listSessions(cwd: string): Promise<SessionInfo[]>;

    /**
     * Get all messages for specified session
     */
    getSession(sessionIdOrPath: string, cwd: string): Promise<any[]>;
}

// ============================================================================
// Path Management Functions
// ============================================================================

/**
 * Get Claude config directory
 */
function getConfigDir(): string {
    return process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
}

/**
 * Get projects history directory
 */
function getProjectsDir(): string {
    return path.join(getConfigDir(), "projects");
}

/**
 * Get specific project's history directory
 */
function getProjectHistoryDir(cwd: string): string {
    return path.join(getProjectsDir(), cwd.replace(/[^a-zA-Z0-9]/g, "-"));
}

/**
 * UUID regex
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate UUID
 */
function validateSessionId(id: string): string | null {
    return typeof id !== "string" ? null : UUID_REGEX.test(id) ? id : null;
}

/**
 * Read JSONL file
 */
async function readJSONL(filePath: string): Promise<SessionMessage[]> {
    try {
        const content = await fs.readFile(filePath, "utf8");
        if (!content.trim()) {
            return [];
        }

        return content
            .split("\n")
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(obj => obj !== null) as SessionMessage[];
    } catch {
        return [];
    }
}

/**
 * Convert message format (for returning to frontend)
 */
function convertMessage(msg: SessionMessage): any | undefined {
    if (msg.isMeta) {
        return undefined;
    }

    if (msg.type === "user") {
        return {
            type: "user",
            message: msg.message,
            session_id: msg.uuid,
            parent_tool_use_id: null,
            toolUseResult: msg.toolUseResult
        };
    }

    if (msg.type === "assistant") {
        return {
            type: "assistant",
            message: msg.message,
            session_id: msg.uuid,
            parent_tool_use_id: null,
            uuid: msg.message?.id
        };
    }

    if (msg.type === "system" || msg.type === "attachment") {
        return undefined;
    }

    return undefined;
}

/**
 * Generate session summary
 */
function generateSummary(messages: SessionMessage[]): string {
    let firstUserMessage: SessionMessage | undefined;

    for (const msg of messages) {
        if (msg.type === "user" && !msg.isMeta) {
            firstUserMessage = msg;
        } else if (firstUserMessage) {
            break;
        }
    }

    if (!firstUserMessage || firstUserMessage.type !== "user") {
        return "No prompt";
    }

    const content = firstUserMessage.message?.content;
    let text = "";

    if (typeof content === "string") {
        text = content;
    } else if (Array.isArray(content)) {
        // Find last text type item from back to front
        const textItems = content.filter((item: any) => item.type === "text");
        text = textItems.length > 0 ? textItems[textItems.length - 1]?.text || "No prompt" : "No prompt";
    } else {
        text = "No prompt";
    }

    // Remove newlines and truncate
    text = text.replace(/\n/g, " ").trim();
    if (text.length > 45) {
        text = text.slice(0, 45) + "...";
    }

    return text;
}


// ============================================================================
// ClaudeSessionService Implementation
// ============================================================================

/**
 * Session data container
 */
interface SessionData {
    sessionMessages: Map<string, Set<string>>;
    messages: Map<string, SessionMessage>;
    summaries: Map<string, string>;
}

/**
 * Load project session history
 */
async function loadProjectData(cwd: string): Promise<SessionData> {
    const projectDir = getProjectHistoryDir(cwd);

    let files: string[];
    try {
        files = await fs.readdir(projectDir);
    } catch {
        return {
            sessionMessages: new Map(),
            messages: new Map(),
            summaries: new Map()
        };
    }

    // Fix #6: Use Promise.allSettled to handle files deleted between readdir and stat
    const fileStatsResults = await Promise.allSettled(
        files.map(async file => {
            const filePath = path.join(projectDir, file);
            const stat = await fs.stat(filePath);
            return { name: filePath, stat };
        })
    );

    // Filter out failed stats (files deleted between readdir and stat)
    const fileStats: { name: string; stat: Stats }[] = [];
    for (const result of fileStatsResults) {
        if (result.status === 'fulfilled') {
            fileStats.push(result.value as { name: string; stat: Stats });
        }
    }

    const jsonlFiles = fileStats
        .filter(file => file.stat.isFile() && file.name.endsWith(".jsonl"))
        .sort((a, b) => a.stat.mtime.getTime() - b.stat.mtime.getTime());

    const loadedData = await Promise.all(
        jsonlFiles.map(async file => {
            const sessionId = validateSessionId(path.basename(file.name, ".jsonl"));

            if (!sessionId) {
                return {
                    sessionId,
                    sessionMessages: new Map<string, SessionMessage>(),
                    summaries: new Map<string, string>()
                };
            }

            const messages = new Map<string, SessionMessage>();
            const summaries = new Map<string, string>();

            try {
                for (const msg of await readJSONL(file.name)) {
                    if (
                        msg.type === "user" ||
                        msg.type === "assistant" ||
                        msg.type === "attachment" ||
                        msg.type === "system"
                    ) {
                        messages.set(msg.uuid, msg);
                    } else if (msg.type === "summary" && msg.leafUuid) {
                        summaries.set(msg.leafUuid, msg.summary!);
                    }
                }
            } catch (error) {
                // Fix #9: Log JSONL read errors instead of silently swallowing
                console.warn(`[ClaudeSessionService] Error reading session file ${file.name}:`, error);
            }

            return { sessionId, sessionMessages: messages, summaries };
        })
    );

    const sessionMessages = new Map<string, Set<string>>();
    const allMessages = new Map<string, SessionMessage>();
    const allSummaries = new Map<string, string>();

    for (const { sessionId, sessionMessages: messages, summaries } of loadedData) {
        if (!sessionId) continue;

        sessionMessages.set(sessionId, new Set(messages.keys()));

        for (const [uuid, msg] of messages.entries()) {
            allMessages.set(uuid, msg);
        }

        for (const [uuid, summary] of summaries.entries()) {
            allSummaries.set(uuid, summary);
        }
    }

    return {
        sessionMessages,
        messages: allMessages,
        summaries: allSummaries
    };
}

/**
 * Get all session transcripts
 */
function getTranscripts(data: SessionData): SessionMessage[][] {
    const allMessages = [...data.messages.values()];

    const referencedUuids = new Set(
        allMessages.map(msg => msg.parentUuid).filter(Boolean) as string[]
    );

    const rootMessages = allMessages.filter(msg => !referencedUuids.has(msg.uuid));

    return rootMessages
        .map(msg => getTranscript(msg, data))
        .filter(transcript => transcript.length > 0);
}

/**
 * Rebuild complete transcript
 */
function getTranscript(message: SessionMessage, data: SessionData): SessionMessage[] {
    const result: SessionMessage[] = [];
    let current: SessionMessage | undefined = message;

    while (current) {
        result.unshift(current);
        current = current.parentUuid ? data.messages.get(current.parentUuid) : undefined;
    }

    return result;
}


// ============================================================================
// ClaudeSessionService Class
// ============================================================================

/**
 * Claude session service implementation
 */
export class ClaudeSessionService implements IClaudeSessionService {
    readonly _serviceBrand: undefined;

    constructor(
        @ILogService private readonly logService: ILogService
    ) {
        this.logService.info('[ClaudeSessionService] Initialized');
    }

    /**
     * List all sessions for specified working directory
     */
    async listSessions(cwd: string): Promise<SessionInfo[]> {
        try {
            this.logService.info(`[ClaudeSessionService] Loading session list: ${cwd}`);

            const data = await loadProjectData(cwd);

            const transcripts = getTranscripts(data);

            const sessions = transcripts.map(transcript => {
                const lastMessage = transcript[transcript.length - 1];
                const firstMessage = transcript[0];
                const summary = generateSummary(transcript);

                return {
                    lastModified: new Date(lastMessage.timestamp).getTime(),
                    messageCount: transcript.length,
                    isSidechain: firstMessage.isSidechain,
                    id: lastMessage.sessionId,
                    summary: data.summaries.get(lastMessage.uuid) || summary,
                    isCurrentWorkspace: true
                };
            });

            this.logService.info(`[ClaudeSessionService] Found ${sessions.length} sessions`);
            return sessions;
        } catch (error) {
            this.logService.error(`[ClaudeSessionService] Failed to load session list:`, error);
            return [];
        }
    }

    /**
     * Get all messages for specified session
     */
    async getSession(sessionIdOrPath: string, cwd: string): Promise<any[]> {
        try {
            this.logService.info(`[ClaudeSessionService] Getting session messages: ${sessionIdOrPath}`);

            if (sessionIdOrPath.endsWith(".jsonl")) {
                const messages: any[] = [];
                for (const msg of await readJSONL(sessionIdOrPath)) {
                    messages.push(msg);
                }
                return messages;
            }

            const data = await loadProjectData(cwd);

            const messageUuids = data.sessionMessages.get(sessionIdOrPath);
            if (!messageUuids) {
                return [];
            }

            const sessionMessageList = Array.from(data.messages.values())
                .filter(msg => messageUuids.has(msg.uuid))
                .sort((a, b) =>
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                );

            const latestMessage = sessionMessageList[0];
            if (!latestMessage) {
                return [];
            }

            const result = getTranscript(latestMessage, data)
                .map(convertMessage)
                .filter(msg => !!msg);

            this.logService.info(`[ClaudeSessionService] Retrieved ${result.length} messages`);
            return result;
        } catch (error) {
            this.logService.error(`[ClaudeSessionService] Failed to get session messages:`, error);
            return [];
        }
    }

}
