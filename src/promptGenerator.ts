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
import * as os from 'os';
import { validatePathInBrainDirectory } from './validators';
import { CODE_ANALYSIS, GitStatus, PATHS, LOG_PREFIX, VALIDATION } from './constants';

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
     */
    async getAvailableContexts(): Promise<{ name: string; title: string; path: string; time: number }[]> {
        try {
            const homeDir = os.homedir();
            if (!homeDir) return [];

            const brainDir = path.join(homeDir, ...PATHS.BRAIN_PATH_SEGMENTS);
            try {
                await fs.access(brainDir);
            } catch {
                return [];
            }

            const entries = await fs.readdir(brainDir, { withFileTypes: true });
            const dirs = entries.filter(e => e.isDirectory());

            // PERFORMANCE: Load metadata in parallel with Promise.allSettled
            const contexts = await Promise.allSettled(
                dirs.map(d => this.loadContextMetadata(brainDir, d.name))
            );

            // Filter out failed loads and extract values
            const validContexts = contexts
                .filter((result): result is PromiseFulfilledResult<{ name: string; title: string; path: string; time: number }> =>
                    result.status === 'fulfilled'
                )
                .map(result => result.value);

            return validContexts.sort((a, b) => b.time - a.time);
        } catch (error) {
            this.outputChannel.appendLine(`Error listing contexts: ${error}`);
            return [];
        }
    }

    /**
     * Load metadata for a single context directory
     * @private
     */
    private async loadContextMetadata(
        brainDir: string,
        dirName: string
    ): Promise<{ name: string; title: string; path: string; time: number }> {
        const fullPath = path.join(brainDir, dirName);
        const stats = await fs.stat(fullPath);

        // Try to extract title from artifacts
        const title = await this.extractContextTitle(fullPath, dirName);

        return {
            name: dirName,
            title: title,
            path: fullPath,
            time: stats.mtimeMs
        };
    }

    /**
     * Extract human-readable title from context artifacts
     * @private
     */
    private async extractContextTitle(contextPath: string, fallbackName: string): Promise<string> {
        // Try task.md first
        const title = await this.tryExtractTitleFromFile(
            path.join(contextPath, 'task.md')
        );
        if (title) return title;

        // Fallback to implementation_plan.md
        const planTitle = await this.tryExtractTitleFromFile(
            path.join(contextPath, 'implementation_plan.md')
        );
        if (planTitle) return planTitle;

        // Final fallback to directory name
        return fallbackName;
    }

    /**
     * Try to extract title from a markdown file
     * PERFORMANCE: Only reads first 1KB to avoid loading large files
     * @private
     */
    private async tryExtractTitleFromFile(filePath: string): Promise<string | null> {
        try {
            // PERFORMANCE: Read only first 1KB to find the title
            const fileHandle = await fs.open(filePath, 'r');
            const buffer = Buffer.alloc(CODE_ANALYSIS.TITLE_READ_SIZE);
            await fileHandle.read(buffer, 0, CODE_ANALYSIS.TITLE_READ_SIZE, 0);
            await fileHandle.close();

            const content = buffer.toString('utf-8');
            const lines = content.split('\n');

            for (const line of lines) {
                if (line.startsWith('# ')) {
                    const candidate = line.substring(2).trim();
                    // Skip generic titles
                    if (candidate && !['Tasks', 'Task', 'Implementation Plan'].includes(candidate)) {
                        return candidate;
                    }
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Generate an intelligent prompt based on current workspace context.
     * 
     * This is the main entry point that combines multiple context sources:
     * 1. Git diff analysis (what files are being worked on)
     * 2. Active errors (diagnostics)
     * 3. Cursor/selection context (where the user is currently editing)
     * 4. Open files and Antigravity artifacts (task.md, implementation_plan.md)
     * 
     * The generated prompt uses an XML structure to provide clear context to Jules.
     * 
     * @param repo - Git repository object for diff analysis
     * @param activeEditor - Currently active text editor (optional)
     * @param contextPath - Specific conversation context path to use (optional, defaults to latest)
     * @returns Generated prompt string ready for Jules API
     */
    async generatePrompt(repo: Repository, activeEditor?: vscode.TextEditor, contextPath?: string): Promise<string> {
        try {
            // Execute context gathering in parallel
            const [diff, errors, symbols, artifacts] = await Promise.all([
                this.getUnifiedDiff(repo),
                this.getDiagnostics(),
                activeEditor ? this.getDeepSymbolContext(activeEditor) : Promise.resolve(null),
                this.getOpenFilesContext(contextPath)
            ]);

            // Assemble XML parts
            return this.assemblePrompt(diff, errors, symbols, artifacts, activeEditor);
        } catch (error) {
            this.outputChannel.appendLine(`Error generating prompt: ${error}`);
            return `<instruction>Continue working on this project</instruction>
<workspace_context>
</workspace_context>
<mission_brief>[Describe your task here...]</mission_brief>`;
        }
    }

    /**
     * Get unified diff content for staged and unstaged changes.
     * Iterates through changed files and reads their current content.
     */
    private async getUnifiedDiff(repo: Repository): Promise<string> {
        const changes = [...repo.state.workingTreeChanges, ...repo.state.indexChanges];
        if (changes.length === 0) return '';

        const parts: string[] = [];
        const processedFiles = new Set<string>();

        for (const change of changes) {
            const fileName = this.getFileName(change.uri);
            if (processedFiles.has(fileName)) continue;
            processedFiles.add(fileName);

            try {
                // Spec: "For each file, read its current text content."
                const document = await vscode.workspace.openTextDocument(change.uri);
                const content = document.getText();
                parts.push(`--- ${fileName} ---\n${content}`);
            } catch (e) {
                // Handle deleted files or errors
                if (change.status === GitStatus.DELETED || change.status === GitStatus.INDEX_DELETED) {
                    parts.push(`--- ${fileName} ---\n[DELETED]`);
                }
            }
        }
        return parts.join('\n\n');
    }

    /**
     * Get deep symbol context using LSP.
     * Returns a breadcrumb string: "Class: UserManager > Method: validateSession"
     */
    private async getDeepSymbolContext(editor: vscode.TextEditor): Promise<string | null> {
        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                editor.document.uri
            );

            if (!symbols || symbols.length === 0) return null;

            const position = editor.selection.active;
            return this.findDeepestSymbol(symbols, position);
        } catch (e) {
            return null;
        }
    }

    private findDeepestSymbol(symbols: vscode.DocumentSymbol[], position: vscode.Position, parentChain: string[] = []): string | null {
        for (const symbol of symbols) {
            if (symbol.range.contains(position)) {
                const kindName = vscode.SymbolKind[symbol.kind];
                const name = symbol.name;
                const currentChain = [...parentChain, `${kindName}: ${name}`];

                if (symbol.children && symbol.children.length > 0) {
                    const childResult = this.findDeepestSymbol(symbol.children, position, currentChain);
                    if (childResult) return childResult;
                }
                return currentChain.join(' > ');
            }
        }
        return null;
    }

    /**
     * Get active diagnostics (errors).
     */
    private async getDiagnostics(): Promise<string | null> {
        const diagnostics = vscode.languages.getDiagnostics();
        const errors: string[] = [];

        for (const [uri, diags] of diagnostics) {
            for (const diag of diags) {
                if (diag.severity === vscode.DiagnosticSeverity.Error) {
                    const fileName = this.getFileName(uri);
                    errors.push(`File: ${fileName} Line ${diag.range.start.line + 1}: ${diag.message}`);
                }
            }
        }

        return errors.length > 0 ? errors.join('\n') : null;
    }

    /**
     * Check if a URI points to an Antigravity artifact file.
     */
    private isArtifactFile(uri: vscode.Uri): boolean {
        const filePath = uri.fsPath;
        const isArtifact = (
            filePath.includes(path.sep + path.join(...PATHS.BRAIN_PATH_SEGMENTS) + path.sep) &&
            PATHS.ARTIFACTS.some(artifact => filePath.endsWith(path.sep + artifact))
        );
        return isArtifact;
    }

    /**
     * Read and format artifact file content with a header.
     */
    private async readArtifactFile(uri: vscode.Uri, fileName: string): Promise<string | null> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();

            if (!content || content.trim().length === 0) {
                return null;
            }

            const header = fileName === 'task.md' ? 'CURRENT TASK CHECKLIST' : 'IMPLEMENTATION PLAN';
            return `--- ${header} ---\n${content.trim()}`;
        } catch (error) {
            this.outputChannel.appendLine(`Error reading artifact ${fileName}: ${error}`);
            return null;
        }
    }

    /**
     * Get list of open files and include artifact content.
     */
    private async getOpenFilesContext(specificContextPath?: string): Promise<string | null> {
        try {
            const artifactContent: string[] = [];
            const regularFiles: string[] = [];
            const processedArtifactPaths = new Set<string>();

            const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);

            for (const tab of tabs) {
                if (tab.input && typeof tab.input === 'object' && tab.input !== null && 'uri' in tab.input) {
                    const uri = (tab.input as any).uri as vscode.Uri;
                    const fileName = this.getFileName(uri);
                    const fullPath = uri.fsPath;

                    if (this.isArtifactFile(uri)) {
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

            const filesystemArtifacts = await this.findArtifactFiles(specificContextPath);
            for (const artifact of filesystemArtifacts) {
                if (!processedArtifactPaths.has(artifact.path)) {
                    artifactContent.push(artifact.content);
                }
            }

            const parts: string[] = [];

            if (artifactContent.length > 0) {
                parts.push(...artifactContent);
            }

            if (regularFiles.length > 0) {
                const fileList = regularFiles.slice(0, CODE_ANALYSIS.MAX_FILES_IN_PROMPT).join(', ');
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
     */
    private async findArtifactFiles(specificContextPath?: string): Promise<{ name: string; content: string; path: string }[]> {
        try {
            let targetDir = specificContextPath;

            if (!targetDir) {
                const contexts = await this.getAvailableContexts();
                if (contexts.length === 0) return [];
                targetDir = contexts[0].path;
            }

            const homeDir = os.homedir();
            if (!homeDir) {
                this.outputChannel.appendLine(`${LOG_PREFIX.SECURITY} Could not determine home directory`);
                return [];
            }

            const brainDir = path.join(homeDir, ...PATHS.BRAIN_PATH_SEGMENTS);
            const resolvedBrainDir = path.resolve(brainDir);

            try {
                validatePathInBrainDirectory(targetDir, resolvedBrainDir);
            } catch (error) {
                this.outputChannel.appendLine(`${LOG_PREFIX.SECURITY} Path validation failed: ${error}`);
                return [];
            }

            const artifacts: { name: string; content: string; path: string }[] = [];

            for (const fileName of PATHS.ARTIFACTS) {
                const filePath = path.join(targetDir, fileName);

                try {
                    validatePathInBrainDirectory(filePath, resolvedBrainDir);
                } catch (error) {
                    this.outputChannel.appendLine(`${LOG_PREFIX.SECURITY} File path outside brain directory: ${filePath}`);
                    continue;
                }

                try {
                    await fs.access(filePath, fs.constants.R_OK);
                    const uri = vscode.Uri.file(filePath);
                    const content = await this.readArtifactFile(uri, fileName);
                    if (content) {
                        artifacts.push({ name: fileName, content, path: filePath });
                    }
                } catch (error: any) {
                    if (error.code !== 'ENOENT' && error.code !== 'EACCES') {
                        this.outputChannel.appendLine(`Unexpected error accessing ${fileName}: ${error.code}`);
                    }
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
     */
    private getFileName(uri: vscode.Uri): string {
        const parts = uri.fsPath.split(/[\\/]/);
        return parts[parts.length - 1];
    }

    /**
     * Assemble the final prompt XML with budget management.
     */
    private assemblePrompt(diff: string, errors: string | null, symbols: string | null, artifacts: string | null, activeEditor?: vscode.TextEditor): string {
        const instruction = "You are an expert software engineer. Analyze the workspace context and complete the mission brief.";
        const missionBriefPlaceholder = "[Describe your task here...]";

        const maxLen = VALIDATION.PROMPT_MAX_LENGTH;

        const baseStart = `<instruction>${instruction}</instruction>\n<workspace_context>\n`;
        const baseEnd = `</workspace_context>\n<mission_brief>${missionBriefPlaceholder}</mission_brief>`;

        // Calculate available budget for context
        let currentLen = baseStart.length + baseEnd.length;
        let remainingBudget = maxLen - currentLen;

        // 2. Active File & Cursor
        let activeFileStr = "";
        if (activeEditor) {
            const fileName = this.getFileName(activeEditor.document.uri);
            const cursorLine = activeEditor.selection.active.line + 1;
            const fileContent = activeEditor.document.getText();

            let contextStr = `File: ${fileName}\nCursor Line: ${cursorLine}`;
            if (symbols) {
                contextStr += `\nContext: ${symbols}`;
            }
            contextStr += `\n\n${fileContent}`;

            activeFileStr = `<active_file>\n${contextStr}\n</active_file>\n`;
        }

        // 3. Active Errors
        let activeErrorsStr = "";
        if (errors) {
            activeErrorsStr = `<active_errors>\n${errors}\n</active_errors>\n`;
        }

        // 4. Git Diff
        let gitDiffStr = "";
        if (diff) {
            gitDiffStr = `<git_diff>\n${diff}\n</git_diff>\n`;
        }

        // 5. Artifacts
        let artifactsStr = "";
        if (artifacts) {
            artifactsStr = `<artifacts>\n${artifacts}\n</artifacts>\n`;
        }

        // Assemble with priority
        let finalContext = "";

        // Priority 2: Active File
        if (activeFileStr.length <= remainingBudget) {
            finalContext += activeFileStr;
            remainingBudget -= activeFileStr.length;
        } else {
            // Truncate active file if needed
            const header = activeFileStr.split('\n\n')[0];
            if (header.length < remainingBudget) {
                finalContext += header + "\n[Content truncated]\n</active_file>\n";
                remainingBudget -= (header.length + 30);
            }
        }

        // Priority 3: Active Errors
        if (activeErrorsStr.length <= remainingBudget) {
            finalContext += activeErrorsStr;
            remainingBudget -= activeErrorsStr.length;
        } else {
            if (remainingBudget > 50) {
                finalContext += activeErrorsStr.substring(0, remainingBudget - 20) + "...</active_errors>\n";
                remainingBudget = 0;
            }
        }

        // Priority 4: Git Diff
        if (gitDiffStr.length <= remainingBudget) {
            finalContext += gitDiffStr;
            remainingBudget -= gitDiffStr.length;
        } else {
            if (remainingBudget > 50) {
                finalContext += gitDiffStr.substring(0, remainingBudget - 20) + "...</git_diff>\n";
                remainingBudget = 0;
            }
        }

        // Priority 5: Artifacts
        if (artifactsStr.length <= remainingBudget) {
            finalContext += artifactsStr;
            remainingBudget -= artifactsStr.length;
        } else {
            if (remainingBudget > 50) {
                finalContext += artifactsStr.substring(0, remainingBudget - 20) + "...</artifacts>\n";
                remainingBudget = 0;
            }
        }

        return `${baseStart}${finalContext}${baseEnd}`;
    }
}
