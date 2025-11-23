# Installation & Configuration

## Prerequisites

1. **Antigravity IDE**: This extension **only works in Antigravity IDE**
   - Download from [Antigravity](https://antigravity.google/)
   - Will not activate in regular VS Code
2. **Git**: A workspace with a Git repository
3. **Jules API Access**:
   - A Google Cloud Project with Jules API enabled
   - Jules API Key ([Get one here](https://jules.google.com/settings))
4. **GitHub Integration**:
   - Jules GitHub App installed for your repositories ([Configure here](https://jules.google.com/))

## Install Extension

1. Download the extension from the VS Code Marketplace (or install from `.vsix` file)
2. Reload VS Code
3. Open a folder that contains a Git repository

## Configure API Key

1. Run command: `Jules Bridge: Set Jules API Key` (Cmd/Ctrl+Shift+P)
2. Enter your Jules API key
3. The key is securely stored in your OS keychain

## Configuration Settings

Open VS Code settings and search for "Jules Bridge":

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `julesBridge.autoPush` | boolean | `true` | Automatically commit and push WIP changes before sending to Jules |
