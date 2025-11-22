import * as vscode from 'vscode';
import { Repository } from './typings/git';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DiffSummary {
    modifiedFiles: string[];
    addedFiles: string[];
    deletedFiles: string[];
    totalChanges: number;
}

export class PromptGenerator {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Generate an intelligent prompt based on current workspace context
     */
    async generatePrompt(repo: Repository, activeEditor?: vscode.TextEditor): Promise<string> {
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
            const openFilesContext = await this.getOpenFilesContext();
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
     * Analyze git diff to extract changed files
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
     * Format diff summary into natural language
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
     * Get context around cursor position in active editor
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
     * Detect if cursor is inside a function or class
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
     * Get list of open files and include artifact content
     */
    /**
     * Get list of open files and include artifact content
     */
    private async getOpenFilesContext(): Promise<string | null> {
        try {
            const artifactContent: string[] = [];
            const regularFiles: string[] = [];
            const processedArtifactPaths = new Set<string>();

            // Collect all open tabs with their URIs
            const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
            this.outputChannel.appendLine(`[DEBUG] Found ${tabs.length} open tabs`);

            for (const tab of tabs) {
                if (tab.input && typeof tab.input === 'object' && tab.input !== null && 'uri' in tab.input) {
                    const uri = (tab.input as any).uri as vscode.Uri;
                    const fileName = this.getFileName(uri);
                    const fullPath = uri.fsPath;
                    this.outputChannel.appendLine(`[DEBUG] Checking tab: ${fileName} (${fullPath})`);

                    // Check if this is an Antigravity artifact
                    if (this.isArtifactFile(uri)) {
                        this.outputChannel.appendLine(`[DEBUG] Detected artifact file: ${fileName}`);
                        const content = await this.readArtifactFile(uri, fileName);
                        if (content) {
                            this.outputChannel.appendLine(`[DEBUG] Successfully read artifact content (${content.length} chars)`);
                            artifactContent.push(content);
                            processedArtifactPaths.add(fullPath);
                        } else {
                            this.outputChannel.appendLine(`[DEBUG] Failed to read artifact content`);
                        }
                    } else if (!regularFiles.includes(fileName)) {
                        regularFiles.push(fileName);
                    }
                }
            }

            // Also search the .gemini directory for artifact files not in open tabs
            this.outputChannel.appendLine('[DEBUG] Searching .gemini directory for artifacts...');
            const filesystemArtifacts = await this.findArtifactFiles();
            for (const artifact of filesystemArtifacts) {
                this.outputChannel.appendLine(`[DEBUG] Found filesystem artifact: ${artifact.name}`);

                if (!processedArtifactPaths.has(artifact.path)) {
                    artifactContent.push(artifact.content);
                } else {
                    this.outputChannel.appendLine(`[DEBUG] Skipping duplicate artifact: ${artifact.name}`);
                }
            }

            this.outputChannel.appendLine(`[DEBUG] Artifacts found: ${artifactContent.length}, Regular files: ${regularFiles.length}`);

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
     * Check if a URI is an Antigravity artifact file
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
     * Read and format artifact file content
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
     * Find artifact files in the .gemini directory
     */
    private async findArtifactFiles(): Promise<{ name: string; content: string; path: string }[]> {
        try {
            const homeDir = process.env.HOME || process.env.USERPROFILE;
            if (!homeDir) {
                return [];
            }

            const brainDir = path.join(homeDir, '.gemini', 'antigravity', 'brain');

            // Check if brain dir exists
            try {
                await fs.access(brainDir);
            } catch {
                return [];
            }

            // Get all conversation directories
            const entries = await fs.readdir(brainDir, { withFileTypes: true });
            const dirs = entries.filter(e => e.isDirectory());

            if (dirs.length === 0) {
                return [];
            }

            // Sort by modification time to get the most recent one
            const dirStats = await Promise.all(dirs.map(async (d) => {
                const fullPath = path.join(brainDir, d.name);
                const stats = await fs.stat(fullPath);
                return { name: d.name, path: fullPath, mtime: stats.mtimeMs };
            }));

            // Sort descending
            dirStats.sort((a, b) => b.mtime - a.mtime);

            // Check the most recent directory
            const latestDir = dirStats[0];
            const artifacts: { name: string; content: string; path: string }[] = [];
            const filesToLookFor = ['task.md', 'implementation_plan.md'];

            for (const fileName of filesToLookFor) {
                const filePath = path.join(latestDir.path, fileName);
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
     * Extract file name from URI
     */
    private getFileName(uri: vscode.Uri): string {
        const parts = uri.fsPath.split(/[\\/]/);
        return parts[parts.length - 1];
    }
}
