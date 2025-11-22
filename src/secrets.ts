/**
 * Secrets Management Module
 * 
 * This module handles secure storage and retrieval of the Jules API key using
 * VS Code's SecretStorage API, which integrates with the OS keychain:
 * - macOS: Keychain
 * - Windows: Credential Manager
 * - Linux: Secret Service API (gnome-keyring/kwallet)
 * 
 * The API key is never stored in plain text in configuration files.
 * 
 * @module secrets
 */

import * as vscode from 'vscode';

/**
 * Manager for securely storing and retrieving the Jules API key.
 * 
 * Uses VS Code's SecretStorage API which provides OS-level encryption.
 */
export class SecretsManager {
    /** Storage key for the Jules API token in SecretStorage */
    private static readonly KEY = 'jules_api_key';

    constructor(private context: vscode.ExtensionContext) { }

    /**
     * Securely store the Jules API key in OS keychain.
     * 
     * @param token - Jules API key to store
     */
    async storeKey(token: string): Promise<void> {
        await this.context.secrets.store(SecretsManager.KEY, token);
    }

    /**
     * Retrieve the Jules API key from OS keychain.
     * 
     * @returns API key if stored, undefined otherwise
     */
    async getKey(): Promise<string | undefined> {
        return await this.context.secrets.get(SecretsManager.KEY);
    }

    /**
     * Interactive prompt for first-time API key setup.
     * 
     * Shows an input box with masked input to collect the API key,
     * then stores it securely in the OS keychain.
     * 
     * @returns Entered API key or undefined if user cancelled
     * 
     * @example
     * ```typescript
     * const key = await secretsManager.promptAndStoreKey();
     * if (key) {
     *   console.log('API key saved successfully');
     * }
     * ```
     */
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
