/**
 * Prompt Generator Module
 * 
 * This module is responsible for generating intelligent, context-aware prompts for Jules
 * by analyzing the current workspace state and combining multiple sources of information:
 * 
 * **Context Sources:**
 * - Git diff analysis (modified, added, deleted files)
 * - Active editor cursor position and selected text
 * - Open files and tabs
 * - Antigravity agent artifacts (task.md, implementation_plan.md)
 * - Function/class context detection
 * 
 * **Artifact Discovery:**
 * The module scans `~/.gemini/antigravity/brain/` for conversation contexts created
 * by Antigravity agents, allowing users to continue from a specific conversation's state.
 * 
 * @module promptGenerator
 */

import * as vscode from 'vscode';
import { Repository } from './typings/git';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Summary of Git repository changes including modified, added, and deleted files.
 * Used to generate context about what the user is currently working on.
 */
export interface DiffSummary {
    /** List of files that have been modified */
    modifiedFiles: string[];
    /** List of files that have been added */
    addedFiles: string[];
    /** List of files that have been deleted */
    deletedFiles: string[];
    /** Total number of changes across all categories */
    totalChanges: number;
}

/**
 * PromptGenerator class that orchestrates the creation of intelligent prompts
 * for Jules based on comprehensive workspace analysis.
 */
export class PromptGenerator {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Get list of available conversation contexts from the Antigravity brain directory.
     * 
     * Scans `~/.gemini/antigravity/brain/` for conversation folders and extracts:
     * - Conversation ID (folder name)
     * - Human-readable title from task.md or implementation_plan.md
     * - Last modified time for sorting
     * 
     * @returns Array of conversation contexts sorted by most recent first
     * 
     * @example
     * ```typescript
     * const contexts = await promptGenerator.getAvailableContexts();
     * // contexts = [
     * //   { name: 'abc-123', title: 'Implement Login', path: '/home/user/.gemini/...', time: 1234567890 },
     * //   { name: 'def-456', title: 'Fix Bug #42', path: '/home/user/.gemini/...', time: 1234567800 }
     * // ]
     * ```
     */
    async getAvailableContexts(): Promise<{ name: string; title: string; path: string; time: number }[]> {
        try {
            const homeDir = process.env.HOME || process.env.USERPROFILE;
            if (!homeDir) return [];

            const brainDir = path.join(homeDir, '.gemini', 'antigravity', 'brain');
            try {
                await fs.access(brainDir);
            } catch {
                return [];
            }

            const entries = await fs.readdir(brainDir, { withFileTypes: true });
            const dirs = entries.filter(e => e.isDirectory());

            const contexts = await Promise.all(dirs.map(async (d) => {
                const fullPath = path.join(brainDir, d.name);
                const stats = await fs.stat(fullPath);

                // Try to read task.md for title
                let title = d.name; // Default to ID
                let foundTitle = false;

                try {
                    const taskPath = path.join(fullPath, 'task.md');
                    const content = await fs.readFile(taskPath, 'utf-8');

                    // Strategy 1: Look for "Task Name:" in content (if stored in text)
                    // Strategy 2: Look for the first H1 header
                    const lines = content.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('# ')) {
                            const candidate = line.substring(2).trim();
                            if (candidate && candidate.toLowerCase() !== 'tasks') {
                                title = candidate;
                                foundTitle = true;
                                break;
                            }
                        }
                    }

                    // Strategy 3: If H1 is generic "Tasks", look for sub-headers or active task
                    if (!foundTitle || title === 'Tasks') {
                        // Try to find a meaningful sub-task or the first non-checked item
                        // But for now, let's stick to the implementation plan title if task.md is generic
                        foundTitle = false;
                    }
                } catch {
                    // Ignore error
                }

                // Fallback to implementation_plan.md if no title found in task.md
                if (!foundTitle) {
                    try {
                        const planPath = path.join(fullPath, 'implementation_plan.md');
                        const content = await fs.readFile(planPath, 'utf-8');
                        const firstLine = content.split('\n')[0];
                        if (firstLine.startsWith('# ')) {
                            title = firstLine.substring(2).trim();
                        } else if (firstLine.startsWith('#')) {
                            title = firstLine.substring(1).trim();
                        }
                    } catch {
                        // Ignore error
                    }
                }

                return {
                    name: d.name,
                    title: title,
                    path: fullPath,
                    time: stats.mtimeMs
                };
            }));

            return contexts.sort((a, b) => b.time - a.time);
        } catch (error) {
            this.outputChannel.appendLine(`Error listing contexts: ${error}`);
            return [];
        }
    }

    /**
     * Generate an intelligent prompt based on current workspace context.
     * 
     * This is the main entry point that combines multiple context sources:
     * 1. Git diff analysis (what files are being worked on)
     * 2. Cursor/selection context (where the user is currently editing)
     * 3. Open files and Antigravity artifacts (task.md, implementation_plan.md)
     * 
     * The generated prompt provides Jules with rich context about the current work state.
     * 
     * @param repo - Git repository object for diff analysis
     * @param activeEditor - Currently active text editor (optional)
     * @param contextPath - Specific conversation context path to use (optional, defaults to latest)
     * @returns Generated prompt string ready for Jules API
     * 
     * @example
     * ```typescript
     * const prompt = await promptGenerator.generatePrompt(
     *   repository,
     *   vscode.window.activeTextEditor,
     *   '/home/user/.gemini/antigravity/brain/abc-123'
     * );
     * // prompt might be:
     * // "Working on:
     * //  Modified: auth.ts, login.tsx
     * //  
     * //  Working on function "handleLogin" in auth.ts
     * //  
     * //  --- CURRENT TASK CHECKLIST ---
     * //  - [x] Implement login form..."
     * ```
     */
    async generatePrompt(repo: Repository, activeEditor?: vscode.TextEditor, contextPath?: string): Promise<string> {
        try {
            const parts: string[] = [];

            // 1. Analyze git diff for uncommitted changes
            const diffSummary = this.getGitDiffSummary(repo);
            if (diffSummary.totalChanges > 0) {
                parts.push(this.formatDiffContext(diffSummary));
            }

            // 2. Get cursor context from active editor
            if (activeEditor) {
                const cursorContext = this.getCursorContext(activeEditor);
                if (cursorContext) {
                    parts.push(cursorContext);
                }
            }

            // 3. Collect open files and artifact content
            // If contextPath is provided, use it. Otherwise, it will default to auto-discovery.
            const openFilesContext = await this.getOpenFilesContext(contextPath);
            if (openFilesContext) {
                parts.push(openFilesContext);
            }

            // 4. Generate final prompt
            if (parts.length === 0) {
                return "Continue working on this project";
            }

            return parts.join('\n\n');
        } catch (error) {
            this.outputChannel.appendLine(`Error generating prompt: ${error}`);
            return "Continue working on this project";
        }
    }

    /**
     * Analyze git diff to extract changed files from working tree and index.
     * 
     * Categorizes changes into:
     * - Modified: Existing files that have been changed
     * - Added: New files that have been created
     * - Deleted: Files that have been removed
     * 
     * @param repo - Git repository object
     * @returns DiffSummary containing categorized file changes
     * @private
     */
    private getGitDiffSummary(repo: Repository): DiffSummary {
        const modifiedFiles: string[] = [];
        const addedFiles: string[] = [];
        const deletedFiles: string[] = [];

        // Combine working tree and index changes
        const allChanges = [...repo.state.workingTreeChanges, ...repo.state.indexChanges];

        for (const change of allChanges) {
            const fileName = this.getFileName(change.uri);

            // Determine change type based on status
            // Status: 0=INDEX_MODIFIED, 1=INDEX_ADDED, 2=INDEX_DELETED, etc.
            const status = change.status;

            if (status === 6 || status === 7) { // Deleted or TYPE_CHANGE
                if (!deletedFiles.includes(fileName)) {
                    deletedFiles.push(fileName);
                }
            } else if (status === 1 || status === 3) { // Added or UNTRACKED
                if (!addedFiles.includes(fileName)) {
                    addedFiles.push(fileName);
                }
            } else {
                if (!modifiedFiles.includes(fileName)) {
                    modifiedFiles.push(fileName);
                }
            }
        }

        return {
            modifiedFiles,
            addedFiles,
            deletedFiles,
            totalChanges: modifiedFiles.length + addedFiles.length + deletedFiles.length
        };
    }

    /**
     * Format diff summary into natural language for the prompt.
     * 
     * Converts the structured DiffSummary into human-readable text like:
     * "Working on:
     *  Modified: file1.ts, file2.ts
     *  Added: newfile.ts"
     * 
     * @param diff - DiffSummary object with categorized changes
     * @returns Formatted string describing the changes
     * @private
     */
    private formatDiffContext(diff: DiffSummary): string {
        const parts: string[] = [];

        if (diff.modifiedFiles.length > 0) {
            parts.push(`Modified: ${diff.modifiedFiles.join(', ')}`);
        }
        if (diff.addedFiles.length > 0) {
            parts.push(`Added: ${diff.addedFiles.join(', ')}`);
        }
        if (diff.deletedFiles.length > 0) {
            parts.push(`Deleted: ${diff.deletedFiles.join(', ')}`);
        }

        if (parts.length === 0) {
            return 'Continue working on uncommitted changes';
        }

        return `Working on:\n${parts.join('\n')}`;
    }

    /**
     * Get context around cursor position in active editor.
     * 
     * Analyzes:
     * - Selected text (if any)
     * - Current line number
     * - Symbol context (function/class the cursor is in)
     * - File name
     * 
     * @param editor - Active text editor
     * @returns Context string or null if no meaningful context found
     * @private
     */
    private getCursorContext(editor: vscode.TextEditor): string | null {
        try {
            const document = editor.document;
            const position = editor.selection.active;
            const fileName = this.getFileName(document.uri);

            // Get selected text if any
            if (!editor.selection.isEmpty) {
                const selectedText = document.getText(editor.selection);
                const lineCount = editor.selection.end.line - editor.selection.start.line + 1;
                return `Reviewing ${lineCount} line(s) in ${fileName} at line ${position.line + 1}`;
            }

            // Get current line context
            const line = document.lineAt(position.line);
            const lineText = line.text.trim();

            // Detect if cursor is in a function/class
            const symbolContext = this.detectSymbolContext(document, position);
            if (symbolContext) {
                return `Working on ${symbolContext} in ${fileName}`;
            }

            // Fallback: just mention the file and line
            if (lineText.length > 0) {
                return `Editing ${fileName} at line ${position.line + 1}`;
            }

            return `Editing ${fileName}`;
        } catch (error) {
            this.outputChannel.appendLine(`Error getting cursor context: ${error}`);
            return null;
        }
    }

    /**
     * Detect if cursor is inside a function or class definition.
     * 
     * Uses regex patterns to match common function/class declarations in:
     * - TypeScript/JavaScript (function, const/let/var arrow functions, classes)
     * - Python (def, class)
     * 
     * @param document - Text document to analyze
     * @param position - Cursor position
     * @returns Symbol context string (e.g., 'function "handleLogin"') or null
     * @private
     */
    private detectSymbolContext(document: vscode.TextDocument, position: vscode.Position): string | null {
        try {
            const text = document.getText();
            const offset = document.offsetAt(position);

            // Simple regex patterns for common languages
            const patterns = [
                // TypeScript/JavaScript: function name(...) or const name = (...) =>
                /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g,
                // TypeScript/JavaScript: class name
                /class\s+(\w+)/g,
                // Python: def name(...):
                /def\s+(\w+)/g,
                // Python: class name:
                /class\s+(\w+)/g,
            ];

            for (const pattern of patterns) {
                let match;
                while ((match = pattern.exec(text)) !== null) {
                    const matchStart = match.index;
                    const matchEnd = pattern.lastIndex;

                    if (matchStart <= offset && offset <= matchEnd + 200) { // Within ~200 chars of definition
                        const name = match[1] || match[2];
                        if (name) {
                            // Determine if it's a function or class
                            const matchText = match[0];
                            if (matchText.includes('class')) {
                                return `class "${name}"`;
                            } else {
                                return `function "${name}"`;
                            }
                        }
                    }
                }
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Check if a URI points to an Antigravity artifact file.
     * 
     * Artifact files are stored in `~/.gemini/antigravity/brain/<conversation_id>/`
     * and include task.md and implementation_plan.md.
     * 
     * @param uri - File URI to check
     * @returns True if the file is an artifact
     * @private
     */
    private isArtifactFile(uri: vscode.Uri): boolean {
        const path = uri.fsPath;
        const isArtifact = (
            path.includes('/.gemini/antigravity/brain/') &&
            (path.endsWith('/task.md') || path.endsWith('/implementation_plan.md'))
        );
        this.outputChannel.appendLine(`[DEBUG] isArtifactFile check: ${path} -> ${isArtifact}`);
        return isArtifact;
    }

    /**
     * Read and format artifact file content with a header.
     * 
     * Reads the content of task.md or implementation_plan.md and formats it
     * with a clear header for inclusion in the prompt.
     * 
     * @param uri - URI of the artifact file
     * @param fileName - Name of the file (task.md or implementation_plan.md)
     * @returns Formatted content string or null if file is empty/unreadable
     * @private
     */
    private async readArtifactFile(uri: vscode.Uri, fileName: string): Promise<string | null> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();

            if (!content || content.trim().length === 0) {
                return null;
            }

            // Format with clear header
            const header = fileName === 'task.md' ? 'CURRENT TASK CHECKLIST' : 'IMPLEMENTATION PLAN';
            return `--- ${header} ---\n${content.trim()}`;
        } catch (error) {
            this.outputChannel.appendLine(`Error reading artifact ${fileName}: ${error}`);
            return null;
        }
    }

    /**
     * Get list of open files and include artifact content.
     * 
     * Processes all open tabs to:
     * 1. Identify and read Antigravity artifact files (task.md, implementation_plan.md)
     * 2. List regular open files
     * 3. Search filesystem for artifacts if not already open
     * 
     * Artifacts from the selected conversation context are prioritized.
     * 
     * @param specificContextPath - Optional path to specific conversation context
     * @returns Formatted string with artifacts and file list, or null if none found
     * @private
     */
    private async getOpenFilesContext(specificContextPath?: string): Promise<string | null> {
        try {
            const artifactContent: string[] = [];
            const regularFiles: string[] = [];
            const processedArtifactPaths = new Set<string>();

            // Collect all open tabs with their URIs
            const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);

            for (const tab of tabs) {
                if (tab.input && typeof tab.input === 'object' && tab.input !== null && 'uri' in tab.input) {
                    const uri = (tab.input as any).uri as vscode.Uri;
                    const fileName = this.getFileName(uri);
                    const fullPath = uri.fsPath;

                    // Check if this is an Antigravity artifact
                    if (this.isArtifactFile(uri)) {
                        // If a specific context is requested, only include artifacts from that path
                        if (specificContextPath && !fullPath.startsWith(specificContextPath)) {
                            continue;
                        }

                        const content = await this.readArtifactFile(uri, fileName);
                        if (content) {
                            artifactContent.push(content);
                            processedArtifactPaths.add(fullPath);
                        }
                    } else if (!regularFiles.includes(fileName)) {
                        regularFiles.push(fileName);
                    }
                }
            }

            // Search for artifacts in the specified context or default location
            const filesystemArtifacts = await this.findArtifactFiles(specificContextPath);
            for (const artifact of filesystemArtifacts) {
                if (!processedArtifactPaths.has(artifact.path)) {
                    artifactContent.push(artifact.content);
                }
            }

            const parts: string[] = [];

            // Include artifact content first (most important)
            if (artifactContent.length > 0) {
                parts.push(...artifactContent);
            }

            // Include regular files list
            if (regularFiles.length > 0) {
                const fileList = regularFiles.slice(0, 5).join(', ');
                parts.push(`Other open files: ${fileList}`);
            }

            return parts.length > 0 ? parts.join('\n\n') : null;
        } catch (error) {
            this.outputChannel.appendLine(`Error getting open files: ${error}`);
            return null;
        }
    }

    /**
     * Find artifact files in the .gemini directory.
     * 
     * Searches for task.md and implementation_plan.md in:
     * - A specific context path (if provided)
     * - The most recent conversation context (if no path provided)
     * 
     * @param specificContextPath - Optional path to specific conversation context
     * @returns Array of artifact objects with name, content, and path
     * @private
     */
    private async findArtifactFiles(specificContextPath?: string): Promise<{ name: string; content: string; path: string }[]> {
        try {
            let targetDir = specificContextPath;

            // If no specific path provided, find the most recent one
            if (!targetDir) {
                const contexts = await this.getAvailableContexts();
                if (contexts.length === 0) return [];
                targetDir = contexts[0].path;
            }

            const artifacts: { name: string; content: string; path: string }[] = [];
            const filesToLookFor = ['task.md', 'implementation_plan.md'];

            for (const fileName of filesToLookFor) {
                const filePath = path.join(targetDir!, fileName);
                try {
                    await fs.access(filePath);
                    const uri = vscode.Uri.file(filePath);
                    const content = await this.readArtifactFile(uri, fileName);
                    if (content) {
                        artifacts.push({ name: fileName, content, path: filePath });
                    }
                } catch {
                    // File doesn't exist, skip
                }
            }

            return artifacts;
        } catch (error) {
            this.outputChannel.appendLine(`Error finding artifact files: ${error}`);
            return [];
        }
    }

    /**
     * Extract file name from URI.
     * 
     * Cross-platform utility that handles both Windows and Unix path separators.
     * 
     * @param uri - File URI
     * @returns File name (last segment of path)
     * @private
     */
    private getFileName(uri: vscode.Uri): string {
        const parts = uri.fsPath.split(/[\\/]/);
        return parts[parts.length - 1];
    }
}
