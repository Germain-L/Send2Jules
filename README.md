# Antigravity Jules Bridge

This extension implements the "Send to Jules" protocol, allowing you to seamlessly hand off your current work to the Jules autonomous agent.

## Features

- **Send to Jules**: A status bar button to trigger the handoff.
- **Auto-Sync**: Automatically commits and pushes uncommitted changes (WIP) to the remote repository before commissioning the agent.
- **Context Awareness**: Captures your active tabs and injects them into the prompt for Jules.
- **Secure Credentials**: Uses VS Code SecretStorage to securely manage your Jules API Key.

## Setup

1. Install the extension.
2. Open a folder that is a Git repository.
3. Run the command `Jules Bridge: Set Jules API Key` to save your API key securely.
4. Click the "Send to Jules" button in the status bar (rocket icon).

## Configuration

- `julesBridge.autoPush`: (Boolean) Automatically commit and push WIP changes. Default: `true`.

## Requirements

- A Google Cloud Project with the Jules API enabled.
- A Jules API Key.
- A Git repository with a configured remote.
