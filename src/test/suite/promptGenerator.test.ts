import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { PromptGenerator } from '../../promptGenerator';
import { Repository } from '../../typings/git';

suite('PromptGenerator Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let outputChannelStub: sinon.SinonStubbedInstance<vscode.OutputChannel>;
    let promptGenerator: PromptGenerator;

    setup(() => {
        sandbox = sinon.createSandbox();
        outputChannelStub = {
            append: sandbox.stub(),
            appendLine: sandbox.stub(),
            replace: sandbox.stub(),
            clear: sandbox.stub(),
            show: sandbox.stub() as any,
            hide: sandbox.stub(),
            dispose: sandbox.stub(),
            name: 'Test Channel'
        };
        promptGenerator = new PromptGenerator(outputChannelStub as unknown as vscode.OutputChannel);

        // Mock vscode.languages.getDiagnostics
        sandbox.stub(vscode.languages, 'getDiagnostics').returns([]);

        // Mock vscode.workspace.openTextDocument
        sandbox.stub(vscode.workspace, 'openTextDocument').resolves({
            getText: () => 'file content',
            uri: vscode.Uri.file('/path/to/file.ts')
        } as unknown as vscode.TextDocument);

        // Mock vscode.commands.executeCommand
        sandbox.stub(vscode.commands, 'executeCommand').resolves([]);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('generatePrompt - basic structure and instructions', async () => {
        const repo = {
            state: {
                workingTreeChanges: [],
                indexChanges: []
            }
        } as unknown as Repository;

        const prompt = await promptGenerator.generatePrompt(repo);

        // Check for XML structure
        assert.ok(prompt.includes('<instruction>'));
        assert.ok(prompt.includes('<workspace_context>'));
        assert.ok(prompt.includes('<mission_brief>'));

        // Check for specific instructions
        assert.ok(prompt.includes('run `git status` and `git diff`'));

        // Ensure removed sections are NOT present
        assert.ok(!prompt.includes('<active_file>'));
        assert.ok(!prompt.includes('<git_diff>'));
    });

    test('generatePrompt - with diagnostics', async () => {
        const repo = {
            state: { workingTreeChanges: [], indexChanges: [] }
        } as unknown as Repository;

        // Mock Diagnostics
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 10),
            'Error message',
            vscode.DiagnosticSeverity.Error
        );
        const uri = vscode.Uri.file('/path/to/error.ts');
        (vscode.languages.getDiagnostics as sinon.SinonStub).returns([[uri, [diagnostic]]]);

        const prompt = await promptGenerator.generatePrompt(repo);
        assert.ok(prompt.includes('<active_errors>'));
        assert.ok(prompt.includes('File: error.ts Line 1: Error message'));
    });
});
