# Troubleshooting

## Common Issues

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
