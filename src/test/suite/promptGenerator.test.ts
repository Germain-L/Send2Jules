import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
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
    });

    teardown(() => {
        sandbox.restore();
    });

    test('generatePrompt - basic', async () => {
        const repo = {
            state: {
                workingTreeChanges: [],
                indexChanges: []
            }
        } as unknown as Repository;

        const prompt = await promptGenerator.generatePrompt(repo);
        assert.strictEqual(prompt, 'Continue working on this project');
    });

    test('generatePrompt - with diff', async () => {
        const repo = {
            state: {
                workingTreeChanges: [
                    { uri: vscode.Uri.file('/path/to/file1.ts'), status: 5 /* MODIFIED */ }
                ],
                indexChanges: [
                    { uri: vscode.Uri.file('/path/to/file2.ts'), status: 1 /* ADDED */ }
                ]
            }
        } as unknown as Repository;

        const prompt = await promptGenerator.generatePrompt(repo);
        assert.ok(prompt.includes('Working on:'));
        assert.ok(prompt.includes('Modified: file1.ts'));
        assert.ok(prompt.includes('Added: file2.ts'));
    });

    test('generatePrompt - with cursor context', async () => {
        const repo = {
            state: {
                workingTreeChanges: [],
                indexChanges: []
            }
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

        const prompt = await promptGenerator.generatePrompt(repo, editor);
        assert.ok(prompt.includes('Working on function "test" in file.ts'));
    });
});
