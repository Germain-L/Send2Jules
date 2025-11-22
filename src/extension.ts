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
            const userPrompt = await vscode.window.showInputBox({
                title: "Jules Mission Brief",
                prompt: "Review and edit the auto-generated prompt, or write your own",
                value: autoPrompt,
                placeHolder: "e.g., Implement the logout logic in auth.ts..."
            });
            if (!userPrompt) return;

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

