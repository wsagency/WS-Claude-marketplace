---
name: ws-repo-maintenance
description: "AI-driven maintenance process for the ws-claude-marketplace repo itself. Use when asked to update/refresh this repo, sync vendored upstreams (Matt Pocock skills, herdr), audit external tool versions and their docs (jira-cli, tea, omp, herdr, openwiki, bun), or adopt new omp capabilities. Maintainer-facing; runs from a checkout of the marketplace repo."
---

# WS Repo Maintenance

The written process for keeping this repo current. Run it from a checkout of
the marketplace repo, on request ("update the repo") or before a planned
release wave. Every run ends with a dated entry in
`dev-docs/maintenance-log.md` (create it on first run) recording: date,
versions checked, drift found, actions taken.

Follow the phases in order; each is skippable when its scope is untouched,
but say so in the log entry.

## 1. Vendored upstreams

**ws-matt skills** — follow the sync procedure in `plugins/ws/UPSTREAM.md`
(it records the pinned upstream commit and the rename/adaptation map):
fetch a fresh clone of `mattpocock/skills`, diff upstream against the pin,
port meaningful changes through the rename map (WS-local adaptations listed
there always win), update the pinned commit. Never overwrite the `## Graph
node` sections — they are WS-local.

**herdr skill** — `plugins/ws/skills/herdr/` is vendored from
`ogulcancelik/herdr` (`SKILL.md` at repo root; pin recorded in
`plugins/ws/skills/herdr/UPSTREAM.md`). Fetch
`https://raw.githubusercontent.com/ogulcancelik/herdr/master/SKILL.md`,
diff, take upstream verbatim (no WS-local adaptations by policy), update the
pin.

## 2. External tools — versions and doc drift

For each tool: check installed vs latest, skim release notes since the last
log entry, and verify OUR documented invocations still hold. Fix docs where
drift is found; flag behavior changes that affect commands/skills.

| Tool | Latest check | Our claims to re-verify |
|---|---|---|
| jira-cli | `jira version` vs GitHub releases (ankitpokhrel/jira-cli) | `issue view --raw`, `issue list -q --plain --paginate`, `worklog add --no-input`, `issue move`, `comment add --no-input` (ws-commit, ws-status, ws-init) |
| tea | `tea --version` vs gitea/tea releases | `tea pr create --title --description --base` (ws-commit pr) |
| omp | `omp --version` vs omp.sh releases | plugin dir conventions, ExtensionAPI events, `/marketplace`/`plugin upgrade` verbs (docs/how-to/omp-setup.md, use-with-omp.md, extensions/omp-ws) |
| herdr | `herdr --version` vs herdr.dev | skill + workspace commands (hub init 5b, herdr skill) |
| openwiki | `openwiki --version` vs upstream | `--init`, prompted `--update` semantics, INSTRUCTIONS.md scope, `.last-update.json` marker (hub flows, freshness hooks) |
| bun | `bun --version` | build scripts in extensions/omp-ws |
| skills CLI | `npx skills --version` | `npx skills add <repo> --skill <name> [-g]` (herdr install path) |

## 3. omp capability adoption

In `extensions/omp-ws/`: bump the `@oh-my-pi/pi-coding-agent` devDependency
to the installed omp version, then `bun run typecheck && bun test` and the
headless smoke from its README. Read the omp CHANGELOG delta for
extensibility changes; record adoption candidates (new events, APIs) in
`dev-docs/omp-native-improvements.md` — adopt only with evidence of value.

## 4. Rebuild and release

Any change to `plugins/ws/` surface or the extension → `cd extensions/omp-ws
&& bun run build` (regenerates commands/skills/agents/rules; verify the
printed counts) and rerun tests. Then the standard release flow
(`dev-docs/development.md`): changelog, lockstep version, mirror, tag, push.
Team announcement lines: `claude plugin marketplace update ws-marketplace` +
plugin update; omp users rebuild + relink the native package.

## 5. Record

Append the dated entry to `dev-docs/maintenance-log.md`. If a decision was
made (adopt/skip a capability, pin policy change), it gets an ADR per the
two-tier rule.
