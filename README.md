# Antigravity Jules Bridge

> [!IMPORTANT]
> **Antigravity IDE Required**: This extension is designed exclusively for the [Antigravity IDE](https://antigravity.google/) and will not function in regular VS Code. It requires access to Antigravity conversation artifacts and infrastructure.

A VS Code extension that enables seamless handoff of development work to the [Jules autonomous agent](https://jules.google.com). This extension intelligently captures your current workspace context—including uncommitted changes, open files, cursor position, and Antigravity conversation artifacts—to provide Jules with rich context for continuing your work.

## ✨ Features

### 🚀 One-Click Handoff
- Click the "Send to Jules" button in the status bar to instantly hand off your work
- Auto-generated prompts based on workspace analysis mean less manual context writing

### 📝 Intelligent Context Awareness
- **Git Diff Analysis**: Automatically detects modified, added, and deleted files
- **Cursor Context**: Identifies the function/class you're currently editing
- **Artifact Integration**: Reads Antigravity conversation artifacts (`task.md`, `implementation_plan.md`)
- **Open Files**: Lists files you have open for additional context

### 🔄 Automatic Git Sync
- Automatically stages, commits, and pushes uncommitted changes as a WIP (Work In Progress) branch
- Creates timestamped branches like `wip-jules-2024-01-15T10-30-45-123Z`
- Never affects your current working branch

### 🗂️ Conversation Context Selection
- Browse and select from previous Antigravity agent conversations
- Continue work from a specific conversation's context
- Auto-discovery of latest conversation if not specified

### 🔒 Secure Credentials
- API keys stored securely in OS keychain (Keychain/Credential Manager/Secret Service)
- No plain-text storage in configuration files

## 📦 Installation

### Prerequisites
1. **Antigravity IDE**: This extension **only works in Antigravity IDE**
   - Download from [Antigravity](https://antigravity.google/)
   - Will not activate in regular VS Code
2. **Git**: A workspace with a Git repository
3. **Jules API Access**:
   - A Google Cloud Project with Jules API enabled
   - Jules API Key ([Get one here](https://jules.google.com/settings))
4. **GitHub Integration**:
   - Jules GitHub App installed for your repositories ([Configure here](https://jules.google.com/))

### Install Extension
1. Download the extension from the VS Code Marketplace (or install from `.vsix` file)
2. Reload VS Code
3. Open a folder that contains a Git repository

### Configure API Key
1. Run command: `Jules Bridge: Set Jules API Key` (Cmd/Ctrl+Shift+P)
2. Enter your Jules API key
3. The key is securely stored in your OS keychain

## 🎯 Usage

### Basic Workflow

1. **Make Changes**: Work on your code as normal
2. **Click "Send to Jules"**: Click the rocket icon (🚀) in the status bar
3. **Select Context** (optional): Choose which Antigravity conversation to continue from
4. **Review Prompt**: Review the auto-generated prompt or customize it
5. **Click OK**: Jules session is created and you'll get a link to the dashboard

### Command Palette

- **Send to Jules**: `julesBridge.sendFlow` - Main handoff command
- **Set Jules API Key**: `julesBridge.setApiKey` - Configure or update API key

### Configuration

Open VS Code settings and search for "Jules Bridge":

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `julesBridge.autoPush` | boolean | `true` | Automatically commit and push WIP changes before sending to Jules |

## 🏗️ How It Works

The extension follows a 6-step workflow when you click "Send to Jules":

### 1️⃣ Validate Git State
- Detects Git repository from active file or workspace folder
- Extracts repository details (owner, name, branch)
- Parses remote URL (supports both SSH and HTTPS formats)

### 2️⃣ Handle Dirty State
If uncommitted changes are detected:
- **Auto Mode** (`autoPush: true`): Automatically creates WIP commit and pushes
- **Manual Mode** (`autoPush: false`): Prompts user for confirmation

**WIP Commit Strategy:**
```
1. Stage all working tree changes
2. Create commit: "WIP: Auto-save for Jules Handover [timestamp]"
3. Create new branch: wip-jules-YYYY-MM-DDTHH-MM-SS-sssZ
4. Push branch to remote with upstream tracking
```

This ensures Jules can access your latest code without affecting your working branch.

### 3️⃣ Select Conversation Context
- Scans `~/.gemini/antigravity/brain/` for previous Antigravity conversations
- Extracts human-readable titles from `task.md` or `implementation_plan.md`
- Displays quick-pick menu with conversation titles and timestamps
- Option to auto-select the latest conversation

### 4️⃣ Generate Intelligent Prompt
Combines multiple context sources into a rich prompt:

**Git Diff Context:**
```
Working on:
  Modified: auth.ts, login.tsx
  Added: types.ts
```

**Cursor Context:**
```
Working on function "handleLogin" in auth.ts at line 45
```

**Artifact Content:**
```
--- CURRENT TASK CHECKLIST ---
- [x] Design login form UI
- [/] Implement authentication logic
- [ ] Add error handling

--- IMPLEMENTATION PLAN ---
# User Authentication System
...
```

**Open Files:**
```
Other open files: utils.ts, constants.ts, api.ts
```

### 5️⃣ Commission Agent
- Calls Jules API: `POST https://jules.googleapis.com/v1alpha/sessions`
- Payload includes:
  - Repository source: `sources/github/{owner}/{repo}`
  - Starting branch
  - Context-rich prompt
  - Session title with timestamp

### 6️⃣ Provide Feedback
- Shows success notification with session name
- Provides link to Jules dashboard: `https://jules.google.com/sessions/{id}`
- Status bar returns to default "Send to Jules" state

## 🧩 Architecture

### Module Overview

```
┌─────────────────────────────────────────────────────────────┐
|                      extension.ts                            |
|                  (Main Entry Point)                          |
|  - Command registration                                      |
|  - UI orchestration                                          |
|  - Error handling                                            |
└─────────────────────────────────────────────────────────────┘
                           |
        ┌──────────────────┼──────────────────┬─────────────┐
        │                  │                  │             │
        ▼                  ▼                  ▼             ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
| gitContext.ts|  |promptGenera- |  | julesClient  |  | secrets.ts   |
|              |  | tor.ts       |  | .ts          |  |              |
| - Git repo   |  | - Context    |  | - API calls  |  | - Session    |
|   detection  |  |   analysis   |  | - Session    |  |   creation   |
| - WIP commits|  | - Artifact   |  |   reading    |  | - Error      |
| - URL parsing|  |   reading    |  | - Error      |  |   handling   |
└──────────────┘  | - Prompt gen |  |   handling   |  └──────────────┘
                  └──────────────┘  └──────────────┘
```

### Data Flow

```
User clicks "Send to Jules"
        │
        ▼
[1] GitContextManager.getRepositoryDetails()
        │ ──> Parse remote URL
        │ ──> Detect dirty state
        ▼
[2] GitContextManager.pushWipChanges() (if dirty)
        │ ──> Stage changes
        │ ──> Create WIP commit
        │ ──> Create new branch
        │ ──> Push to remote
        ▼
[3] PromptGenerator.getAvailableContexts()
        │ ──> Scan ~/.gemini/antigravity/brain/
        │ ──> Extract conversation titles
        │ ──> Sort by timestamp
        ▼
[User selects conversation context]
        │
        ▼
[4] PromptGenerator.generatePrompt()
        │ ──> Analyze git diff
        │ ──> Get cursor context
        │ ──> Read artifact files (task.md, implementation_plan.md)
        │ ──> Combine into prompt
        ▼
[User reviews/edits prompt]
        │
        ▼
[5] JulesClient.createSession()
        │ ──> Get API key from SecretsManager
        │ ──> POST to Jules API
        │ ──> Handle errors
        ▼
[6] Show success notification
        │ ──> Provide dashboard link
        └──> Reset status bar
```

### Artifact File Discovery

The extension reads Antigravity agent artifacts from:
```
~/.gemini/antigravity/brain/
  ├── <conversation-id-1>/
  │   ├── task.md                    # Current task checklist
  │   ├── implementation_plan.md     # Implementation plan
  │   └── ...
  ├── <conversation-id-2>/
  │   ├── task.md
  │   ├── implementation_plan.md
  │   └── ...
  └── ...
```

These artifacts are:
1. **Detected**: By checking file paths containing `/.gemini/antigravity/brain/`
2. **Read**: If open in VS Code tabs or found in selected conversation directory
3. **Formatted**: With headers like `--- CURRENT TASK CHECKLIST ---`
4. **Included**: In the prompt sent to Jules

## 🛠️ Development

### Build from Source

```bash
# Clone repository
git clone <repository-url>
cd Send2Jules

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch
```

### Project Structure

```
Send2Jules/
├── src/
│   ├── extension.ts          # Main entry point and command registration
│   ├── promptGenerator.ts    # Intelligent prompt generation
│   ├── gitContext.ts         # Git repository management
│   ├── julesClient.ts        # Jules API client
│   ├── secrets.ts            # Secure credential storage
│   └── typings/
│       └── git.d.ts          # VS Code Git API type definitions
├── guides/                   # Developer documentation
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript configuration
└── README.md                 # This file
```

### Key Technologies

- **TypeScript**: Statically typed JavaScript for robust code
- **VS Code Extension API**: Core extension functionality
- **VS Code Git API**: Repository interaction and Git operations
- **VS Code SecretStorage**: Secure credential management
- **Node.js fs/promises**: Async file system operations for artifact reading
- **Fetch API**: HTTP requests to Jules API

## 🐛 Troubleshooting

### "This extension requires the Antigravity IDE"
**Cause**: The extension detected that it's running in regular VS Code instead of Antigravity IDE.
**Solution**:
1. Download and install [Antigravity IDE](https://deepmind.google/technologies/antigravity/)
2. Open your project in Antigravity IDE instead of VS Code
3. The extension will automatically activate in Antigravity

**Why?** This extension relies on Antigravity-specific features:
- Access to `~/.gemini/antigravity/brain/` conversation artifacts
- Antigravity agent context and infrastructure
- Integration with Antigravity's task management system

### "Open a file in a Git repository to use Jules"
**Cause**: No Git repository detected in the workspace.
**Solution**: Open a folder that contains a `.git` directory.

### "Jules does not have access to owner/repo"
**Cause**: The repository is not initialized in Jules.
**Solution**:
1. Visit [Jules Repository Settings](https://jules.google.com/settings/repositories)
2. Install and configure the Jules GitHub App for your repository
3. Grant necessary permissions

### "API Error 401: Unauthorized"
**Cause**: Invalid or missing API key.
**Solution**:
1. Run `Jules Bridge: Set Jules API Key` command
2. Enter a valid API key from [Jules Settings](https://jules.google.com/settings)
3. Verify your Google Cloud Project has Jules API enabled

### "No remote configured for this repository"
**Cause**: The Git repository doesn't have a remote named "origin".
**Solution**:
```bash
git remote add origin git@github.com:username/repo.git
# or
git remote add origin https://github.com/username/repo.git
```

### Auto-generated prompt is too generic
**Cause**: Not enough context available (no uncommitted changes, artifacts not open, etc.).
**Solution**:
- Open relevant `task.md` or `implementation_plan.md` files from `~/.gemini/antigravity/brain/`
- Make some uncommitted changes to provide diff context
- Position cursor in the code you're working on
- Manually edit the prompt to add more specificity

### Conversation context picker is empty
**Cause**: No Antigravity agent conversations found in `~/.gemini/antigravity/brain/`.
**Solution**: This is expected if you haven't used Antigravity agent before. The extension will still work but won't have artifact context.

## 🔐 Privacy & Security

### API Key Storage
- API keys are stored using VS Code's `SecretStorage` API
- Backed by OS-level encryption:
  - **macOS**: Keychain
  - **Windows**: Credential Manager
  - **Linux**: Secret Service API (gnome-keyring/kwallet)
- Never stored in plain text configuration files
- Not synced via VS Code Settings Sync

### Data Transmission
- API keys are transmitted via HTTPS to `jules.googleapis.com`
- Repository information (owner, name, branch) is sent to identify the codebase
- Prompts contain workspace context but no credentials

### Permissions
The extension requires:
- **Git Repository Access**: To read repository state and create commits
- **File System Access**: To read Antigravity artifact files
- **Network Access**: To communicate with Jules API
- **Secret Storage Access**: To store API key securely

## 📄 License

Apache License 2.0

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 🔗 Links

- [Jules Dashboard](https://jules.google.com)
- [Jules API Documentation](https://jules.google.com/docs)
- [Jules Repository Settings](https://jules.google.com/settings/repositories)
- [Google Antigravity](https://deepmind.google/technologies/antigravity/)

---

**Built with ❤️ for seamless AI-assisted development**
