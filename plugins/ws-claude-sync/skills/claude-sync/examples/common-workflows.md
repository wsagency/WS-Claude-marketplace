# Common Sync Workflows

## First-Time Setup

1. Create a private GitHub repository for sync data
2. Run `/ws-sync-setup` with the repo URL
3. Run `/ws-sync-push` to push initial data
4. On other machine: run `/ws-sync-setup` with same repo URL
5. Run `/ws-sync-pull` to pull data from first machine

## Daily Workflow

**Start of day (arriving at work machine):**
```
/ws-sync-pull
```

**End of day (leaving work machine):**
```
/ws-sync-push
```

## Switching Machines

**On machine you're leaving:**
```
/ws-sync-push
```

**On machine you're arriving at:**
```
/ws-sync-pull
```

## Full Environment Replication

When setting up a new machine or wanting complete sync:
```
/ws-sync-pull-full
```

## Check What's Configured

```
/ws-sync-status
```

## Troubleshooting

If sync fails, the `sync-troubleshooter` agent can diagnose issues. Common quick fixes:

- **"No Git repository configured"**: Run `/ws-sync-setup`
- **Git auth errors**: Ensure SSH keys are configured for the sync repo
- **Merge conflicts**: Pull first, resolve in the sync repo, then push
