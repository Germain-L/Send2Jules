/**
 * Antigravity Environment Detector
 * 
 * This module detects whether the extension is running within the Antigravity IDE
 * vs regular VS Code. The Send2Jules extension requires Antigravity-specific
 * infrastructure and artifacts to function properly.
 * 
 * Detection Strategy:
 * 1. Primary: Check for ~/.gemini/antigravity/brain/ directory
 * 2. Secondary: Check vscode.env.appName for "Antigravity"
 * 3. Future-proof: Check for environment variables
 * 
 * @module antigravityDetector
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Details about the Antigravity environment detection results.
 * Used for debugging and logging purposes.
 */
export interface DetectionDetails {
    /** Whether this is detected as an Antigravity environment */
    isAntigravity: boolean;
    /** VS Code application name from vscode.env.appName */
    appName: string;
    /** Path to the expected Antigravity brain directory */
    brainDirectoryPath: string;
    /** Whether the brain directory exists */
    hasBrainDirectory: boolean;
    /** Whether the app name suggests Antigravity */
    isAntigravityAppName: boolean;
    /** Whether Antigravity-related environment variables are present */
    hasAntigravityEnvVars: boolean;
}

/**
 * AntigravityDetector class that determines if the extension is running
 * within the Antigravity IDE environment.
 * 
 * This detector uses multiple heuristics to provide reliable detection:
 * - Checks for Antigravity brain directory
 * - Examines VS Code app name
 * - Looks for environment variables
 */
export class AntigravityDetector {
    private readonly brainDirectoryPath: string;

    /**
     * Creates a new AntigravityDetector instance.
     * Initializes the expected brain directory path.
     */
    constructor() {
        const homeDir = os.homedir();
        this.brainDirectoryPath = path.join(homeDir, '.gemini', 'antigravity', 'brain');
    }

    /**
     * Check if currently running in Antigravity IDE environment.
     * 
     * This method uses multiple detection strategies and returns true
     * if ANY of the following are true:
     * 1. Antigravity brain directory exists at ~/.gemini/antigravity/brain/
     * 2. VS Code app name contains "Antigravity"
     * 
     * The brain directory check is the most reliable indicator.
     * 
     * @returns True if running in Antigravity, false otherwise
     * 
     * @example
     * ```typescript
     * const detector = new AntigravityDetector();
     * if (detector.isAntigravityEnvironment()) {
     *   console.log("Running in Antigravity!");
     * }
     * ```
     */
    isAntigravityEnvironment(): boolean {
        // Primary detection: Check for brain directory
        const hasBrainDir = this.checkBrainDirectory();

        // Secondary detection: Check app name
        const isAntigravityApp = this.checkAppName();

        // Tertiary detection: Check environment variables
        const hasEnvVars = this.checkEnvironmentVariables();

        // Return true if ANY detection method succeeds
        // Brain directory is the strongest signal
        return hasBrainDir || isAntigravityApp || hasEnvVars;
    }

    /**
     * Get detailed detection results for debugging and logging.
     * 
     * This provides visibility into which detection methods succeeded
     * and which failed, useful for troubleshooting.
     * 
     * @returns DetectionDetails object with all detection results
     */
    getDetectionDetails(): DetectionDetails {
        const hasBrainDirectory = this.checkBrainDirectory();
        const isAntigravityAppName = this.checkAppName();
        const hasAntigravityEnvVars = this.checkEnvironmentVariables();

        return {
            isAntigravity: hasBrainDirectory || isAntigravityAppName || hasAntigravityEnvVars,
            appName: vscode.env.appName,
            brainDirectoryPath: this.brainDirectoryPath,
            hasBrainDirectory,
            isAntigravityAppName,
            hasAntigravityEnvVars
        };
    }

    /**
     * Get the path to the Antigravity brain directory.
     * 
     * @returns Path to ~/.gemini/antigravity/brain/ or null if not exists
     */
    getBrainDirectory(): string | null {
        return this.checkBrainDirectory() ? this.brainDirectoryPath : null;
    }

    /**
     * Get a user-friendly warning message for non-Antigravity environments.
     * 
     * @returns Warning message string
     */
    getWarningMessage(): string {
        return "This extension requires the Antigravity IDE. " +
            "It is designed to work with Antigravity's conversation artifacts " +
            "and will not function in regular VS Code. " +
            "Please use the Antigravity IDE to enable this extension.";
    }

    /**
     * Check if the Antigravity brain directory exists.
     * This is the primary and most reliable detection method.
     * 
     * @returns True if ~/.gemini/antigravity/brain/ exists
     * @private
     */
    private checkBrainDirectory(): boolean {
        try {
            return fs.existsSync(this.brainDirectoryPath) &&
                fs.statSync(this.brainDirectoryPath).isDirectory();
        } catch (error) {
            // If we can't access the directory, assume it doesn't exist
            return false;
        }
    }

    /**
     * Check if the VS Code app name suggests Antigravity.
     * 
     * Antigravity is a fork of VS Code, so it may have a different
     * app name that includes "Antigravity" or similar.
     * 
     * @returns True if app name contains Antigravity-related terms
     * @private
     */
    private checkAppName(): boolean {
        const appName = vscode.env.appName.toLowerCase();

        // Check for Antigravity-specific naming
        return appName.includes('antigravity') ||
            appName.includes('anti-gravity') ||
            appName.includes('gemini') && appName.includes('ide');
    }

    /**
     * Check for Antigravity-specific environment variables.
     * 
     * This is future-proofing for when/if Antigravity sets official
     * environment variables to identify itself.
     * 
     * @returns True if Antigravity environment variables are present
     * @private
     */
    private checkEnvironmentVariables(): boolean {
        // Check for potential Antigravity environment variables
        // These are speculative - update if official vars are documented
        return !!(
            process.env.ANTIGRAVITY_MODE ||
            process.env.ANTIGRAVITY_IDE ||
            process.env.GEMINI_ANTIGRAVITY ||
            process.env.GEMINI_IDE
        );
    }
}
