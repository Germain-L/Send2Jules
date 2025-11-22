import * as mock from 'mock-require';
import * as sinon from 'sinon';

// Mock vscode module
const vscodeMock = {
    window: {
        createOutputChannel: sinon.stub().returns({
            append: sinon.stub(),
            appendLine: sinon.stub(),
            replace: sinon.stub(),
            clear: sinon.stub(),
            show: sinon.stub(),
            hide: sinon.stub(),
            dispose: sinon.stub(),
            name: 'Mock Channel'
        }),
        showInformationMessage: sinon.stub(),
        showErrorMessage: sinon.stub(),
        activeTextEditor: undefined,
        tabGroups: { all: [] }
    },
    workspace: {
        workspaceFolders: [],
        getConfiguration: sinon.stub().returns({
            get: sinon.stub(),
            update: sinon.stub()
        }),
        openTextDocument: sinon.stub()
    },
    extensions: {
        getExtension: sinon.stub()
    },
    commands: {
        getCommands: sinon.stub(),
        registerCommand: sinon.stub()
    },
    Uri: {
        file: (path: string) => ({ fsPath: path, scheme: 'file', toString: () => `file://${path}` }),
        parse: (path: string) => ({ fsPath: path, scheme: 'file', toString: () => path })
    },
    Position: class {
        constructor(public line: number, public character: number) { }
    },
    Range: class {
        constructor(public start: any, public end: any) { }
    },
    OutputChannel: class { }
};

mock('vscode', vscodeMock);
