# omp integration backlog

Shipped v3.11.0: project `.omp/hooks/post/openwiki-freshness.ts` (native TS
hook — verified ExtensionAPI: `session_stop` with `{continue, additionalContext,
decision:"block"}` returns capped at 8 continuations, `tool_call` block
fail-closed, `context` per-call message rewriting, `ui.setWidget` banners).
New hook ideas from the API deep-dive, feasibility-verified:

- `session_stop` self-check continuation ("run tests before settling") — trivial
- `context` event redaction/injection per LLM call (transcript untouched)
- `before_provider_request` payload surgery (cache-control, betas per model)
- `ttsr_triggered`/`tool_approval_*` audit telemetry via `pi.appendEntry`
- `user_bash` interception + persistent status widgets (Jira ticket banner)

From the 2026-07-26 omp feature research (fresh clone, HEAD 403931b). Shipped in
v3.9.0: graph-engineering omp primitives note, `docs/how-to/omp-setup.md` user
checklist. Remaining, prioritized:

1. **`.omp/config.yml` preset in the hub template** (M) — modelRoles preset,
   `tools.approvalMode: write`, bash guard patterns, compaction threshold;
   written by `/ws-hub init` alongside the omp rules.
2. **WS rules pack — TTSR** (M) — hard conventions as stream-interrupting rules
   (`condition:`/`astCondition:` frontmatter): no force-push, Jira key in
   commits, no edits to generated files. Lands in the hub template's
   `.omp/rules/`.
3. **Agent frontmatter dual-compatibility audit** (S/M) — plugin `agents/*.md`
   valid for both harnesses (omp: `tools` CSV, `model` selectors like `@smol`);
   needs a hands-on omp install test first (does `model: sonnet` resolve?).
4. **WATCHDOG.md template** (M) — advisor brief encoding ws-code-review axes;
   cross-family `modelRoles.advisor`.
5. **ws-guard extension** (M/L) — `tool_call` policy hook (commit format,
   protected branches). Cannot ship via marketplace (npm/link only) — new
   `tools/omp/` dir + setup doc.
6. **Browser-verify skill** (M) — omp `browser` tool (ariaSnapshot, screenshots)
   as the UI-verification path, replacing the playwright MCP dependency.
7. **invoke-ai.sh RPC backend** (L) — drive omp via `--mode rpc` for scripted
   hub launches; also `omp acp` note for Zed users.
8. **Swarm extension evaluation** (M) — `omp-swarm` YAML DAGs as a declarative
   runner for ws-matt graphs (npm-only).
