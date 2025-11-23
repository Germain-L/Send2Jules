# Usage Guide

## Basic Workflow

1. **Make Changes**: Work on your code as normal
2. **Click "Send to Jules"**: Click the rocket icon (🚀) in the status bar
3. **Select Context** (optional): Choose which Antigravity conversation to continue from
4. **Review Prompt**: Review the auto-generated prompt or customize it
5. **Click OK**: Jules session is created and you'll get a link to the dashboard

## Features

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

## Command Palette

- **Send to Jules**: `julesBridge.sendFlow` - Main handoff command
- **Set Jules API Key**: `julesBridge.setApiKey` - Configure or update API key
