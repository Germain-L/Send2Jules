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

    constructor() {
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
        // 1. Stage all changes
        await repo.add([]); // Empty array adds all tracked files usually, or use '.' if supported by the API wrapper, but typically add([]) stages all changes in VS Code API.
        // Actually, looking at VS Code API, add(resources) takes URIs. If we want to stage all, we might need to pass all URIs or look for a stageAll equivalent.
        // However, the guide says `repo.add()`. Let's stick to what the guide implies or use a safe default.
        // The guide says `repo.add('. ')` in the text but `repo.add()` in the code block.
        // In VS Code Git API, `add` takes an array of URIs. To stage all, we usually call `repository.inputBox.value = ''` and then commit, or use the `stage` command.
        // But `repository.add(uris)` is the method.
        // Let's assume for now that passing nothing or an empty array might not work as "stage all" without checking the specific API version behavior, 
        // but the guide code `repo.add()` suggests it might have a default or the author intended to stage all.
        // Let's try to find all changed resources and pass them.

        const changes = [...repo.state.workingTreeChanges, ...repo.state.indexChanges];
        const uris = changes.map(c => c.uri);
        if (uris.length > 0) {
            await repo.add(uris);
        }

        // 2. Commit with standardized message
        const timestamp = new Date().toISOString();
        await repo.commit(`WIP: Auto-save for Jules Handover [${timestamp}]`);

        // 3. Push to upstream
        await repo.push();
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
