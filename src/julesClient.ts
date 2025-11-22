import { SecretsManager } from './secrets';

export class ProjectNotInitializedError extends Error {
    constructor(public owner: string, public repo: string) {
        super(`Project ${owner}/${repo} not initialized in Jules.`);
        this.name = 'ProjectNotInitializedError';
    }
}

export class JulesClient {
    constructor(private secrets: SecretsManager) { }

    async createSession(owner: string, repo: string, branch: string, prompt: string): Promise<JulesSession> {
        let apiKey = await this.secrets.getKey();
        if (!apiKey) {
            // Prompt if missing during execution
            apiKey = await this.secrets.promptAndStoreKey();
            if (!apiKey) throw new Error("API Key required.");
        }

        const payload = {
            prompt: prompt,
            sourceContext: {
                source: `sources/github/${owner}/${repo}`,
                githubRepoContext: { startingBranch: branch }
            },
            title: `Auto-Handoff: ${new Date().toLocaleTimeString()}`
        };

        // Using global fetch (Node 18+ / VS Code)
        const response = await fetch('https://jules.googleapis.com/v1alpha/sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            if (response.status === 404) {
                // Check if it's the "Requested entity was not found" error
                const errorText = await response.text();
                if (errorText.includes("Requested entity was not found")) {
                    throw new ProjectNotInitializedError(owner, repo);
                }
                throw new Error(`API Error ${response.status}: ${errorText}`);
            }
            throw new Error(`API Error ${response.status}: ${await response.text()}`);
        }

        return await response.json() as JulesSession;
    }
}

export interface JulesSession {
    name: string;
    id: string;
}
