# Troubleshooting

Solutions for common issues with the WS Claude Marketplace.

## Installation Issues

### Plugin not found after install

**Symptoms:**
- `claude plugin install` succeeds but command isn't available
- `/command` returns "unknown command"

**Solutions:**

1. Refresh the plugin list:
   ```bash
   claude plugin marketplace update ws-marketplace
   ```

2. Reinstall the plugin:
   ```bash
   claude plugin uninstall plugin-name@ws-marketplace
   claude plugin install plugin-name@ws-marketplace
   ```

3. Restart Claude Code session

### Marketplace add fails

**Symptoms:**
- `claude plugin marketplace add` returns an error
- SSH connection refused

**Solutions:**

1. Verify SSH access:
   ```bash
   ssh -T git@github.com
   ```

2. Check your SSH key is added to your GitHub account

3. Ensure the repository URL is correct:
   ```bash
   claude plugin marketplace add git@github.com:wsagency/WS-Claude-marketplace.git
   ```

### Permission denied errors

**Symptoms:**
- "Permission denied" when accessing repository
- Authentication failures

**Solutions:**

1. Check SSH agent is running:
   ```bash
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_rsa  # or your key
   ```

2. Verify key is registered on your GitHub account

## Command Issues

### Command not recognized

**Symptoms:**
- `/command-name` returns error
- Command doesn't appear in help

**Solutions:**

1. Check plugin is installed:
   ```bash
   claude plugin list
   ```

2. Verify command exists in plugin:
   ```bash
   ls plugins/plugin-name/commands/
   ```

3. Check command filename matches expected name (filename becomes command)

### Command fails during execution

**Symptoms:**
- Command starts but errors out
- Tool access denied

**Solutions:**

1. Check `allowed-tools` in command frontmatter includes needed tools

2. Verify you're in the correct directory for the command

3. Check command prerequisites are met (e.g., git repo exists)

## ws-commit-commands Issues

### tea CLI not found

**Symptoms:**
- `/ws-commit-push-pr` fails with "tea: command not found"
- PR creation doesn't work

**Solutions:**

1. Install tea CLI:
   ```bash
   # macOS
   brew install tea

   # Or download from releases
   # https://gitea.com/gitea/tea/releases
   ```

2. Configure tea:
   ```bash
   tea login add --url https://git.wsagency.io --token YOUR_TOKEN
   ```

3. Verify tea works:
   ```bash
   tea login list
   ```

### PR creation fails

**Symptoms:**
- Commit succeeds but PR fails
- "not logged in" error

**Solutions:**

1. Check tea authentication:
   ```bash
   tea login list
   ```

2. Re-authenticate if needed:
   ```bash
   tea login add --url https://git.wsagency.io --token YOUR_TOKEN
   ```

3. Verify you have push access to the repository

### jira-cli not working

**Symptoms:**
- `jira me` fails or hangs
- Commands report "jira: command not found"
- Worklogs or transitions are not applied

**Solutions:**

1. Install jira-cli:
   ```bash
   brew install ankitpokhrel/jira-cli/jira-cli
   ```

2. Ensure your API token is exported:
   ```bash
   export JIRA_API_TOKEN=<your-token>
   ```

3. Run the interactive setup if you haven't yet:
   ```bash
   jira init
   ```

4. Verify authentication:
   ```bash
   jira me
   ```

5. Run `/ws-init` inside Claude Code — it checks the `jira` binary and `jira me`, prints the exact install/token/`jira init` steps if anything is missing, and binds the current project to a Jira project

## docs-agent Issues

### Changelog generation fails

**Symptoms:**
- `/ws-docs changelog` produces no output
- Error reading git history

**Solutions:**

1. Verify you're in a git repository:
   ```bash
   git status
   ```

2. Check there are commits to analyze:
   ```bash
   git log --oneline -10
   ```

3. Ensure you have at least one commit since last tag (or any commits if no tags)

### Documentation output location wrong

**Symptoms:**
- Docs created in wrong directory
- Files overwritten unexpectedly

**Solutions:**

1. Verify you're in the expected working directory (the project root with `docs/` and `dev-docs/`)

2. Run `/ws-docs` with no verb to see where each artifact lives and what state it's in

## Plugin Development Issues

### Local plugin changes not reflected

**Symptoms:**
- Edited plugin file but behavior unchanged
- New commands not appearing

**Solutions:**

1. Reinstall the local plugin:
   ```bash
   claude plugin uninstall my-plugin
   claude plugin install ./plugins/my-plugin
   ```

2. Restart Claude Code session

### marketplace.json validation fails

**Symptoms:**
- Error when adding plugin to marketplace
- JSON parse errors

**Solutions:**

1. Validate JSON syntax:
   ```bash
   cat .claude-plugin/marketplace.json | python -m json.tool
   ```

2. Check required fields are present:
   - `name`
   - `version`
   - `source`

3. Verify `source` path is correct relative to marketplace root

### Agent not spawning

**Symptoms:**
- Task tool call fails
- Agent type not found

**Solutions:**

1. Verify agent file exists:
   ```bash
   ls plugins/plugin-name/agents/
   ```

2. Check agent reference format: `plugin-name:agent-name`

3. Ensure command has `Task` in `allowed-tools`

## Getting More Help

If these solutions don't resolve your issue:

1. Check Claude Code documentation: https://docs.anthropic.com/claude-code
2. Contact the dev team: dev@ws.agency
3. Open an issue on the marketplace repository
