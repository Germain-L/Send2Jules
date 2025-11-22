import * as vscode from 'vscode';
import { JulesClient, ProjectNotInitializedError } from './julesClient';
import { GitContextManager } from './gitContext';
import { SecretsManager } from './secrets';
import { PromptGenerator } from './promptGenerator';

let statusBarItem: vscode.StatusBarItem;

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

    // Command: Set API Key
    context.subscriptions.push(vscode.commands.registerCommand('julesBridge.setApiKey', async () => {
        await secrets.promptAndStoreKey();
    }));

    // Command: Send Flow (The Main Logic)
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
            const autoPrompt = await promptGenerator.generatePrompt(
                repoDetails.repo,
                vscode.window.activeTextEditor,
                selectedContextPath
            );

            // 4. Show editable input with auto-generated prompt
            const userPrompt = await vscode.window.showInputBox({
                title: "Jules Mission Brief",
                prompt: "Review and edit the auto-generated prompt, or write your own",
                value: autoPrompt,
                placeHolder: "e.g., Implement the logout logic in auth.ts..."
            });
            if (!userPrompt) return;

            const fullPrompt = userPrompt;

            // 5. Commission Agent
            statusBarItem.text = '$(cloud-upload) Sending...';
            const session = await julesClient.createSession(
                repoDetails.owner,
                repoDetails.name,
                repoDetails.branch,
                fullPrompt
            );

            // 6. Success & Link
            vscode.window.showInformationMessage(
                `Jules Session '${session.name}' Started.`,
                "Open Dashboard"
            ).then(selection => {
                if (selection === "Open Dashboard") {
                    vscode.env.openExternal(vscode.Uri.parse(`https://jules.google.com/sessions/${session.id}`));
                }
            });

        } catch (error: any) {
            outputChannel.appendLine(`Error: ${error.message}`);
            if (error.stack) outputChannel.appendLine(error.stack);

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

