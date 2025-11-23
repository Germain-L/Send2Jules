# Privacy & Security

## API Key Storage
- API keys are stored using VS Code's `SecretStorage` API
- Backed by OS-level encryption:
  - **macOS**: Keychain
  - **Windows**: Credential Manager
  - **Linux**: Secret Service API (gnome-keyring/kwallet)
- Never stored in plain text configuration files
- Not synced via VS Code Settings Sync

## Data Transmission
- API keys are transmitted via HTTPS to `jules.googleapis.com`
- Repository information (owner, name, branch) is sent to identify the codebase
- Prompts contain workspace context but no credentials

## Permissions
The extension requires:
- **Git Repository Access**: To read repository state and create commits
- **File System Access**: To read Antigravity artifact files
- **Network Access**: To communicate with Jules API
- **Secret Storage Access**: To store API key securely
