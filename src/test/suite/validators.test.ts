import * as assert from 'assert';
import {
    validateGitHubIdentifier,
    validateBranchName,
    validatePrompt,
    validateApiKey,
    validateSessionResponse,
    validateUrl
} from '../../validators';
import { ValidationError, SecurityError } from '../../errors';

suite('Validators Test Suite', () => {

    test('validateGitHubIdentifier - valid inputs', () => {
        validateGitHubIdentifier('google', 'owner');
        validateGitHubIdentifier('jules-bridge', 'repo');
        validateGitHubIdentifier('repo.with.dots', 'repo');
        validateGitHubIdentifier('repo_with_underscores', 'repo');
    });

    test('validateGitHubIdentifier - invalid inputs', () => {
        assert.throws(() => validateGitHubIdentifier('', 'owner'), ValidationError);
        assert.throws(() => validateGitHubIdentifier('invalid space', 'owner'), ValidationError);
        assert.throws(() => validateGitHubIdentifier('invalid/slash', 'owner'), SecurityError);
        assert.throws(() => validateGitHubIdentifier('invalid\\backslash', 'owner'), SecurityError);
        assert.throws(() => validateGitHubIdentifier('../traversal', 'owner'), SecurityError);
    });

    test('validateBranchName - valid inputs', () => {
        validateBranchName('main');
        validateBranchName('feature/auth');
        validateBranchName('bugfix/issue-123');
    });

    test('validateBranchName - invalid inputs', () => {
        assert.throws(() => validateBranchName(''), ValidationError);
        assert.throws(() => validateBranchName('space in branch'), ValidationError);
        assert.throws(() => validateBranchName('.startwithdot'), ValidationError);
        assert.throws(() => validateBranchName('endwithlock.lock'), ValidationError);
        assert.throws(() => validateBranchName('invalid~char'), ValidationError);
    });

    test('validatePrompt - valid inputs', () => {
        validatePrompt('Simple prompt');
        validatePrompt('Complex prompt with multiple lines\nand special chars!');
    });

    test('validatePrompt - invalid inputs', () => {
        assert.throws(() => validatePrompt(''), ValidationError);
        assert.throws(() => validatePrompt('   '), ValidationError);
        // Create a string longer than 50000 chars
        const longString = 'a'.repeat(50001);
        assert.throws(() => validatePrompt(longString), ValidationError);
    });

    test('validateApiKey - valid inputs', () => {
        validateApiKey('AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxx'); // 30+ chars
    });

    test('validateApiKey - invalid inputs', () => {
        assert.throws(() => validateApiKey(''), ValidationError);
        assert.throws(() => validateApiKey('short'), ValidationError);
        assert.throws(() => validateApiKey('invalid\nnewline'), ValidationError);
    });

    test('validateSessionResponse - valid inputs', () => {
        validateSessionResponse({ id: 'session-123', name: 'My Session' });
    });

    test('validateSessionResponse - invalid inputs', () => {
        assert.throws(() => validateSessionResponse(null), ValidationError);
        assert.throws(() => validateSessionResponse({}), ValidationError);
        assert.throws(() => validateSessionResponse({ id: 123, name: 'ok' }), ValidationError);
        assert.throws(() => validateSessionResponse({ id: 'ok', name: 123 }), ValidationError);
        assert.throws(() => validateSessionResponse({ id: 'short', name: 'ok' }), ValidationError); // ID too short
    });

    test('validateUrl - valid inputs', () => {
        validateUrl('https://jules.google.com/sessions/123', ['jules.google.com']);
        validateUrl('https://deepmind.google/tech', ['deepmind.google']);
    });

    test('validateUrl - invalid inputs', () => {
        assert.throws(() => validateUrl('http://evil.com', ['jules.google.com']), SecurityError);
        assert.throws(() => validateUrl('javascript:alert(1)', ['jules.google.com']), SecurityError);
        assert.throws(() => validateUrl('file:///etc/passwd', ['jules.google.com']), SecurityError);
    });
});
