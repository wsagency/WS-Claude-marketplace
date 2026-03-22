# Conventional Commits Setup Guide

## commitlint Configuration

Install commitlint with the conventional config:

```bash
npm install --save-dev @commitlint/{cli,config-conventional}
```

Create `commitlint.config.js`:

```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'docs', 'style', 'refactor',
      'perf', 'test', 'build', 'ci', 'chore', 'revert'
    ]],
    'scope-case': [2, 'always', 'kebab-case'],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'subject-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 100],
  }
};
```

## Husky Integration (Local Hook)

```bash
npm install --save-dev husky
npx husky init
echo "npx --no -- commitlint --edit \$1" > .husky/commit-msg
```

## CI Integration (Gitea Actions)

```yaml
# .gitea/workflows/commitlint.yml
name: Lint Commits
on: [push, pull_request]

jobs:
  commitlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install --save-dev @commitlint/{cli,config-conventional}
      - run: npx commitlint --from ${{ github.event.pull_request.base.sha || 'HEAD~1' }} --to HEAD
```

## release-please Integration

release-please (by Google) creates Release PRs with auto-generated changelogs:

```yaml
# .gitea/workflows/release-please.yml
name: Release Please
on:
  push:
    branches: [main]

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          release-type: node
          changelog-types: |
            [
              {"type":"feat","section":"Features","hidden":false},
              {"type":"fix","section":"Bug Fixes","hidden":false},
              {"type":"perf","section":"Performance","hidden":false},
              {"type":"docs","section":"Documentation","hidden":true},
              {"type":"chore","section":"Miscellaneous","hidden":true}
            ]
```

### Why release-please over semantic-release

- **Human review gate**: Creates a PR that a human must merge to trigger release
- **Changelog preview**: See the generated changelog before it publishes
- **Better for SaaS**: Where you want control over release timing
- **Gitea compatible**: Works with Gitea Actions (GitHub Actions compatible YAML)

## VS Code Extensions

Recommend these to team members:

- **Conventional Commits** (`vivaxy.vscode-conventional-commits`): GUI for writing commits
- **commitlint** (`joshbolduc.commitlint`): Real-time validation in editor

## Team Adoption Tips

1. Start by enabling commitlint in CI only (warning mode) for 2 weeks
2. Share a cheat sheet of common commit types with examples
3. Add commit message template: `git config commit.template .gitmessage`
4. Upgrade to enforcing mode after the team adapts
