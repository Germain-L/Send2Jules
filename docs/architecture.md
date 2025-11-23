# Architecture & Internals

## How It Works

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

## Module Overview

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

## Artifact File Discovery

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
