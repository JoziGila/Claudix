/**
 * FileSystem Service
 * File operations wrapper + file search functionality
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import Fuse from 'fuse.js';
import { createDecorator } from '../di/instantiation';

export const IFileSystemService = createDecorator<IFileSystemService>('fileSystemService');

/**
 * File search result item
 */
export interface FileSearchResult {
	path: string;      // Relative path
	name: string;      // File name
	type: 'file' | 'directory';
}

/**
 * Ripgrep execution result
 */
interface RipgrepResult {
	absolute: string;  // Absolute path
	relative: string;  // Relative path
}

export interface IFileSystemService {
	readonly _serviceBrand: undefined;

	readFile(uri: vscode.Uri): Thenable<Uint8Array>;
	writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void>;
	delete(uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean }): Thenable<void>;
	rename(source: vscode.Uri, target: vscode.Uri, options?: { overwrite?: boolean }): Thenable<void>;
	createDirectory(uri: vscode.Uri): Thenable<void>;
	readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]>;
	stat(uri: vscode.Uri): Thenable<vscode.FileStat>;

	/**
	 * List files using Ripgrep (no search, returns raw list)
	 * @param cwd Working directory
	 * @returns File path array (relative paths)
	 */
	listFilesWithRipgrep(cwd: string): Promise<string[]>;

	/**
	 * Search files (full flow: Ripgrep + directory extraction + Fuse.js)
	 * @param pattern Search pattern
	 * @param cwd Working directory
	 * @returns File search result array
	 */
	searchFiles(pattern: string, cwd: string): Promise<FileSearchResult[]>;

	/**
	 * Search files using VSCode API (Ripgrep fallback)
	 * @param pattern Search pattern
	 * @param cwd Working directory
	 * @returns File search result array
	 */
	searchFilesWithWorkspace(pattern: string, cwd: string): Promise<FileSearchResult[]>;

	/**
	 * Extract all parent directories from file path list (aligned with official implementation)
	 * @param filePaths File path array (relative paths)
	 * @returns Deduplicated directory path array (relative paths with / suffix)
	 */
	extractParentDirectories(filePaths: string[]): string[];

	/**
	 * Get workspace top-level directories (for empty queries)
	 * @param cwd Working directory
	 * @returns Top-level directory array
	 */
	getTopLevelDirectories(cwd: string): Promise<FileSearchResult[]>;

	/**
	 * Normalize to absolute path
	 * @param filePath File path (absolute or relative)
	 * @param cwd Working directory
	 * @returns Normalized absolute path
	 */
	normalizeAbsolutePath(filePath: string, cwd: string): string;

	/**
	 * Convert to workspace relative path
	 * @param absolutePath Absolute path
	 * @param cwd Working directory
	 * @returns Relative path
	 */
	toWorkspaceRelative(absolutePath: string, cwd: string): string;

	/**
	 * Resolve file path (supports ~ expansion and relative paths)
	 * @param filePath File path
	 * @param cwd Working directory
	 * @returns Normalized absolute path
	 */
	resolveFilePath(filePath: string, cwd: string): string;

	/**
	 * Check if path exists
	 * @param target Target path
	 * @returns Whether it exists
	 */
	pathExists(target: string): Promise<boolean>;

	/**
	 * Sanitize file name (remove illegal characters)
	 * @param fileName Original file name
	 * @returns Sanitized file name
	 */
	sanitizeFileName(fileName: string): string;

	/**
	 * Create temporary file
	 * @param fileName File name
	 * @param content File content
	 * @returns Temporary file path
	 */
	createTempFile(fileName: string, content: string): Promise<string>;

	/**
	 * Resolve and find existing path (with fuzzy search)
	 * @param filePath File path
	 * @param cwd Working directory
	 * @param searchResults Optional search results (if provided, use fuzzy matching)
	 * @returns Existing absolute path
	 */
	resolveExistingPath(filePath: string, cwd: string, searchResults?: FileSearchResult[]): Promise<string>;

	/**
	 * Find files (full business logic)
	 * - Empty query returns top-level contents (directories + top-level files)
	 * - Non-empty query: Ripgrep + directory extraction + Fuse.js
	 * - Auto fallback to VSCode API
	 * @param pattern Search pattern (optional, empty query returns top-level contents)
	 * @param cwd Working directory
	 * @returns File search result array
	 */
	findFiles(pattern: string | undefined, cwd: string): Promise<FileSearchResult[]>;
}

export class FileSystemService implements IFileSystemService {
	readonly _serviceBrand: undefined;

	// Ripgrep command cache
	private ripgrepCommandCache: { command: string; args: string[] } | null = null;

	// ===== Basic File Operations =====

	readFile(uri: vscode.Uri): Thenable<Uint8Array> {
		return vscode.workspace.fs.readFile(uri);
	}

	writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void> {
		return vscode.workspace.fs.writeFile(uri, content);
	}

	delete(uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean }): Thenable<void> {
		return vscode.workspace.fs.delete(uri, options);
	}

	rename(source: vscode.Uri, target: vscode.Uri, options?: { overwrite?: boolean }): Thenable<void> {
		return vscode.workspace.fs.rename(source, target, options);
	}

	createDirectory(uri: vscode.Uri): Thenable<void> {
		return vscode.workspace.fs.createDirectory(uri);
	}

	readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]> {
		return vscode.workspace.fs.readDirectory(uri);
	}

	stat(uri: vscode.Uri): Thenable<vscode.FileStat> {
		return vscode.workspace.fs.stat(uri);
	}

	// ===== File Search Functionality (fully aligned with official implementation) =====

	/**
	 * List all files using Ripgrep (no search, returns raw list)
	 */
	async listFilesWithRipgrep(cwd: string): Promise<string[]> {
		// 1. Build ripgrep arguments
		const args = ['--files', '--follow', '--hidden'];

		// 2. Add exclude rules
		const excludeGlobs = this.buildExcludePatterns();
		for (const glob of excludeGlobs) {
			args.push('--glob', `!${glob}`);
		}

		// 3. Execute ripgrep, return raw file path list
		const rawPaths = await this.execRipgrep(args, cwd);

		// 4. Convert to relative paths
		return rawPaths.map(rawPath => {
			const absolute = this.normalizeAbsolutePath(rawPath.replace(/^\.\//, ''), cwd);
			return this.toWorkspaceRelative(absolute, cwd);
		});
	}

	/**
	 * Search files (full flow: aligned with official implementation)
	 * 1. Ripgrep lists all files
	 * 2. Extract parent directories
	 * 3. Merge [directories, files]
	 * 4. Fuse.js fuzzy search the entire list
	 */
	async searchFiles(pattern: string, cwd: string): Promise<FileSearchResult[]> {
		// 1. Ripgrep gets file list
		const files = await this.listFilesWithRipgrep(cwd);

		// 2. Extract all parent directories (with / suffix)
		const directories = this.extractParentDirectories(files);

		// 3. Merge: [directories first, files after]
		const allPaths = [...directories, ...files];

		// 4. Fuse.js search entire list (aligned with official)
		return this.fuseSearchPaths(allPaths, pattern);
	}

	/**
	 * Search files using VSCode API (fallback)
	 */
	async searchFilesWithWorkspace(pattern: string, cwd: string): Promise<FileSearchResult[]> {
		const include = pattern.includes('*') || pattern.includes('?')
			? pattern
			: `**/*${pattern}*`;

		// Auto build exclude patterns
		const excludePatterns = this.buildExcludePatterns();
		const excludeGlob = this.toExcludeGlob(excludePatterns);

		const uris = await vscode.workspace.findFiles(include, excludeGlob, 100);

		return uris.map(uri => {
			const fsPath = uri.fsPath;
			const relative = this.toWorkspaceRelative(fsPath, cwd);
			return {
				path: relative,
				name: path.basename(fsPath),
				type: 'file' as const  // VSCode findFiles also only returns files
			};
		});
	}

	/**
	 * Extract all parent directories from file path list (fully aligned with official implementation)
	 */
	extractParentDirectories(filePaths: string[]): string[] {
		const dirSet = new Set<string>();

		filePaths.forEach(filePath => {
			let current = path.dirname(filePath);

			// Traverse upward, add all parent directories
			while (current !== '.' && current !== path.parse(current).root) {
				dirSet.add(current);
				current = path.dirname(current);
			}
		});

		// Return directory list, add / suffix to mark as directory
		return Array.from(dirSet).map(dir => dir + path.sep);
	}

	/**
	 * Get workspace top-level directories (for empty queries)
	 */
	async getTopLevelDirectories(cwd: string): Promise<FileSearchResult[]> {
		const workspaceUri = vscode.Uri.file(cwd);

		try {
			const entries = await vscode.workspace.fs.readDirectory(workspaceUri);
			const results: FileSearchResult[] = [];

			for (const [name, type] of entries) {
				if (type === vscode.FileType.Directory) {
					results.push({
						path: name,
						name: name,
						type: 'directory'
					});
				}
			}

			return results.sort((a, b) => a.name.localeCompare(b.name));
		} catch {
			return [];
		}
	}

	/**
	 * Get workspace top-level contents (directories + top-level files, for empty queries)
	 */
	async getTopLevelContents(cwd: string): Promise<FileSearchResult[]> {
		try {
			const files = await this.listFilesWithRipgrep(cwd);
			const directories = this.extractParentDirectories(files);
			const allPaths = [...directories, ...files];

			return this.extractTopLevelItems(allPaths);

		} catch (error) {
			// Ripgrep failed, fallback to VSCode API
			console.warn('[FileSystemService] Ripgrep failed in getTopLevelContents, falling back to readDirectory:', error);

			try {
				const workspaceUri = vscode.Uri.file(cwd);
				const entries = await vscode.workspace.fs.readDirectory(workspaceUri);
				const results: FileSearchResult[] = [];

				for (const [name, type] of entries) {
					if (type === vscode.FileType.Directory) {
						results.push({ path: name, name: name, type: 'directory' });
					} else if (type === vscode.FileType.File) {
						results.push({ path: name, name: name, type: 'file' });
					}
				}

				return results.sort((a, b) => {
					if (a.type === 'directory' && b.type === 'file') return -1;
					if (a.type === 'file' && b.type === 'directory') return 1;
					return a.name.localeCompare(b.name);
				});
			} catch (fallbackError) {
				console.error('[FileSystemService] getTopLevelContents fallback also failed:', fallbackError);
				return [];
			}
		}
	}

	/**
	 * Extract top-level items
	 * Extract first-level path from all paths, determine if it's a directory
	 */
	extractTopLevelItems(allPaths: string[]): FileSearchResult[] {
		const topLevelSet = new Set<string>();
		const maxItems = 200;

		for (const filePath of allPaths) {
			const firstLevel = filePath.split(path.sep)[0];
			if (firstLevel) {
				topLevelSet.add(firstLevel);
				if (topLevelSet.size >= maxItems) break;
			}
		}

		return Array.from(topLevelSet).sort().map(topLevel => {
			const hasChildren = allPaths.some(p => p.startsWith(topLevel + path.sep));

			return {
				path: hasChildren ? topLevel + path.sep : topLevel,
				name: path.basename(topLevel),
				type: hasChildren ? 'directory' as const : 'file' as const
			};
		});
	}

	// ===== Private Helper Methods =====

	/**
	 * Execute Ripgrep command (aligned with official implementation)
	 */
	private execRipgrep(args: string[], cwd: string): Promise<string[]> {
		const { command, args: defaultArgs } = this.getRipgrepCommand();

		return new Promise((resolve, reject) => {
			execFile(command, [...defaultArgs, ...args], {
				cwd,
				maxBuffer: 20 * 1024 * 1024,  // 20MB (aligned with official)
				timeout: 10_000                // 10 seconds (aligned with official)
			}, (error, stdout) => {
				// No error, return normally
				if (!error) {
					resolve(stdout.split(/\r?\n/).filter(Boolean));
					return;
				}

				// code === 1 means no match results, not an error
				const code = (error as any)?.code;
				if (code === 1) {
					resolve([]);
					return;
				}

				// Timeout or buffer overflow but has partial results
				const signal = (error as any)?.signal;
				const hasOutput = stdout && stdout.trim().length > 0;

				if ((signal === 'SIGTERM' || code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') && hasOutput) {
					const lines = stdout.split(/\r?\n/).filter(Boolean);
					// Remove potentially incomplete last line
					resolve(lines.length > 0 ? lines.slice(0, -1) : []);
					return;
				}

				reject(error);
			});
		});
	}

	/**
	 * Get Ripgrep command path (aligned with official implementation, skip system detection)
	 */
	private getRipgrepCommand(): { command: string; args: string[] } {
		if (this.ripgrepCommandCache) {
			return this.ripgrepCommandCache;
		}

		// Use extension built-in ripgrep directly (skip system detection)
		const rootDir = path.resolve(__dirname, '..', '..', '..');
		const vendorDir = path.join(rootDir, 'vendor', 'ripgrep');

		let command: string;
		if (process.platform === 'win32') {
			command = path.join(vendorDir, 'x64-win32', 'rg.exe');
		} else {
			const platformKey = `${process.arch}-${process.platform}`;
			command = path.join(vendorDir, platformKey, 'rg');
		}

		// If built-in ripgrep doesn't exist, fallback to system ripgrep
		try {
			require('fs').accessSync(command, require('fs').constants.X_OK);
		} catch {
			command = 'rg';
		}

		this.ripgrepCommandCache = { command, args: [] };
		return this.ripgrepCommandCache;
	}

	/**
	 * Search path list using Fuse.js (fully aligned with official implementation)
	 * @param paths Path list (relative paths, directories with / suffix)
	 * @param pattern Search pattern
	 * @returns Search results
	 */
	private fuseSearchPaths(paths: string[], pattern: string): FileSearchResult[] {
		// 1. Prepare data items
		const items = paths.map(filePath => {
			const isDirectory = filePath.endsWith(path.sep);
			const cleanPath = isDirectory ? filePath.slice(0, -1) : filePath;

			return {
				path: filePath,
				filename: path.basename(cleanPath),
				testPenalty: cleanPath.includes('test') || cleanPath.includes('spec') ? 1 : 0,
				isDirectory
			};
		});

		// 2. If search term contains path separator, filter to keep only items with same parent directory
		const lastSep = pattern.lastIndexOf(path.sep);
		let filteredItems = items;

		if (lastSep > 2) {
			const dirPrefix = pattern.substring(0, lastSep);
			filteredItems = items.filter(item =>
				item.path.substring(0, lastSep).startsWith(dirPrefix)
			);
		}

		// 3. Use Fuse.js for fuzzy search (fully aligned with official config)
		const fuse = new Fuse(filteredItems, {
			includeScore: true,
			threshold: 0.5,
			keys: [
				{ name: 'path', weight: 1 },
				{ name: 'filename', weight: 2 }  // Filename has higher weight
			]
		});

		const results = fuse.search(pattern, { limit: 100 });

		// 4. Secondary sort: if score diff > 0.05 sort by score, otherwise test files go last
		const sorted = results.sort((a, b) => {
			const scoreA = a.score ?? 0;
			const scoreB = b.score ?? 0;

			if (Math.abs(scoreA - scoreB) > 0.05) {
				return scoreA - scoreB;
			}
			return a.item.testPenalty - b.item.testPenalty;
		});

		// 5. Convert to result format (limit 100 items)
		return sorted.slice(0, 100).map(r => {
			const cleanPath = r.item.isDirectory ? r.item.path.slice(0, -1) : r.item.path;

			return {
				path: cleanPath,
				name: r.item.filename,
				type: r.item.isDirectory ? 'directory' : 'file'
			};
		});
	}

	/**
	 * Normalize absolute path (public method, for handlers use)
	 */
	normalizeAbsolutePath(filePath: string, cwd: string): string {
		return path.isAbsolute(filePath)
			? path.normalize(filePath)
			: path.normalize(path.join(cwd, filePath));
	}

	/**
	 * Convert to workspace relative path (public method, for handlers use)
	 */
	toWorkspaceRelative(absolutePath: string, cwd: string): string {
		const normalized = path.normalize(absolutePath);
		const normalizedCwd = path.normalize(cwd);

		if (normalized.startsWith(normalizedCwd)) {
			return normalized.substring(normalizedCwd.length + 1);
		}

		return normalized;
	}

	/**
	 * Resolve file path (supports ~ expansion and relative paths)
	 */
	resolveFilePath(filePath: string, cwd: string): string {
		if (!filePath) {
			return cwd;
		}

		// Expand ~ to user home directory
		const expanded = filePath.startsWith('~')
			? path.join(require('os').homedir(), filePath.slice(1))
			: filePath;

		// Convert to absolute path
		const absolute = path.isAbsolute(expanded)
			? expanded
			: path.join(cwd, expanded);

		return path.normalize(absolute);
	}

	/**
	 * Check if path exists
	 */
	async pathExists(target: string): Promise<boolean> {
		try {
			await require('fs').promises.access(target, require('fs').constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Sanitize file name (remove illegal characters)
	 */
	sanitizeFileName(fileName: string): string {
		const fallback = fileName && fileName.trim() ? fileName.trim() : 'claude.txt';
		return fallback.replace(/[<>:"\\/|?*\x00-\x1F]/g, '_');
	}

	/**
	 * Create temporary file
	 */
	async createTempFile(fileName: string, content: string): Promise<string> {
		const tempDir = await require('fs').promises.mkdtemp(
			path.join(require('os').tmpdir(), 'claude-')
		);
		const sanitized = this.sanitizeFileName(fileName);
		const filePath = path.join(tempDir, sanitized);
		await require('fs').promises.writeFile(filePath, content, 'utf8');
		return filePath;
	}

	/**
	 * Resolve and find existing path (with fuzzy search)
	 */
	async resolveExistingPath(filePath: string, cwd: string, searchResults?: FileSearchResult[]): Promise<string> {
		// 1. Try to resolve path directly
		const absoluteCandidate = this.resolveFilePath(filePath, cwd);
		if (await this.pathExists(absoluteCandidate)) {
			return absoluteCandidate;
		}

		// 2. If search results provided, use first match
		if (searchResults && searchResults.length > 0) {
			const candidate = searchResults[0].path;
			const absolute = this.resolveFilePath(candidate, cwd);
			if (await this.pathExists(absolute)) {
				return absolute;
			}
		}

		// 3. Return original candidate path (even if it doesn't exist)
		return absoluteCandidate;
	}

	/**
	 * Find files (full business logic)
	 */
	async findFiles(pattern: string | undefined, cwd: string): Promise<FileSearchResult[]> {
		// Empty query returns top-level contents (directories + top-level files)
		if (!pattern || !pattern.trim()) {
			return await this.getTopLevelContents(cwd);
		}

		// Other patterns use full search flow (Ripgrep + directory extraction + Fuse.js)
		try {
			return await this.searchFiles(pattern, cwd);
		} catch (error) {
			// Ripgrep failed, fallback to VSCode API
			console.warn(`[FileSystemService] Ripgrep search failed, falling back to VSCode API:`, error);

			try {
				return await this.searchFilesWithWorkspace(pattern, cwd);
			} catch (fallbackError) {
				console.error(`[FileSystemService] Fallback search also failed:`, fallbackError);
				return [];
			}
		}
	}

	/**
	 * Build exclude patterns array (from VSCode config and .gitignore)
	 * Private method, for searchFilesWithRipgrep internal use
	 */
	private buildExcludePatterns(): string[] {
		const patterns = new Set<string>([
			'**/node_modules/**',
			'**/.git/**',
			'**/dist/**',
			'**/build/**',
			'**/.next/**',
			'**/.nuxt/**',
			'**/.DS_Store',
			'**/Thumbs.db',
			'**/*.log',
			'**/.env',
			'**/.env.*'
		]);

		try {
			const searchConfig = vscode.workspace.getConfiguration('search');
			const filesConfig = vscode.workspace.getConfiguration('files');
			const searchExclude = searchConfig.get<Record<string, boolean>>('exclude') ?? {};
			const filesExclude = filesConfig.get<Record<string, boolean>>('exclude') ?? {};

			for (const [glob, enabled] of Object.entries(searchExclude)) {
				if (enabled && typeof glob === 'string' && glob.length > 0) {
					patterns.add(glob);
				}
			}

			for (const [glob, enabled] of Object.entries(filesExclude)) {
				if (enabled && typeof glob === 'string' && glob.length > 0) {
					patterns.add(glob);
				}
			}

			const useIgnoreFiles = searchConfig.get<boolean>('useIgnoreFiles', true);
			if (useIgnoreFiles) {
				const folders = vscode.workspace.workspaceFolders;
				if (folders) {
					for (const folder of folders) {
						const gitignorePatterns = this.readGitignorePatterns(folder.uri.fsPath);
						gitignorePatterns.forEach(p => patterns.add(p));
					}
				}
				const globalPatterns = this.readGlobalGitignorePatterns();
				globalPatterns.forEach(p => patterns.add(p));
			}
		} catch {
			// ignore errors
		}

		return Array.from(patterns);
	}

	/**
	 * Read local .gitignore file
	 */
	private readGitignorePatterns(root: string): string[] {
		const entries: string[] = [];
		const localGitignore = path.join(root, '.gitignore');

		try {
			if (require('fs').existsSync(localGitignore)) {
				const content = require('fs').readFileSync(localGitignore, 'utf8');
				entries.push(...this.parseGitignore(content));
			}
		} catch {
			// ignore errors
		}

		return entries;
	}

	/**
	 * Read global .gitignore file
	 */
	private readGlobalGitignorePatterns(): string[] {
		const entries: string[] = [];
		const globalGitIgnore = path.join(require('os').homedir(), '.config', 'git', 'ignore');

		try {
			if (require('fs').existsSync(globalGitIgnore)) {
				const content = require('fs').readFileSync(globalGitIgnore, 'utf8');
				entries.push(...this.parseGitignore(content));
			}
		} catch {
			// ignore errors
		}

		return entries;
	}

	/**
	 * Parse .gitignore content
	 */
	private parseGitignore(content: string): string[] {
		const results: string[] = [];

		for (const rawLine of content.split(/\r?\n/)) {
			const line = rawLine.trim();
			if (!line || line.startsWith('#') || line.startsWith('!')) {
				continue;
			}

			let transformed = line;
			if (transformed.endsWith('/')) {
				transformed = `${transformed.slice(0, -1)}/**`;
			}
			if (transformed.startsWith('/')) {
				transformed = transformed.slice(1);
			} else {
				transformed = `**/${transformed}`;
			}
			results.push(transformed);
		}

		return results;
	}

	/**
	 * Convert exclude patterns array to glob string
	 * Private method, for searchFilesWithWorkspace internal use
	 */
	private toExcludeGlob(patterns: string[]): string | undefined {
		if (patterns.length === 0) {
			return undefined;
		}
		if (patterns.length === 1) {
			return patterns[0];
		}
		return `{${patterns.join(',')}}`;
	}
}
