# Decide the recurring ws-matt skill update cadence and ownership

Map: sustain-the-ws-matt-skill-set
Label: wayfinder:grilling
Type: grilling
Status: resolved
Claimed by: work-through session 2026-09-14
Blocked by: 35-research-vendored-skill-upstreams

## Question

What recurring process keeps the vendored ws-matt skill set current, and who owns it? Settle the trigger (calendar cadence, the upstream release signal, or session-time drift detection), the accountable human or role, how a detected upstream change is reviewed before it lands (delta classification, ADR when a convention shifts, changelog treatment), how the documented WS adaptations survive an update, and what state the repository must track so the process is resumable rather than remembered. Scope is the ws-matt set named in the originating plan; whether the same mechanism later covers `herdr` or the convention-tracking skills is out of scope for this map.

## Comments

### Grill note — 2026-09-14 (partial, ticket still open)

**Detection latency: settled — no SLA.** Upstream drift carries no measured cost here; the pin is deliberately conservative. No scheduled signal check and no session-time drift nudge are warranted, so the scheduled-versus-session-time mechanism question is moot and was dropped.

**Adoption gate: newly surfaced constraint.** Taking a *new* upstream skill requires analysis and an eval before it lands, and that capability is deliberately not being built now. So a refresh may only carry deltas to already-vendored skills; new upstream skills stay unadopted regardless of what the delta shows, until an eval capability exists. That eval effort is out of scope for this map.

**Detection and adoption are separate decisions.** The procedure's Gates 0-2 (dirty tree, `pin..HEAD` delta, classification) plus a Gate 8 log line are cheap, bounded, and answer only "has upstream moved and how". Gates 3-8 (parallel audits, conscious porting through the rename map, graph and reference gates, omp rebuild, verification, pin bump) are the unbounded part: they can expand or block whatever work they land in. Any trigger decision must say which of the two it initiates; "refresh at moment X" is ambiguous and must not be recorded as the answer.

**Trigger: settled — upstream news is reviewed while developing a new WS release.** Not a calendar, not a signal check, not a session-time nudge. A new Matt release, or news in the graph skills, is looked at during development of the next WS release. Detection there is bounded (Gates 0-2 plus a log line) and must run on a clean HEAD before release edits begin, because Gate 0 stops on a dirty tree.

**Installed releases: settled — nobody is pushed.** An older installed release keeps working; it does not need an immediate upgrade. The system tells the user a newer version exists and that is the end of it. Scope and mechanics of that notice are not part of this ticket and are captured separately in [Notify users of a newer WS release without forcing an upgrade](./41-notify-users-of-newer-release.md).

**Ownership: settled — the developer.** The developer driving the new release's development runs the detection pass. There is deliberately no standing owner between releases, because there is no standing process to own.

**Durable state: settled — what the repository already tracks is enough.** A dated `dev-docs/maintenance-log.md` entry plus the pin in `plugins/ws/UPSTREAM.md` make the process resumable from the repository alone. No additional tracked upstream manifest is introduced, which also settles the map's former fog on that question.

**Late adoption, one time only.** The release now in preparation already carries `[Unreleased]` implementation edits, so it cannot satisfy this rule's "detection before release edits begin" ordering retroactively. If the rule is adopted now, run the bounded pass before any FURTHER release work and record it in the maintenance log as a one-time late adoption; the ordering is enforced normally from the following release onward.

### Resolution — 2026-09-15

**There is no standing cadence, and that is the decision.** No SLA, no scheduled signal check, no session-time drift nudge. The pin is deliberately conservative, upstream drift carried no measured cost, and a new upstream skill needs analysis and an eval before it could be adopted anyway.

**The trigger is the start of new-release development, and it runs detection only.** Whoever begins developing the next release runs Gates 0-2 on a clean HEAD before any release edits — `git status --porcelain`, a full clone, `pin..HEAD` delta, classification — and records a dated `dev-docs/maintenance-log.md` entry with `pin_before` / `candidate_head` / `class` / `skills_touched` / `pin_after`. A `no-delta` or docs-only outcome ends there. A contentful or inventory delta becomes its own maintenance ticket and never expands the release in flight; a "nothing to port" outcome is still logged. Gates 3-8 — audits, conscious porting through the rename map, graph and reference gates, omp rebuild, verification, pin bump — run as their own deliberate session on that ticket.

**New upstream skills stay out** until an analysis-and-eval capability exists; a refresh carries only changes to already-vendored skills. That capability is a separate effort, deliberately not started.

**Ownership follows the release.** The developer driving the new release's development owns the detection pass. There is deliberately no standing owner between releases, because there is no standing process to own.

**Durable state is already sufficient.** The dated maintenance-log entry plus the pin in `plugins/ws/UPSTREAM.md` make the process resumable from the repository alone. No additional tracked upstream manifest is introduced — which also settles the map's former fog on that question.

**First application, recorded.** The rule was exercised immediately: the 2026-09-15 bounded detection pass classified the delta `inventory` (candidate `959a8e9`, 37 vendored paths, new upstream `wizard` skill), left the pin untouched, and handed the port to `43-refresh-the-vendored-ws-matt-set`. Because the 6.0.0 release already carried `[Unreleased]` edits when the rule was adopted, that pass is logged as a one-time late adoption; the ordering is enforced normally from the next release.

**Status:** done
