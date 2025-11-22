/**
 * Input Validation Utilities
 * 
 * Provides secure validation functions for all user inputs and external data.
 * These validators prevent security vulnerabilities like injection attacks,
 * path traversal, and malformed data.
 * 
 * All validators throw ValidationError or SecurityError on failure.
 * 
 * @module validators
 */

import * as path from 'path';
import { ValidationError, SecurityError } from './errors';
import { VALIDATION, SECURITY_PATTERNS } from './constants';

/**
 * Validate GitHub identifier (owner or repository name).
 * 
 * GitHub allows: alphanumeric, dash, underscore, and dot.
 * This prevents path traversal and injection attacks.
 * 
 * @param value - The identifier to validate
 * @param field - Field name for error messages ('owner' or 'repo')
 * @throws ValidationError if validation fails
 * 
 * @example
 * ```typescript
 * validateGitHubIdentifier('google', 'owner'); // OK
 * validateGitHubIdentifier('../etc/passwd', 'repo'); // Throws ValidationError
 * ```
 */
export function validateGitHubIdentifier(value: string, field: string): void {
    if (!value || typeof value !== 'string') {
        throw new ValidationError(`Invalid ${field}: must be a non-empty string`, field, value);
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
        throw new ValidationError(`Invalid ${field}: cannot be empty or whitespace only`, field, value);
    }

    if (trimmed.length > VALIDATION.GITHUB_ID_MAX_LENGTH) {
        throw new ValidationError(
            `Invalid ${field}: exceeds maximum length of ${VALIDATION.GITHUB_ID_MAX_LENGTH} characters`,
            field,
            value
        );
    }

    // Prevent path traversal attempts
    // SECURITY: Check this BEFORE regex to ensure we catch malicious intent explicitly
    if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
        throw new SecurityError(
            `Invalid ${field}: path traversal attempt detected`,
            'path_traversal'
        );
    }

    // GitHub allows alphanumeric, dash, underscore, and dot
    if (!VALIDATION.GITHUB_ID_PATTERN.test(trimmed)) {
        throw new ValidationError(
            `Invalid ${field}: contains invalid characters. Only alphanumeric, dash, underscore, and dot are allowed`,
            field,
            value
        );
    }
}

/**
 * Validate Git branch name.
 * 
 * Git has strict rules about branch names to prevent security issues.
 * 
 * @param branch - The branch name to validate
 * @throws ValidationError if validation fails
 * 
 * @example
 * ```typescript
 * validateBranchName('main'); // OK
 * validateBranchName('feature/auth'); // OK
 * validateBranchName('branch with spaces'); // Throws ValidationError
 * ```
 */
export function validateBranchName(branch: string): void {
    if (!branch || typeof branch !== 'string') {
        throw new ValidationError('Invalid branch: must be a non-empty string', 'branch', branch);
    }

    const trimmed = branch.trim();

    if (trimmed.length === 0) {
        throw new ValidationError('Invalid branch: cannot be empty', 'branch', branch);
    }

    if (trimmed.length > VALIDATION.BRANCH_MAX_LENGTH) {
        throw new ValidationError(
            `Invalid branch: exceeds maximum length of ${VALIDATION.BRANCH_MAX_LENGTH} characters`,
            'branch',
            branch
        );
    }

    // Git branch name validation (simplified but covers most problematic cases)
    // Rejects: spaces, ~, ^, :, ?, *, [, ]
    if (/[\s~^:?*\[\]]/.test(trimmed)) {
        throw new ValidationError(
            'Invalid branch: contains invalid characters (spaces, ~, ^, :, ?, *, [, ])',
            'branch',
            branch
        );
    }

    // Prevent starting/ending with special chars that Git rejects
    if (trimmed.startsWith('.') || trimmed.startsWith('/') || trimmed.endsWith('.lock')) {
        throw new ValidationError(
            'Invalid branch: cannot start with "." or "/" or end with ".lock"',
            'branch',
            branch
        );
    }
}

/**
 * Validate user prompt for Jules.
 * 
 * Ensures prompt is within reasonable length limits and checks for
 * potential prompt injection patterns.
 * 
 * @param prompt - The prompt to validate
 * @throws ValidationError if validation fails
 * 
 * @example
 * ```typescript
 * validatePrompt('Implement login feature'); // OK
 * validatePrompt(''); // Throws ValidationError
 * validatePrompt('a'.repeat(100000)); // Throws ValidationError
 * ```
 */
export function validatePrompt(prompt: string): void {
    if (!prompt || typeof prompt !== 'string') {
        throw new ValidationError('Prompt must be a non-empty string', 'prompt', prompt);
    }

    const trimmed = prompt.trim();

    if (trimmed.length === 0) {
        throw new ValidationError('Prompt cannot be empty or whitespace only', 'prompt', prompt);
    }

    if (trimmed.length > VALIDATION.PROMPT_MAX_LENGTH) {
        throw new ValidationError(
            `Prompt exceeds maximum length of ${VALIDATION.PROMPT_MAX_LENGTH} characters`,
            'prompt',
            `${trimmed.substring(0, 50)}...`
        );
    }

    // Check for potential prompt injection patterns
    // We log warnings but don't block (to avoid false positives)
    for (const pattern of SECURITY_PATTERNS) {
        if (pattern.test(trimmed)) {
            // Log warning but don't throw - legitimate prompts might match
            console.warn('[SECURITY] Potential prompt injection pattern detected in user input');
            break;
        }
    }
}

/**
 * Validate API key format.
 * 
 * Ensures API key meets minimum security requirements without being
 * overly restrictive about the exact format.
 * 
 * @param token - The API key to validate
 * @throws ValidationError if validation fails
 * 
 * @example
 * ```typescript
 * validateApiKey('AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxx'); // OK
 * validateApiKey('short'); // Throws ValidationError
 * ```
 */
export function validateApiKey(token: string): void {
    if (!token || typeof token !== 'string') {
        throw new ValidationError('API key must be a non-empty string', 'apiKey');
    }

    const trimmed = token.trim();

    if (trimmed.length < VALIDATION.API_KEY_MIN_LENGTH) {
        throw new ValidationError(
            `API key is too short (minimum ${VALIDATION.API_KEY_MIN_LENGTH} characters). Please verify you entered the complete key.`,
            'apiKey'
        );
    }

    if (trimmed.length > VALIDATION.API_KEY_MAX_LENGTH) {
        throw new ValidationError(
            `API key is too long (maximum ${VALIDATION.API_KEY_MAX_LENGTH} characters). Please verify you entered only the key.`,
            'apiKey'
        );
    }

    // Check for control characters or obviously invalid content
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        throw new ValidationError('API key contains invalid control characters', 'apiKey');
    }

    // Optional: Validate expected format if Jules API keys have a known pattern
    // For Google API keys, they typically start with 'AIza'
    // Uncomment if this pattern is confirmed:
    // if (!trimmed.startsWith('AIza')) {
    //     throw new ValidationError(
    //         'API key format appears invalid. Google API keys typically start with "AIza".',
    //         'apiKey'
    //     );
    // }
}

/**
 * Validate Jules session response from API.
 * 
 * Ensures the API response has the expected structure and prevents
 * malformed data from causing errors.
 * 
 * @param data - The API response to validate
 * @throws ValidationError if validation fails
 * 
 * @example
 * ```typescript
 * validateSessionResponse({ id: 'abc123', name: 'Session 1' }); // OK
 * validateSessionResponse({ id: 123 }); // Throws ValidationError
 * ```
 */
export function validateSessionResponse(data: any): asserts data is { id: string; name: string } {
    if (!data || typeof data !== 'object') {
        throw new ValidationError('Invalid API response: expected object', 'sessionResponse');
    }

    if (!data.id || typeof data.id !== 'string') {
        throw new ValidationError('Invalid API response: missing or invalid session ID', 'sessionResponse');
    }

    if (!data.name || typeof data.name !== 'string') {
        throw new ValidationError('Invalid API response: missing or invalid session name', 'sessionResponse');
    }

    // Validate session ID format (alphanumeric, underscore, dash, at least 8 chars)
    if (!VALIDATION.SESSION_ID_PATTERN.test(data.id)) {
        throw new ValidationError(
            'Invalid API response: malformed session ID format',
            'sessionResponse',
            data.id
        );
    }
}

/**
 * Validate that a file path is within the Antigravity brain directory.
 * 
 * This prevents path traversal attacks when reading artifact files.
 * 
 * @param filePath - The file path to validate
 * @param brainDir - The base brain directory (resolved absolute path)
 * @throws SecurityError if path is outside brain directory
 * 
 * @example
 * ```typescript
 * validatePathInBrainDirectory(
 *   '/home/user/.gemini/antigravity/brain/abc/task.md',
 *   '/home/user/.gemini/antigravity/brain'
 * ); // OK
 * 
 * validatePathInBrainDirectory(
 *   '/etc/passwd',
 *   '/home/user/.gemini/antigravity/brain'
 * ); // Throws SecurityError
 * ```
 */
export function validatePathInBrainDirectory(filePath: string, brainDir: string): void {
    const resolvedPath = path.resolve(filePath);
    const resolvedBrainDir = path.resolve(brainDir);

    if (!resolvedPath.startsWith(resolvedBrainDir)) {
        throw new SecurityError(
            'Path traversal attempt detected: file path is outside the allowed directory',
            'path_traversal'
        );
    }
}

/**
 * Validate URL before opening externally.
 * 
 * Ensures URLs are safe to open and belong to trusted domains.
 * 
 * @param url - The URL to validate
 * @param allowedDomains - List of allowed domain patterns
 * @throws SecurityError if URL is not allowed
 * 
 * @example
 * ```typescript
 * validateUrl('https://jules.google.com/sessions/123', ['jules.google.com']);
 * // OK
 * 
 * validateUrl('javascript:alert(1)', ['jules.google.com']);
 * // Throws SecurityError
 * ```
 */
export function validateUrl(url: string, allowedDomains: string[]): void {
    if (!url || typeof url !== 'string') {
        throw new ValidationError('URL must be a non-empty string', 'url');
    }

    // Prevent javascript:, data:, file: protocols
    const dangerousProtocols = ['javascript:', 'data:', 'file:', 'vbscript:'];
    for (const protocol of dangerousProtocols) {
        if (url.toLowerCase().startsWith(protocol)) {
            throw new SecurityError(
                `Dangerous URL protocol detected: ${protocol}`,
                'dangerous_protocol'
            );
        }
    }

    // Ensure it's HTTPS (or HTTP for local development)
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
        throw new ValidationError('URL must use HTTP or HTTPS protocol', 'url', url);
    }

    // Check if domain is in allowed list
    let isAllowed = false;
    for (const domain of allowedDomains) {
        if (url.includes(domain)) {
            isAllowed = true;
            break;
        }
    }

    if (!isAllowed) {
        throw new SecurityError(
            'URL domain is not in the allowed list',
            'untrusted_domain'
        );
    }
}
