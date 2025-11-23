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

    test('generatePrompt - basic structure', async () => {
        const repo = {
            state: {
                workingTreeChanges: [],
                indexChanges: []
            }
        } as unknown as Repository;

        const prompt = await promptGenerator.generatePrompt(repo);
        assert.ok(prompt.includes('<instruction>'));
        assert.ok(prompt.includes('<workspace_context>'));
        assert.ok(prompt.includes('<mission_brief>'));
    });

    test('generatePrompt - with diff', async () => {
        const repo = {
            state: {
                workingTreeChanges: [
                    { uri: vscode.Uri.file('/path/to/file1.ts'), status: 5 /* MODIFIED */ }
                ],
                indexChanges: []
            }
        } as unknown as Repository;

        // Override openTextDocument for this test
        (vscode.workspace.openTextDocument as sinon.SinonStub).resolves({
            getText: () => 'modified content',
            uri: vscode.Uri.file('/path/to/file1.ts')
        });

        const prompt = await promptGenerator.generatePrompt(repo);
        assert.ok(prompt.includes('<git_diff>'));
        assert.ok(prompt.includes('--- file1.ts ---'));
        assert.ok(prompt.includes('modified content'));
    });

    test('generatePrompt - with cursor context and symbols', async () => {
        const repo = {
            state: { workingTreeChanges: [], indexChanges: [] }
        } as unknown as Repository;

        const document = {
            uri: vscode.Uri.file('/path/to/file.ts'),
            getText: () => 'function test() {}',
            lineAt: () => ({ text: 'function test() {}' }),
            offsetAt: () => 0
        } as unknown as vscode.TextDocument;

        const editor = {
            document,
            selection: {
                active: new vscode.Position(0, 0),
                isEmpty: true,
                start: new vscode.Position(0, 0),
                end: new vscode.Position(0, 0)
            }
        } as unknown as vscode.TextEditor;

        // Mock Document Symbols
        const symbol = new vscode.DocumentSymbol(
            'TestClass',
            'detail',
            vscode.SymbolKind.Class,
            new vscode.Range(0, 0, 10, 0),
            new vscode.Range(0, 0, 10, 0)
        );
        const method = new vscode.DocumentSymbol(
            'testMethod',
            'detail',
            vscode.SymbolKind.Method,
            new vscode.Range(1, 0, 5, 0),
            new vscode.Range(1, 0, 5, 0)
        );
        symbol.children = [method];

        // Update mock to return symbols
        (vscode.commands.executeCommand as sinon.SinonStub).withArgs('vscode.executeDocumentSymbolProvider').resolves([symbol]);

        // Update selection to be inside method
        editor.selection = {
            active: new vscode.Position(2, 0)
        } as any;

        const prompt = await promptGenerator.generatePrompt(repo, editor);
        assert.ok(prompt.includes('<active_file>'));
        assert.ok(prompt.includes('Context: Class: TestClass > Method: testMethod'));
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
