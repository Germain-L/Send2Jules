import * as vscode from 'vscode';

export class SecretsManager {
    private static readonly KEY = 'jules_api_key';

    constructor(private context: vscode.ExtensionContext) { }

    // securely store the key in OS keychain
    async storeKey(token: string): Promise<void> {
        await this.context.secrets.store(SecretsManager.KEY, token);
    }

    // Retrieve key from OS keychain
    async getKey(): Promise<string | undefined> {
        return await this.context.secrets.get(SecretsManager.KEY);
    }

    // Interactive prompt for first-time setup
    async promptAndStoreKey(): Promise<string | undefined> {
        const token = await vscode.window.showInputBox({
            title: "Enter Jules API Key",
            prompt: "Found in Google Cloud Console or Jules Settings",
            password: true, // Masks input characters
            ignoreFocusOut: true
        });
        if (token) {
            await this.storeKey(token);
            vscode.window.showInformationMessage("Jules API Key saved securely.");
        }
        return token;
    }
}
