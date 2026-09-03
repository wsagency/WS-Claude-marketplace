# Define tracker and Jira configuration ownership

Map: unify-ws-setup-entrypoints
Label: wayfinder:grilling
Type: grilling
Status: resolved
Blocked by: None — can start immediately.

## Question

Which component owns each tracker and Jira setting after the merge, how should local, Local + Jira, GitHub, GitLab, Jira-only, and custom trackers be selected, and how should `~/.claude/ws/config.yaml`, `.claude/ws-project.yaml`, and `dev-docs/agents/issue-tracker.md` agree without duplicating or silently overwriting user choices?

## Answer

The repository-local, committed `.wsagency/config.yaml` is the sole WS machine-configuration source for both Claude Code and omp. It contains no secrets and owns the primary tracker selection, optional Jira synchronization binding, Jira-aware commit behavior, changelog policy, session dashboard policy, and documentation configuration. Jira authentication and site configuration remain owned by jira-cli outside the repository.

`dev-docs/agents/issue-tracker.md` remains the human- and agent-readable operational adapter. It describes tracker operations and reads values from `.wsagency/config.yaml`; it must not duplicate project keys, board IDs, or policy values. The legacy `~/.claude/ws/config.yaml` and `.claude/ws-project.yaml` are migration inputs only. If legacy sources disagree, `/ws-setup` shows the conflict and requires an explicit choice rather than guessing. Existing `.wsagency/config.yaml` values are canonical and are preserved on re-run unless the user explicitly changes them.

The supported primary trackers are Local Markdown, GitHub Issues, GitLab Issues, and Jira. Local Markdown is the default for a new repository. `Custom` is not exposed until a concrete, validated adapter exists.

Local Markdown may enable Jira synchronization. When enabled:

- every local ticket is mapped to a Jira issue;
- synchronization runs before and after every tracker operation, without a background daemon or separate public sync command;
- title, description and acceptance criteria, status, comments, priority, and ticket type are synchronized through explicit semantic mappings;
- local-only metadata such as claims, share URLs, map pointers, and agent state is never copied to Jira;
- if both sides changed the same mapped field since the last successful sync, the operation stops before overwriting either side, shows the diff, and asks the user to choose Local, Jira, or a manual merge;
- if Jira is unavailable, the local operation completes and records `jira_sync: pending`; the next tracker operation retries pending synchronization first.

Selecting Jira as the primary tracker requires working jira-cli authentication before the final write boundary. There is no silent fallback: the user must either repair Jira readiness or explicitly choose another primary tracker.
