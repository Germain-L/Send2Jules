/**
 * Git Context Manager Module
 * 
 * This module handles all Git-related operations for the Jules Bridge extension:
 * - Repository detection and validation
 * - Remote URL parsing (GitHub SSH and HTTPS)
 * - WIP (Work In Progress) commit creation and pushing
 * - Dirty state detection (uncommitted/unstaged changes)
 * 
 * **WIP Strategy:**
 * When uncommitted changes are detected, this module:
 * 1. Stages all working tree changes
 * 2. Creates a commit with timestamp: "WIP: Auto-save for Jules Handover [timestamp]"
 * 3. Creates a new branch: "wip-jules-[timestamp]"
 * 4. Pushes the branch to remote with upstream tracking
 * 
 * This ensures Jules can access the latest code without affecting the user's working branch.
 * 
 * @module gitContext
 */

import * as vscode from 'vscode';
import { GitExtension, Repository } from './typings/git';

/**
 * Repository details extracted from Git state and remote configuration.
 * Used to identify the GitHub repository and provide context to Jules.
 */
export interface RepoDetails {
    /** GitHub repository owner (username or organization) */
    owner: string;
    /** GitHub repository name */
    name: string;
    /** Current branch name */
    branch: string;
    /** True if there are uncommitted or unstaged changes */
    isDirty: boolean;
    /** VS Code Git API repository object */
    repo: Repository;
}

/**
 * GitContextManager class that handles Git repository operations.
 * 
 * Uses VS Code's built-in Git extension API to interact with repositories.
 */
export class GitContextManager {
    private gitApi: any;
    private outputChannel: vscode.OutputChannel;

    /**
     * Creates a new GitContextManager instance.
     * 
     * @param outputChannel - VS Code output channel for logging
     * @throws Error if Git extension is not enabled
     */
    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        // Consume the built-in Git extension API
        const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
        if (!extension) throw new Error("Git extension not enabled.");
        this.gitApi = extension.exports.getAPI(1); // Use API version 1
    }

    /**
     * Get repository details for the current workspace.
     * 
     * This method tries to find a Git repository in two ways:
     * 1. From the active text editor's file location
     * 2. From the workspace folders (fallback)
     * 
     * Once a repository is found, it extracts:
     * - Owner and repo name from the remote URL
     * - Current branch name
     * - Dirty state (presence of uncommitted changes)
     * 
     * @returns RepoDetails object or null if no repository found
     * @throws Error if no remote is configured
     * 
     * @example
     * ```typescript
     * const details = await gitManager.getRepositoryDetails();
     * if (details) {
     *   console.log(`${details.owner}/${details.name} on ${details.branch}`);
     *   console.log(`Dirty: ${details.isDirty}`);
     * }
     * ```
     */
    async getRepositoryDetails(): Promise<RepoDetails | null> {
        let repo: Repository | undefined;

        // 1. Try to get repo from active file
        if (vscode.window.activeTextEditor) {
            const uri = vscode.window.activeTextEditor.document.uri;
            repo = this.gitApi.getRepository(uri);
        }

        // 2. Fallback: Try to get repo from workspace folders
        if (!repo && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            for (const folder of vscode.workspace.workspaceFolders) {
                const folderRepo = this.gitApi.getRepository(folder.uri);
                if (folderRepo) {
                    repo = folderRepo;
                    break;
                }
            }
        }

        if (!repo) return null;

        const remoteUrl = repo.state.remotes[0]?.fetchUrl;
        if (!remoteUrl) throw new Error("No remote configured for this repository.");

        const { owner, name } = this.parseGithubUrl(remoteUrl);

        // Check for uncommitted changes in working tree or index
        const isDirty = repo.state.workingTreeChanges.length > 0 || repo.state.indexChanges.length > 0;

        return {
            repo,
            owner,
            name,
            branch: repo.state.HEAD?.name || 'main',
            isDirty
        };
    }

    /**
     * Create a WIP commit and push to a new branch.
     * 
     * This is the auto-sync logic that:
     * 1. Stages all working tree changes (with fallback to individual file staging)
     * 2. Creates a commit with timestamp
     * 3. Creates a new branch with format: `wip-jules-YYYY-MM-DDTHH-MM-SS-sssZ`
     * 4. Pushes the branch to remote with upstream tracking
     * 
     * The new branch allows Jules to access the code without affecting the user's
     * current branch. The user can later merge or delete these WIP branches.
     * 
     * @param repo - Git repository object from VS Code Git API
     * @throws Error if staging, committing, or pushing fails
     * 
     * @example
     * ```typescript
     * await gitManager.pushWipChanges(repoDetails.repo);
     * // Creates branch: wip-jules-2024-01-15T10-30-45-123Z
     * // Commit message: "WIP: Auto-save for Jules Handover [2024-01-15T10:30:45.123Z]"
     * ```
     */
    async pushWipChanges(repo: Repository): Promise<void> {
        this.outputChannel.appendLine("Starting pushWipChanges...");

        try {
            // 1. Stage all changes
            // Only stage working tree changes, not already-staged index changes
            const workingTreeChanges = repo.state.workingTreeChanges;
            this.outputChannel.appendLine(`Found ${workingTreeChanges.length} working tree changes.`);

            if (workingTreeChanges.length > 0) {
                this.outputChannel.appendLine("Staging changes...");

                // Use empty array to stage all changes - this is more reliable in WSL
                // than passing individual URIs which can have path conversion issues
                try {
                    await repo.add([]);
                    this.outputChannel.appendLine("Successfully staged all changes.");
                } catch (addError) {
                    // Fallback: try staging individual files if batch staging fails
                    this.outputChannel.appendLine(`Batch staging failed, trying individual files: ${addError}`);
                    const uris = workingTreeChanges.map(c => c.uri);
                    for (const uri of uris) {
                        try {
                            this.outputChannel.appendLine(`Staging: ${uri.fsPath}`);
                            await repo.add([uri]);
                        } catch (fileError) {
                            this.outputChannel.appendLine(`Failed to stage ${uri.fsPath}: ${fileError}`);
                            throw fileError;
                        }
                    }
                }
            } else if (repo.state.indexChanges.length === 0) {
                this.outputChannel.appendLine("No changes to stage or commit.");
                return;
            }

            // 2. Commit with standardized message
            const timestamp = new Date().toISOString();
            const message = `WIP: Auto-save for Jules Handover [${timestamp}]`;
            this.outputChannel.appendLine(`Committing with message: ${message}`);
            await repo.commit(message);
            this.outputChannel.appendLine("Commit successful.");

            // 3. Create and push to a new unique branch
            const remoteName = repo.state.remotes[0]?.name || 'origin';
            const branchSafeTimestamp = timestamp.replace(/[:.]/g, '-');
            const newBranchName = `wip-jules-${branchSafeTimestamp}`;

            this.outputChannel.appendLine(`Creating and pushing to new branch: ${remoteName}/${newBranchName}...`);

            // Create and checkout new branch
            await repo.createBranch(newBranchName, true);

            // Push the new branch to remote with upstream tracking
            await repo.push(remoteName, newBranchName, true);
            this.outputChannel.appendLine("Push complete.");
        } catch (error) {
            this.outputChannel.appendLine(`Error in pushWipChanges: ${error}`);
            throw error;
        }
    }

    /**
     * Parse GitHub repository URL to extract owner and repo name.
     * 
     * Supports both SSH and HTTPS URL formats:
     * - SSH: `git@github.com:owner/repo.git`
     * - HTTPS: `https://github.com/owner/repo.git`
     * 
     * The `.git` extension is optional.
     * 
     * @param url - GitHub remote URL
     * @returns Object with owner and name properties
     * @throws Error if URL format is not recognized
     * @private
     * 
     * @example
     * ```typescript
     * parseGithubUrl('git@github.com:google/jules.git')
     * // Returns: { owner: 'google', name: 'jules' }
     * 
     * parseGithubUrl('https://github.com/google/jules')
     * // Returns: { owner: 'google', name: 'jules' }
     * ```
     */
    private parseGithubUrl(url: string) {
        // Matches git@github.com:owner/repo.git or https://github.com/owner/repo.git
        const regex = /(?:git@|https:\/\/)(?:[\w\.@]+)[\/:]([\w-]+)\/([\w-]+)(?:\.git)?/;
        const match = url.match(regex);
        if (!match) throw new Error(`Could not parse Git Remote URL: ${url}`);
        return { owner: match[1], name: match[2] };
    }
}
