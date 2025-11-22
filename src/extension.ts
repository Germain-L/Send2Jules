/**
 * Antigravity Jules Bridge Extension
 * 
 * This VS Code extension enables seamless handoff of development work to the Jules autonomous agent.
 * It provides intelligent context awareness by:
 * - Detecting and syncing uncommitted Git changes
 * - Reading Antigravity conversation artifacts (task.md, implementation_plan.md)
 * - Analyzing workspace state (open files, cursor position, git diff)
 * - Generating context-rich prompts for Jules
 * - Creating Jules sessions via the Google Jules API
 * 
 * Architecture:
 * - extension.ts: Main extension entry point and command registration
 * - gitContext.ts: Git repository detection and WIP commit management
 * - promptGenerator.ts: Intelligent prompt generation from workspace context
 * - julesClient.ts: Jules API client for session creation
 * - secrets.ts: Secure API key storage using VS Code SecretStorage
 * 
 * @module extension
 */

import * as vscode from 'vscode';
import { JulesClient } from './julesClient';
import { GitContextManager } from './gitContext';
import { SecretsManager } from './secrets';
import { PromptGenerator } from './promptGenerator';
import { AntigravityDetector } from './antigravityDetector';
import { ProjectNotInitializedError, ValidationError, ApiError, ConfigurationError, SecurityError } from './errors';
import { UI_CONFIG, MESSAGES, URLS, PATHS } from './constants';
import { validateUrl } from './validators';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Status bar item that displays the "Send to Jules" button
 */
let statusBarItem: vscode.StatusBarItem;

/**
 * Context for a pending Jules session
 */
interface PendingSessionContext {
    repoDetails: {
        owner: string;
        name: string;
        branch: string;
    };
    promptFilePath: string;
}

let pendingSessionContext: PendingSessionContext | undefined;

/**
 * Extension activation function called by VS Code when the extension is activated.
 * 
 * This function:
 * 1. Initializes core managers (Git, Secrets, Jules Client, Prompt Generator)
 * 2. Creates a status bar button for quick access
 * 3. Registers two commands:
 *    - `julesBridge.setApiKey`: Configure Jules API key
 *    - `julesBridge.sendFlow`: Main handoff command
 * 
 * The extension activates when a workspace contains a `.git` directory.
 * 
 * @param context - VS Code extension context for managing subscriptions and lifecycle
 */
export async function activate(context: vscode.ExtensionContext) {
    // Initialize Output Channel
    const outputChannel = vscode.window.createOutputChannel("Jules Bridge");
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine("Jules Bridge Extension Activated");

    // ============================================================
    // ANTIGRAVITY ENVIRONMENT VALIDATION
    // ============================================================
    // This extension is designed exclusively for the Antigravity IDE.
    // It requires access to Antigravity conversation artifacts and
    // infrastructure that are not available in regular VS Code.

    const antigravityDetector = new AntigravityDetector();
    const detectionDetails = antigravityDetector.getDetectionDetails();

    // Log detection details for debugging
    outputChannel.appendLine("=== Antigravity Environment Detection ===");
    outputChannel.appendLine(`App Name: ${detectionDetails.appName}`);
    outputChannel.appendLine(`Brain Directory: ${detectionDetails.brainDirectoryPath}`);
    outputChannel.appendLine(`Brain Directory Exists: ${detectionDetails.hasBrainDirectory}`);
    outputChannel.appendLine(`App Name Match: ${detectionDetails.isAntigravityAppName}`);
    outputChannel.appendLine(`Env Vars Match: ${detectionDetails.hasAntigravityEnvVars}`);
    outputChannel.appendLine(`Is Antigravity: ${detectionDetails.isAntigravity}`);
    outputChannel.appendLine("=========================================");

    if (!antigravityDetector.isAntigravityEnvironment()) {
        const warningMessage = antigravityDetector.getWarningMessage();
        outputChannel.appendLine(`[ERROR] ${warningMessage}`);
        outputChannel.appendLine("Extension will not be activated.");

        // Show warning to user (only once per session)
        vscode.window.showWarningMessage(
            warningMessage,
            MESSAGES.LEARN_MORE
        ).then(selection => {
            if (selection === MESSAGES.LEARN_MORE) {
                // SECURITY: Validate URL before opening
                try {
                    validateUrl(URLS.ANTIGRAVITY_INFO, ['deepmind.google']);
                    vscode.env.openExternal(vscode.Uri.parse(URLS.ANTIGRAVITY_INFO));
                } catch (error) {
                    outputChannel.appendLine(`[SECURITY] URL validation failed: ${error}`);
                }
            }
        });

        // Exit activation early - do not register commands or UI
        return;
    }

    outputChannel.appendLine("[SUCCESS] Running in Antigravity IDE. Proceeding with activation...");

    const secrets = new SecretsManager(context);
    const gitManager = new GitContextManager(outputChannel);
    const julesClient = new JulesClient(secrets);
    const promptGenerator = new PromptGenerator(outputChannel);

    // Initialize UI
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, UI_CONFIG.STATUS_BAR_PRIORITY);
    statusBarItem.command = 'julesBridge.sendFlow';
    statusBarItem.text = UI_CONFIG.STATUS_BAR_TEXT.DEFAULT;
    statusBarItem.show();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Helper to update status bar state
    const updateStatusBar = (state: 'default' | 'pending' | 'syncing' | 'sending') => {
        switch (state) {
            case 'default':
                statusBarItem.text = UI_CONFIG.STATUS_BAR_TEXT.DEFAULT;
                statusBarItem.command = 'julesBridge.sendFlow';
                statusBarItem.tooltip = 'Start a new Jules session';
                break;
            case 'pending':
                statusBarItem.text = '$(rocket) Validate and Send';
                statusBarItem.command = 'julesBridge.submitPrompt';
                statusBarItem.tooltip = 'Submit the current prompt to Jules';
                break;
            case 'syncing':
                statusBarItem.text = UI_CONFIG.STATUS_BAR_TEXT.SYNCING;
                break;
            case 'sending':
                statusBarItem.text = UI_CONFIG.STATUS_BAR_TEXT.SENDING;
                break;
        }
    };

    // Reset status bar when prompt file is closed
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
        if (pendingSessionContext && doc.uri.fsPath === pendingSessionContext.promptFilePath) {
            pendingSessionContext = undefined;
            updateStatusBar('default');
        }
    }));

    /**
     * Command: julesBridge.setApiKey
     * 
     * Prompts the user to enter their Jules API key and stores it securely
     * in the OS keychain via VS Code's SecretStorage API.
     */
    context.subscriptions.push(vscode.commands.registerCommand('julesBridge.setApiKey', async () => {
        await secrets.promptAndStoreKey();
    }));

    /**
     * Command: julesBridge.sendFlow
     * 
     * Main handoff command that executes the following workflow:
     * 
     * 1. **Validate Git State**: Ensures the workspace has a Git repository
     * 2. **Handle Dirty State**: Automatically or manually creates WIP commit and pushes to new branch
     * 3. **Select Conversation Context**: Allows user to choose which Antigravity conversation to continue
     * 4. **Generate Prompt**: Creates intelligent prompt from workspace context (git diff, cursor position, artifacts)
     * 5. **Commission Agent**: Creates a Jules session via API
     * 6. **Provide Feedback**: Shows success message with link to Jules dashboard
     * 
     * The status bar button shows progress indicators throughout the flow.
     */
    context.subscriptions.push(vscode.commands.registerCommand('julesBridge.sendFlow', async () => {
        try {
            outputChannel.appendLine("Command 'sendFlow' triggered");

            // 1. Validate Git State
            const repoDetails = await gitManager.getRepositoryDetails();
            if (!repoDetails) {
                vscode.window.showErrorMessage(MESSAGES.NO_GIT_REPO);
                return;
            }

            // 2. Handle Dirty State
            // If there are uncommitted changes, either auto-push or prompt user
            if (repoDetails.isDirty) {
                const config = vscode.workspace.getConfiguration('julesBridge');
                const autoPush = config.get('autoPush');

                if (autoPush) {
                    updateStatusBar('syncing');
                    await gitManager.pushWipChanges(repoDetails.repo);
                } else {
                    const choice = await vscode.window.showWarningMessage(
                        MESSAGES.UNCOMMITTED_CHANGES,
                        MESSAGES.PUSH_CONTINUE,
                        MESSAGES.CANCEL
                    );
                    if (choice === MESSAGES.PUSH_CONTINUE) {
                        updateStatusBar('syncing');
                        await gitManager.pushWipChanges(repoDetails.repo);
                    } else {
                        return;
                    }
                }
            }

            // 3. Select Conversation Context
            // Scan ~/.gemini/antigravity/brain/ for previous agent sessions
            // and allow user to select which context to continue from
            const availableContexts = await promptGenerator.getAvailableContexts();
            let selectedContextPath: string | undefined;

            if (availableContexts.length > 1) {
                const items = availableContexts.map(ctx => {
                    const date = new Date(ctx.time);
                    return {
                        label: ctx.title,
                        description: date.toLocaleString(),
                        detail: ctx.name,
                        path: ctx.path
                    };
                });

                // Add an option to use the current/latest automatically
                items.unshift({
                    label: MESSAGES.LATEST_CONTEXT_LABEL,
                    description: MESSAGES.LATEST_CONTEXT_DESCRIPTION,
                    detail: "",
                    path: "" // Empty path signals auto-discovery
                });

                const selection = await vscode.window.showQuickPick(items, {
                    placeHolder: MESSAGES.CONTEXT_PICKER_PLACEHOLDER,
                    title: MESSAGES.CONTEXT_PICKER_TITLE
                });

                if (!selection) return; // User cancelled

                if (selection.path) {
                    selectedContextPath = selection.path;
                }
            }

            // 4. Auto-generate context-aware prompt
            // Combines git diff, cursor context, open files, and artifact content
            const autoPrompt = await promptGenerator.generatePrompt(
                repoDetails.repo,
                vscode.window.activeTextEditor,
                selectedContextPath
            );

            // Create a temporary file for the prompt
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder open');
            }

            const promptFilePath = path.join(workspaceFolders[0].uri.fsPath, PATHS.JULES_PROMPT_FILE);
            fs.writeFileSync(promptFilePath, autoPrompt, 'utf8');

            // Open the file
            const document = await vscode.workspace.openTextDocument(promptFilePath);
            await vscode.window.showTextDocument(document);

            // Store context for submission
            pendingSessionContext = {
                repoDetails: {
                    owner: repoDetails.owner,
                    name: repoDetails.name,
                    branch: repoDetails.branch
                },
                promptFilePath
            };

            vscode.window.showInformationMessage(MESSAGES.PROMPT_OPENED);
            updateStatusBar('pending');

        } catch (error: any) {
            outputChannel.appendLine(`Error: ${error.message}`);
            if (error.stack) outputChannel.appendLine(error.stack);

            // Handle specific error types with actionable messages
            if (error instanceof ProjectNotInitializedError) {
                const selection = await vscode.window.showErrorMessage(
                    MESSAGES.PROJECT_NOT_INITIALIZED(error.owner, error.repo),
                    MESSAGES.CONFIGURE_JULES,
                    MESSAGES.CANCEL
                );
                if (selection === MESSAGES.CONFIGURE_JULES) {
                    try {
                        validateUrl(URLS.JULES_SETTINGS, ['jules.google.com']);
                        vscode.env.openExternal(vscode.Uri.parse(URLS.JULES_SETTINGS));
                    } catch (urlError) {
                        outputChannel.appendLine(`[SECURITY] URL validation failed: ${urlError}`);
                    }
                }
            } else if (error instanceof ValidationError) {
                vscode.window.showErrorMessage(
                    `Validation Error: ${error.message}${error.field ? ` (${error.field})` : ''}`
                );
            } else if (error instanceof ApiError) {
                vscode.window.showErrorMessage(
                    `Jules API Error: ${error.message}`
                );
            } else if (error instanceof ConfigurationError) {
                const selection = await vscode.window.showErrorMessage(
                    error.message,
                    'Set API Key',
                    MESSAGES.CANCEL
                );
                if (selection === 'Set API Key') {
                    await vscode.commands.executeCommand('julesBridge.setApiKey');
                }
            } else if (error instanceof SecurityError) {
                vscode.window.showErrorMessage(
                    `Security Error: ${error.message}`
                );
                outputChannel.appendLine(`[SECURITY] ${error.violationType}: ${error.message}`);
            } else {
                vscode.window.showErrorMessage(MESSAGES.HANDOFF_FAILED(error.message));
            }
        } finally {
            // Only reset if we didn't successfully open the prompt (which sets it to pending)
            if (!pendingSessionContext) {
                updateStatusBar('default');
            }
        }
    }));

    /**
     * Command: julesBridge.submitPrompt
     * 
     * Submits the prompt from the active editor to Jules.
     */
    context.subscriptions.push(vscode.commands.registerCommand('julesBridge.submitPrompt', async () => {
        if (!pendingSessionContext) {
            vscode.window.showErrorMessage(MESSAGES.NO_PENDING_SESSION);
            return;
        }

        try {
            outputChannel.appendLine("Command 'submitPrompt' triggered");

            // Read content from the prompt file
            if (!fs.existsSync(pendingSessionContext.promptFilePath)) {
                throw new Error('Prompt file not found');
            }
            const userPrompt = fs.readFileSync(pendingSessionContext.promptFilePath, 'utf8');

            // 5. Commission Agent
            // Create a new Jules session via the Google Jules API
            updateStatusBar('sending');
            const session = await julesClient.createSession(
                pendingSessionContext.repoDetails.owner,
                pendingSessionContext.repoDetails.name,
                pendingSessionContext.repoDetails.branch,
                userPrompt
            );

            // 6. Success & Link
            // Show success message with link to Jules dashboard
            vscode.window.showInformationMessage(
                MESSAGES.SESSION_STARTED(session.name),
                MESSAGES.OPEN_DASHBOARD
            ).then(selection => {
                if (selection === MESSAGES.OPEN_DASHBOARD) {
                    // SECURITY: Validate session ID before embedding in URL
                    try {
                        const sessionUrl = URLS.JULES_SESSION(session.id);
                        validateUrl(sessionUrl, ['jules.google.com']);
                        vscode.env.openExternal(vscode.Uri.parse(sessionUrl));
                    } catch (error) {
                        outputChannel.appendLine(`[SECURITY] Invalid session URL: ${error}`);
                        vscode.window.showErrorMessage('Invalid session ID received from API');
                    }
                }
            });

            // Cleanup
            // Close the prompt file editor if it's open
            for (const editor of vscode.window.visibleTextEditors) {
                if (editor.document.uri.fsPath === pendingSessionContext.promptFilePath) {
                    await vscode.window.showTextDocument(editor.document);
                    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                }
            }

            // Delete the temporary file
            try {
                fs.unlinkSync(pendingSessionContext.promptFilePath);
            } catch (e) {
                outputChannel.appendLine(`Warning: Could not delete prompt file: ${e}`);
            }

            pendingSessionContext = undefined;

        } catch (error: any) {
            // Error handling: Log details and provide user-friendly messages
            outputChannel.appendLine(`Error: ${error.message}`);
            if (error.stack) outputChannel.appendLine(error.stack);

            // Handle specific error types with actionable messages
            if (error instanceof ProjectNotInitializedError) {
                const selection = await vscode.window.showErrorMessage(
                    MESSAGES.PROJECT_NOT_INITIALIZED(error.owner, error.repo),
                    MESSAGES.CONFIGURE_JULES,
                    MESSAGES.CANCEL
                );
                if (selection === MESSAGES.CONFIGURE_JULES) {
                    try {
                        validateUrl(URLS.JULES_SETTINGS, ['jules.google.com']);
                        vscode.env.openExternal(vscode.Uri.parse(URLS.JULES_SETTINGS));
                    } catch (urlError) {
                        outputChannel.appendLine(`[SECURITY] URL validation failed: ${urlError}`);
                    }
                }
            } else if (error instanceof ValidationError) {
                vscode.window.showErrorMessage(
                    `Validation Error: ${error.message}${error.field ? ` (${error.field})` : ''}`
                );
            } else if (error instanceof ApiError) {
                vscode.window.showErrorMessage(
                    `Jules API Error: ${error.message}`
                );
            } else if (error instanceof ConfigurationError) {
                const selection = await vscode.window.showErrorMessage(
                    error.message,
                    'Set API Key',
                    MESSAGES.CANCEL
                );
                if (selection === 'Set API Key') {
                    await vscode.commands.executeCommand('julesBridge.setApiKey');
                }
            } else if (error instanceof SecurityError) {
                vscode.window.showErrorMessage(
                    `Security Error: ${error.message}`
                );
                outputChannel.appendLine(`[SECURITY] ${error.violationType}: ${error.message}`);
            } else {
                vscode.window.showErrorMessage(MESSAGES.HANDOFF_FAILED(error.message));
            }
        } finally {
            updateStatusBar('default');
        }
    }));
}

