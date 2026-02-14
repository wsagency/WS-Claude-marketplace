# Claude Code Data Stores

## Project Directory (.claude/)

Each project has a `.claude/` directory containing:

```
.claude/
├── settings.json      # Project-specific settings
├── settings.local.json # Machine-specific project settings (gitignored)
└── todos.jsonl         # Project todos
```

## Session History (~/.claude/projects/)

```
~/.claude/projects/
├── -Users-john-project-a/
│   ├── <session-id>.jsonl     # Session transcript
│   ├── <session-id>.jsonl     # Another session
│   └── ...
├── -Users-john-project-b/
│   └── ...
```

Each session file is a JSONL file containing the conversation transcript for that session.

## History Index (~/.claude/history.jsonl)

A line-delimited JSON file where each line contains:

```json
{"directory":"/Users/john/projects/my-app","sessionId":"abc123","timestamp":"2025-01-15T10:30:00Z"}
```

This file maps project paths to session IDs and provides the data for the "resume session" feature.

## Relationships

```
history.jsonl entry  ──references──>  project directory (by absolute path)
                     ──references──>  session file (by sessionId)

session files        ──stored in──>   ~/.claude/projects/[encoded-path]/

project directory    ──contains──>    .claude/ settings
```

Moving a project breaks both:
1. The `directory` field in history.jsonl
2. The encoded path folder name in ~/.claude/projects/
