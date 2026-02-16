# Common clamp Workflows

## Moving a Project (Recommended Flow)

```bash
# 1. Preview the move
/clamp-move  # say "move ~/old/project to ~/new/project" — it will dry-run first

# 2. After reviewing dry-run output, confirm
# 3. Verify with
/clamp-inspect  # say "show info for ~/new/project"
```

## After a Manual `mv`

If you already moved a project with `mv`:

```bash
# Let clamp detect and fix the broken reference
/clamp-maintain  # say "fix broken references"

# Or be explicit
/clamp-maintain  # say "fix from ~/old/path to ~/new/path"
```

## Health Check

Regular maintenance:

```bash
# 1. Check all references
/clamp-inspect  # say "list all projects"

# 2. Verify health
/clamp-maintain  # say "verify all projects"

# 3. Clean up orphans if any
/clamp-maintain  # say "prune orphaned sessions"
```

## Archiving Before Cleanup

Before removing old projects:

```bash
# 1. Pack the project
/clamp-archive  # say "pack ~/old-project"

# 2. Verify the archive was created
ls *.claudepack

# 3. Remove the project
/clamp-move  # say "remove ~/old-project"
```

## Restoring from Archive

```bash
# Unpack to new location
/clamp-archive  # say "unpack backup.claudepack to ~/new-location"
```

## Bulk Operations

For managing many projects, use the project-manager agent:
1. It surveys all projects
2. Identifies issues
3. Plans a fix sequence
4. Recommends commands to run
