import * as vscode from 'vscode';

export interface GitExtension {
    getAPI(version: 1): API;
}

export interface API {
    getRepository(uri: vscode.Uri): Repository | null;
    repositories: Repository[];
}

export interface Repository {
    state: RepositoryState;
    add(resources?: vscode.Uri[]): Promise<void>;
    commit(message: string): Promise<void>;
    push(remoteName?: string, branchName?: string, setUpstream?: boolean): Promise<void>;
    createBranch(name: string, checkout: boolean, ref?: string): Promise<void>;
    checkout(treeish: string): Promise<void>;
}

export interface RepositoryState {
    HEAD: Branch | undefined;
    remotes: Remote[];
    workingTreeChanges: Change[];
    indexChanges: Change[];
}

export interface Branch {
    name?: string;
    commit?: string;
}

export interface Remote {
    name: string;
    fetchUrl?: string;
    pushUrl?: string;
}

export interface Change {
    uri: vscode.Uri;
}
