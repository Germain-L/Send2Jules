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
import { JulesClient, ProjectNotInitializedError } from './julesClient';
import { GitContextManager } from './gitContext';
import { SecretsManager } from './secrets';
import { PromptGenerator } from './promptGenerator';
import { AntigravityDetector } from './antigravityDetector';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Status bar item that displays the "Send to Jules" button
 */
let statusBarItem: vscode.StatusBarItem;

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
            "Learn More"
        ).then(selection => {
            if (selection === "Learn More") {
                vscode.env.openExternal(
                    vscode.Uri.parse("https://deepmind.google/technologies/antigravity/")
                );
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
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'julesBridge.sendFlow';
    statusBarItem.text = '$(rocket) Send to Jules';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

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
                vscode.window.showErrorMessage("Open a file in a Git repository to use Jules.");
                return;
            }

            // 2. Handle Dirty State
            // If there are uncommitted changes, either auto-push or prompt user
            if (repoDetails.isDirty) {
                const config = vscode.workspace.getConfiguration('julesBridge');
                const autoPush = config.get('autoPush');

                if (autoPush) {
                    statusBarItem.text = '$(sync~spin) Syncing...';
                    await gitManager.pushWipChanges(repoDetails.repo);
                } else {
                    const choice = await vscode.window.showWarningMessage(
                        "Uncommitted changes detected. Push WIP commit?",
                        "Push & Continue", "Cancel"
                    );
                    if (choice === "Push & Continue") {
                        statusBarItem.text = '$(sync~spin) Syncing...';
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
                    label: "$(clock) Latest Conversation",
                    description: "Automatically use the most recent context",
                    detail: "",
                    path: "" // Empty path signals auto-discovery
                });

                const selection = await vscode.window.showQuickPick(items, {
                    placeHolder: "Select the conversation context to continue from",
                    title: "Select Conversation Context"
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

            // Present the auto-generated prompt to user for review/editing
            statusBarItem.text = '$(eye) Review prompt...';

            const userPrompt = await getPromptWithQuickPick(autoPrompt, statusBarItem, outputChannel);

            if (!userPrompt) {
                // User cancelled (empty file)
                outputChannel.appendLine("Prompt cancelled by user (empty content).");
                statusBarItem.text = '$(rocket) Send to Jules';
                return;
            }

            const fullPrompt = userPrompt;

            // 5. Commission Agent
            // Create a new Jules session via the Google Jules API
            statusBarItem.text = '$(cloud-upload) Sending...';
            const session = await julesClient.createSession(
                repoDetails.owner,
                repoDetails.name,
                repoDetails.branch,
                fullPrompt
            );

            // 6. Success & Link
            // Show success message with link to Jules dashboard
            vscode.window.showInformationMessage(
                `Jules Session '${session.name}' Started.`,
                "Open Dashboard"
            ).then(selection => {
                if (selection === "Open Dashboard") {
                    vscode.env.openExternal(vscode.Uri.parse(`https://jules.google.com/sessions/${session.id}`));
                }
            });

        } catch (error: any) {
            // Error handling: Log details and provide user-friendly messages
            outputChannel.appendLine(`Error: ${error.message}`);
            if (error.stack) outputChannel.appendLine(error.stack);

            // Special handling for repository not initialized in Jules
            if (error instanceof ProjectNotInitializedError) {
                const selection = await vscode.window.showErrorMessage(
                    `Jules does not have access to ${error.owner}/${error.repo}. Please install the Jules GitHub App.`,
                    "Configure Jules",
                    "Cancel"
                );
                if (selection === "Configure Jules") {
                    vscode.env.openExternal(vscode.Uri.parse("https://jules.google.com/settings/repositories"));
                }
            } else {
                vscode.window.showErrorMessage(`Jules Handoff Failed: ${error.message}`);
            }
        } finally {
            statusBarItem.text = '$(rocket) Send to Jules';
        }
    }));
}

/**
 * Shows a Quick Pick UI for reviewing and editing the auto-generated prompt.
 * 
 * User flow:
 * 1. Shows a Quick Pick with prompt preview and three actions:
 *    - Send to Jules: Sends the prompt immediately
 *    - Edit Prompt: Opens editor for modifications
 *    - Cancel: Cancels the operation
 * 2. If "Edit" is chosen, opens an editor and integrates with status bar for sending
 * 
 * @param initialContent - Auto-generated prompt text
 * @param statusBar - Status bar item to update for edit flow
 * @param outputChannel - Output channel for logging
 * @returns The final prompt text, or undefined if cancelled
 */
async function getPromptWithQuickPick(
    initialContent: string,
    statusBar: vscode.StatusBarItem,
    outputChannel?: vscode.OutputChannel
): Promise<string | undefined> {
    // Truncate preview if too long (Quick Pick has limited display space)
    const maxPreviewLength = 500;
    const preview = initialContent.length > maxPreviewLength
        ? initialContent.substring(0, maxPreviewLength) + '...\n\n[Prompt truncated for preview]'
        : initialContent;

    // Create Quick Pick items
    interface PromptAction extends vscode.QuickPickItem {
        action: 'send' | 'edit' | 'cancel';
    }

    const actions: PromptAction[] = [
        {
            label: '$(rocket) Send to Jules',
            description: 'Send the auto-generated prompt as-is',
            detail: 'No edits needed - send immediately',
            action: 'send'
        },
        {
            label: '$(pencil) Edit Prompt',
            description: 'Review and modify the prompt before sending',
            detail: 'Opens editor with status bar "Send" button',
            action: 'edit'
        },
        {
            label: '$(x) Cancel',
            description: 'Cancel the handoff to Jules',
            detail: '',
            action: 'cancel'
        }
    ];

    // Show Quick Pick
    const selection = await vscode.window.showQuickPick(actions, {
        placeHolder: 'Choose how to proceed with the Jules prompt',
        title: `Jules Prompt Preview\n\n${preview}`,
        ignoreFocusOut: true
    });

    if (!selection || selection.action === 'cancel') {
        outputChannel?.appendLine('User cancelled prompt via Quick Pick');
        return undefined;
    }

    if (selection.action === 'send') {
        outputChannel?.appendLine('User chose to send prompt immediately');
        return initialContent;
    }

    // Handle 'edit' action - open editor and wait for user to click status bar
    if (selection.action === 'edit') {
        return new Promise<string | undefined>(async (resolve) => {
            let tempFilePath: string | undefined;

            try {
                // Create a temporary file that won't prompt for save location
                const tempDir = os.tmpdir();
                tempFilePath = path.join(tempDir, `JULES_PROMPT_${Date.now()}.md`);

                // Write initial content to temp file
                await fs.promises.writeFile(tempFilePath, initialContent, 'utf8');

                // Open the temp file in editor
                const doc = await vscode.workspace.openTextDocument(tempFilePath);
                await vscode.window.showTextDocument(doc);

                outputChannel?.appendLine('Opened prompt in editor for user modifications');

                // Show notification to guide user
                vscode.window.showInformationMessage(
                    '✏️ Edit your prompt, then click "Send Prompt to Jules" in the status bar (bottom right) to send.',
                    'Got it'
                );

                // Update status bar to show "Send" action
                const originalText = statusBar.text;
                const originalCommand = statusBar.command;
                statusBar.text = '$(rocket) Send Prompt to Jules';
                statusBar.tooltip = 'Click to send the edited prompt to Jules';

                // Create a one-time command for sending the current document
                let commandDisposable: vscode.Disposable | undefined;
                let docCloseDisposable: vscode.Disposable | undefined;

                const cleanup = async (deleteTempFile: boolean = true) => {
                    commandDisposable?.dispose();
                    docCloseDisposable?.dispose();
                    statusBar.text = originalText;
                    statusBar.command = originalCommand;
                    statusBar.tooltip = undefined;

                    // Delete temp file
                    if (deleteTempFile && tempFilePath) {
                        try {
                            await fs.promises.unlink(tempFilePath);
                        } catch (e) {
                            // Ignore cleanup errors
                        }
                    }
                };

                // Register temporary command that reads the current document
                commandDisposable = vscode.commands.registerCommand('julesBridge.sendEditedPrompt', async () => {
                    try {
                        const currentDoc = vscode.window.activeTextEditor?.document;
                        if (currentDoc && currentDoc.uri.toString() === doc.uri.toString()) {
                            const editedContent = currentDoc.getText().trim();

                            if (editedContent.length === 0) {
                                vscode.window.showWarningMessage('Prompt is empty. Cancelling send.');
                                await cleanup();
                                resolve(undefined);
                                return;
                            }

                            outputChannel?.appendLine('User sent edited prompt via status bar');

                            // Close the document without saving (it's already saved to temp file)
                            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

                            await cleanup();
                            resolve(editedContent);
                        } else {
                            vscode.window.showWarningMessage('Please keep the prompt document active to send.');
                        }
                    } catch (error) {
                        outputChannel?.appendLine(`Error sending edited prompt: ${error}`);
                        await cleanup();
                        resolve(undefined);
                    }
                });

                // Update status bar to use the new command
                statusBar.command = 'julesBridge.sendEditedPrompt';

                // Handle document close (user closed without sending)
                docCloseDisposable = vscode.workspace.onDidCloseTextDocument(async (closedDoc) => {
                    if (closedDoc.uri.toString() === doc.uri.toString()) {
                        outputChannel?.appendLine('User closed prompt editor without sending');
                        await cleanup();
                        resolve(undefined);
                    }
                });

            } catch (error) {
                outputChannel?.appendLine(`Error in edit flow: ${error}`);

                // Clean up temp file on error
                if (tempFilePath) {
                    try {
                        await fs.promises.unlink(tempFilePath);
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                }

                resolve(undefined);
            }
        });
    }

    return undefined;
}
