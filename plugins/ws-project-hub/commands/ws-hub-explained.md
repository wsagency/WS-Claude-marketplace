---
allowed-tools: Bash, Read, Write, Glob, Grep, Task, AskUserQuestion
description: "Generate or refresh the hub's `role: explained` repo — self-contained product-explained artefacts for the ws-artefacts platform"
argument-hint: [topic]
---

## Your task

Generate or refresh the product-explained artefacts in this hub's
`role: explained` repo — human-facing visual documentation of the whole
product for the product owner and dev team, consumed by the ws-artefacts
platform (artefacts.wsagency.io). Run from a hub.

### 1. Resolve the explained repo

Read `./project.yaml` with the Read tool. If it's missing, abort with a hint
to run `/ws-hub-init` first. Locate the entry carrying `role: explained`
(max ONE per hub — see the `ws-artefacts-explained` skill).

If no entry has `role: explained`, ask the user via AskUserQuestion (or a
plain chat question when that tool is unavailable) how to proceed:

- **Register an existing repo** — run the `/ws-hub-add-repo` flow and mark
  the chosen entry `role: explained` (enforce max one), then continue below.
- **Create `<project>-explained`** — `mkdir ./<project>-explained` and
  `git -C ./<project>-explained init`, then register it with
  `role: explained` following the registration flow defined in
  `/ws-hub-add-repo` (project.yaml entry, `.gitignore` managed block,
  `AGENTS.md` marker region). Leave `url` empty until a remote exists; hint
  to create one on git.wsagency.io.
- **Cancel** — stop.

### 2. Generate the artefact(s)

Load the `ws-artefacts-explained` skill first — it defines the artefact HTML
contract (self-contained, inline-SVG diagrams, WS chrome palette, minimal
head), the `meta.json` shape, and the registration YAML. Everything written
below must satisfy it.

Gather sources:

- If `<hub>/openwiki/` exists and looks stale (`openwiki/.last-update.json`
  vs recent sub-repo commits), offer to refresh it first — refresh MUST use
  an explicit prompt, per the hub convention:
  `openwiki --update "Refresh the wiki; re-scan these sub-repos for changes: <name>, <name>, ..."`.
- Synthesize from: `project.yaml`, `openwiki/` (primary derived map), the
  `role: docs` repo's `dev-docs/` (decisions, architecture), per-sub-repo
  `dev-docs/` and READMEs, and `CONTEXT.md` for the glossary.
- If the product is large (many sub-repos), fan out per-repo content
  gathering via the Task tool (omp: its task agent) — one gatherer per
  sub-repo returning purpose, tech, key flows, and notable decisions.

Write into the explained repo:

- The artefact HTML — default file `<project>-explained.html` covering the
  whole product; when the user asked for a specific topic (`$ARGUMENTS`),
  write a kebab-case `<topic>.html` instead. Regenerate existing files in
  full rather than patching them — explained output is never hand-edited.
- `meta.json` — create or update the entry for each file written
  (`file`, `title`, `date`, `description`). Never write `token` fields;
  tokens are minted on the ws-artefacts side.

### 3. Verify standalone

Grep each generated HTML file for external references: any `src=` or
`href=` pointing at `http(s)` other than plain outbound `<a href>` links is
a contract violation, as are `<link rel="stylesheet">`, external
`<script src>`, mermaid markup, or robots/favicon meta in the head. Fix and
re-check until clean, then report what was verified.

### 4. Report and print the registration next step

Report the files written, then print the exact ws-artefacts registration
block for this repo, filling `repo` from the explained repo's remote
(`git -C <explained-path> config --get remote.origin.url`, or a
`<ssh-url-once-remote-exists>` placeholder when there is none):

```yaml
# ws-artefacts repo → projects/<project>/git-source.yml
name: <project>
repo: <ssh url of this explained repo>
ref: main
token: <minted on the ws-artefacts side — never set here>
# optional: path, password, description
```

Note alongside it: tokens are minted and committed on the ws-artefacts side
by its `add.mjs`; and the open item — ws-artefacts CI still needs cross-repo
pull auth (a deploy key or Gitea token for this repo in its Actions secrets)
before it can pull the explained repo.

### Safety rules

- Write only inside the explained repo, except when registering a new repo
  in step 1 (which touches `project.yaml`, `.gitignore`, and `AGENTS.md` via
  the `/ws-hub-add-repo` flow).
- Do not commit — leave the generated changes in the explained repo for the
  user to review and push (its own git; the hub ignores it).
