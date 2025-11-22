/**
 * Custom Error Classes
 * 
 * Defines a hierarchy of custom errors for better error handling and user messages.
 * All errors extend the base JulesBridgeError class.
 * 
 * @module errors
 */

/**
 * Base error class for all Jules Bridge errors.
 * Provides consistent error handling across the extension.
 */
export class JulesBridgeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'JulesBridgeError';
        // Maintains proper stack trace for where our error was thrown
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Thrown when input validation fails.
 * Used for invalid API keys, prompts, GitHub identifiers, etc.
 */
export class ValidationError extends JulesBridgeError {
    constructor(
        message: string,
        public readonly field?: string,
        public readonly value?: string
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}

/**
 * Thrown when Jules API requests fail.
 * Contains sanitized error messages safe to show users.
 */
export class ApiError extends JulesBridgeError {
    constructor(
        message: string,
        public readonly statusCode?: number,
        public readonly originalError?: string
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 * Thrown when Git operations fail.
 * Provides user-friendly messages for common Git errors.
 */
export class GitError extends JulesBridgeError {
    constructor(
        message: string,
        public readonly operation?: string,
        public readonly originalError?: string
    ) {
        super(message);
        this.name = 'GitError';
    }
}

/**
 * Thrown when required configuration is missing or invalid.
 * Examples: missing API key, no Git remote configured.
 */
export class ConfigurationError extends JulesBridgeError {
    constructor(
        message: string,
        public readonly configKey?: string
    ) {
        super(message);
        this.name = 'ConfigurationError';
    }
}

/**
 * Thrown when a repository is not initialized in Jules.
 * Requires GitHub App installation.
 */
export class ProjectNotInitializedError extends JulesBridgeError {
    constructor(
        public readonly owner: string,
        public readonly repo: string
    ) {
        super(`Project ${owner}/${repo} not initialized in Jules.`);
        this.name = 'ProjectNotInitializedError';
    }
}

/**
 * Thrown when a security violation is detected.
 * Examples: path traversal attempts, invalid URLs.
 */
export class SecurityError extends JulesBridgeError {
    constructor(
        message: string,
        public readonly violationType?: string
    ) {
        super(message);
        this.name = 'SecurityError';
    }
}

/**
 * Thrown when a network operation times out.
 */
export class TimeoutError extends JulesBridgeError {
    constructor(
        message: string = 'Operation timed out',
        public readonly timeoutMs?: number
    ) {
        super(message);
        this.name = 'TimeoutError';
    }
}
