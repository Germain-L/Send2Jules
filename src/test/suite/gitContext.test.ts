import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { GitContextManager } from '../../gitContext';
import { Repository } from '../../typings/git';

suite('GitContextManager Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let outputChannelStub: sinon.SinonStubbedInstance<vscode.OutputChannel>;
    let gitApiStub: any;
    let gitExtensionStub: any;
    let gitContextManager: GitContextManager;

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

        gitApiStub = {
            getRepository: sandbox.stub(),
            repositories: []
        };

        gitExtensionStub = {
            exports: {
                getAPI: sandbox.stub().returns(gitApiStub)
            }
        };

        (vscode.extensions.getExtension as unknown as sinon.SinonStub).withArgs('vscode.git').returns(gitExtensionStub);

        gitContextManager = new GitContextManager(outputChannelStub as unknown as vscode.OutputChannel);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('getRepositoryDetails - no repo found', async () => {
        gitApiStub.getRepository.returns(null);
        sandbox.stub(vscode.window, 'activeTextEditor').value(undefined);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);

        const details = await gitContextManager.getRepositoryDetails();
        assert.strictEqual(details, undefined);
    });

    test('getRepositoryDetails - repo found from active editor', async () => {
        const repoStub = {
            state: {
                remotes: [{ fetchUrl: 'https://github.com/owner/repo.git' }],
                workingTreeChanges: [],
                indexChanges: [],
                HEAD: { name: 'main' }
            }
        };
        gitApiStub.getRepository.returns(repoStub);
        sandbox.stub(vscode.window, 'activeTextEditor').value({
            document: { uri: vscode.Uri.file('/path/to/file') }
        });

        const details = await gitContextManager.getRepositoryDetails();
        assert.ok(details);
        assert.strictEqual(details?.owner, 'owner');
        assert.strictEqual(details?.name, 'repo');
        assert.strictEqual(details?.branch, 'main');
        assert.strictEqual(details?.isDirty, false);
    });

    test('getRepositoryDetails - dirty state', async () => {
        const repoStub = {
            state: {
                remotes: [{ fetchUrl: 'https://github.com/owner/repo.git' }],
                workingTreeChanges: [{ uri: vscode.Uri.file('/path/to/file') }],
                indexChanges: [],
                HEAD: { name: 'main' }
            }
        };
        gitApiStub.getRepository.returns(repoStub);
        sandbox.stub(vscode.window, 'activeTextEditor').value({
            document: { uri: vscode.Uri.file('/path/to/file') }
        });

        const details = await gitContextManager.getRepositoryDetails();
        assert.strictEqual(details?.isDirty, true);
    });
});
