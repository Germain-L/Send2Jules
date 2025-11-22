/**
 * Application Constants
 * 
 * Centralized constants for the Send2Jules extension.
 * Extracts magic numbers, strings, and configuration values for maintainability.
 * 
 * @module constants
 */

/**
 * Git Status Codes from VS Code Git API
 * 
 * These match the status codes returned by the Git extension.
 */
export enum GitStatus {
    INDEX_MODIFIED = 0,
    INDEX_ADDED = 1,
    INDEX_DELETED = 2,
    UNTRACKED = 3,
    MODIFIED = 5,
    DELETED = 6,
    TYPE_CHANGE = 7
}

/**
 * API Configuration
 */
export const API_CONFIG = {
    /** Base URL for Jules API */
    BASE_URL: 'https://jules.googleapis.com/v1alpha/sessions',

    /** Request timeout in milliseconds */
    TIMEOUT_MS: 30000, // 30 seconds

    /** Maximum response size in bytes */
    MAX_RESPONSE_SIZE: 5 * 1024 * 1024, // 5 MB
};

/**
 * Validation Constraints
 */
export const VALIDATION = {
    /** Minimum API key length */
    API_KEY_MIN_LENGTH: 20,

    /** Maximum API key length */
    API_KEY_MAX_LENGTH: 500,

    /** Maximum prompt length in characters */
    PROMPT_MAX_LENGTH: 50000,

    /** Maximum GitHub identifier length (owner/repo) */
    GITHUB_ID_MAX_LENGTH: 100,

    /** Maximum branch name length */
    BRANCH_MAX_LENGTH: 255,

    /** Regex pattern for valid GitHub identifiers */
    GITHUB_ID_PATTERN: /^[a-zA-Z0-9_.-]+$/,

    /** Regex pattern for valid session IDs */
    SESSION_ID_PATTERN: /^[a-zA-Z0-9_-]{8,}$/,
};

/**
 * Code Analysis Configuration
 */
export const CODE_ANALYSIS = {
    /** Maximum distance (in characters) from symbol definition to consider cursor "in" that symbol */
    SYMBOL_CONTEXT_RADIUS: 200,

    /** Maximum number of open files to include in prompt */
    MAX_FILES_IN_PROMPT: 5,

    /** Amount of file to read when extracting title (in bytes) */
    TITLE_READ_SIZE: 1024,
};

/**
 * Git Operation Configuration
 */
export const GIT_CONFIG = {
    /** Characters to replace in branch names for safety */
    BRANCH_SAFE_CHARS_PATTERN: /[:.]/g,

    /** Replacement character for unsafe branch name chars */
    BRANCH_SAFE_REPLACEMENT: '-',

    /** Default branch name if HEAD is undefined */
    DEFAULT_BRANCH: 'main',

    /** WIP commit message template */
    WIP_COMMIT_MESSAGE: (timestamp: string) => `WIP: Auto-save for Jules Handover [${timestamp}]`,

    /** WIP branch name template */
    WIP_BRANCH_NAME: (timestamp: string) => `wip-jules-${timestamp}`,
};

/**
 * UI Configuration
 */
export const UI_CONFIG = {
    /** Status bar priority (higher = more right) */
    STATUS_BAR_PRIORITY: 100,

    /** Status bar item text states */
    STATUS_BAR_TEXT: {
        DEFAULT: '$(rocket) Send to Jules',
        SYNCING: '$(sync~spin) Syncing...',
        SENDING: '$(cloud-upload) Sending...',
    },
};

/**
 * External URLs
 */
export const URLS = {
    /** Antigravity IDE information page */
    ANTIGRAVITY_INFO: 'https://deepmind.google/technologies/antigravity/',

    /** Jules dashboard base URL */
    JULES_DASHBOARD: 'https://jules.google.com',

    /** Jules session URL template */
    JULES_SESSION: (sessionId: string) => `https://jules.google.com/sessions/${sessionId}`,

    /** Jules repository settings URL */
    JULES_SETTINGS: 'https://jules.google.com/settings/repositories',
};

/**
 * File Paths
 */
export const PATHS = {
    /** Antigravity brain directory path segments */
    BRAIN_PATH_SEGMENTS: ['.gemini', 'antigravity', 'brain'],

    /** Artifact file names */
    ARTIFACTS: ['task.md', 'implementation_plan.md'] as const,

    /** Temporary prompt file name */
    JULES_PROMPT_FILE: 'JULES_PROMPT.md',
};

/**
 * User-Facing Messages
 */
export const MESSAGES = {
    // Error Messages
    NO_GIT_REPO: 'Open a file in a Git repository to use Jules.',
    NO_REMOTE: 'No remote configured for this repository.',
    API_KEY_REQUIRED: 'Jules API key is required. Run "Set Jules API Key" command to configure.',

    // Success Messages
    API_KEY_SAVED: 'Jules API Key saved securely.',
    SESSION_STARTED: (sessionName: string) => `Jules Session '${sessionName}' Started.`,

    // Prompts
    API_KEY_PROMPT: 'Found in Google Cloud Console or Jules Settings',
    UNCOMMITTED_CHANGES: 'Uncommitted changes detected. Push WIP commit?',

    // Button Labels
    PUSH_CONTINUE: 'Push & Continue',
    CANCEL: 'Cancel',
    CONFIGURE_JULES: 'Configure Jules',
    OPEN_DASHBOARD: 'Open Dashboard',
    LEARN_MORE: 'Learn More',

    // Descriptions
    CONTEXT_PICKER_PLACEHOLDER: 'Select the conversation context to continue from',
    CONTEXT_PICKER_TITLE: 'Select Conversation Context',
    LATEST_CONTEXT_LABEL: '$(clock) Latest Conversation',
    LATEST_CONTEXT_DESCRIPTION: 'Automatically use the most recent context',

    // Input Box
    PROMPT_INPUT_TITLE: 'Jules Mission Brief',
    PROMPT_INPUT_PLACEHOLDER: 'e.g., Implement the logout logic in auth.ts...',
    PROMPT_INPUT_PROMPT: 'Review and edit the auto-generated prompt, or write your own',
    PROMPT_OPENED: 'Prompt opened in editor. Edit the file and click "Validate and Send" when ready.',
    NO_PENDING_SESSION: 'No pending Jules session found. Run "Send to Jules" to start a new session.',
    PROMPT_SUBMITTED: 'Prompt submitted to Jules.',

    // Warnings
    ANTIGRAVITY_ONLY: 'This extension requires the Antigravity IDE. ' +
        'It is designed to work with Antigravity\'s conversation artifacts ' +
        'and will not function in regular VS Code. ' +
        'Please use the Antigravity IDE to enable this extension.',

    PROJECT_NOT_INITIALIZED: (owner: string, repo: string) =>
        `Jules does not have access to ${owner}/${repo}. Please install the Jules GitHub App.`,

    HANDOFF_FAILED: (message: string) => `Jules Handoff Failed: ${message}`,
};

/**
 * Logging Prefixes
 */
export const LOG_PREFIX = {
    ERROR: '[ERROR]',
    SUCCESS: '[SUCCESS]',
    SECURITY: '[SECURITY]',
    DEBUG: '[DEBUG]',
};

/**
 * Security Patterns
 * 
 * Patterns that might indicate prompt injection attempts.
 * These are logged as warnings but don't block the request (to avoid false positives).
 */
export const SECURITY_PATTERNS = [
    /ignore\s+(previous|all)\s+(instructions|prompts)/i,
    /system\s*:\s*/i,
    /\broot\b.*\bpassword\b/i,
];
