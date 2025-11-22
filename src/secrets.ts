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
 * **Security:** API keys are validated before storage to prevent malformed data.
 * 
 * @module secrets
 */

import * as vscode from 'vscode';
import { validateApiKey } from './validators';
import { MESSAGES } from './constants';

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
     * Securely store the Jules API key in OS keychain with validation.
     * 
     * @param token - Jules API key to store
     * @throws ValidationError if API key format is invalid
     */
    async storeKey(token: string): Promise<void> {
        // SECURITY: Validate API key format before storage
        validateApiKey(token);
        await this.context.secrets.store(SecretsManager.KEY, token.trim());
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
     * Interactive prompt for first-time API key setup with real-time validation.
     * 
     * Shows an input box with:
     * - Masked input for security
     * - Real-time validation to prevent invalid keys
     * - Helpful error messages
     * 
     * The API key is stored securely in the OS keychain after validation.
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
            prompt: MESSAGES.API_KEY_PROMPT,
            password: true, // Masks input characters
            ignoreFocusOut: true,
            validateInput: (value: string) => {
                // Real-time validation as user types
                try {
                    if (!value || value.trim().length === 0) {
                        return 'API key cannot be empty';
                    }

                    // Perform basic validation (full validation happens on save)
                    validateApiKey(value);
                    return null; // Valid
                } catch (error: any) {
                    // Show validation error to user
                    return error.message;
                }
            }
        });

        if (token) {
            try {
                await this.storeKey(token);
                vscode.window.showInformationMessage(MESSAGES.API_KEY_SAVED);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to save API key: ${error.message}`);
                return undefined;
            }
        }
        return token?.trim();
    }
}

