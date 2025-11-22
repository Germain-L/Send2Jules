import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('enterprise-integration.antigravity-jules-bridge'));
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('julesBridge.sendFlow'));
        assert.ok(commands.includes('julesBridge.setApiKey'));
        assert.ok(commands.includes('julesBridge.submitPrompt'));
    });
});
