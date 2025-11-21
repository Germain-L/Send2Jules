import * as vscode from 'vscode';
import { GitExtension, Repository } from './typings/git';

export interface RepoDetails {
    owner: string;
    name: string;
    branch: string;
    isDirty: boolean;
    repo: Repository;
}

export class GitContextManager {
    private gitApi: any;
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        // Consume the built-in Git extension API
        const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
        if (!extension) throw new Error("Git extension not enabled.");
        this.gitApi = extension.exports.getAPI(1); // Use API version 1
    }

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

    // The Auto-Sync Logic
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

    // Regex Parser for SSH/HTTPS URLs
    private parseGithubUrl(url: string) {
        // Matches git@github.com:owner/repo.git or https://github.com/owner/repo.git
        const regex = /(?:git@|https:\/\/)(?:[\w\.@]+)[\/:]([\w-]+)\/([\w-]+)(?:\.git)?/;
        const match = url.match(regex);
        if (!match) throw new Error(`Could not parse Git Remote URL: ${url}`);
        return { owner: match[1], name: match[2] };
    }
}
