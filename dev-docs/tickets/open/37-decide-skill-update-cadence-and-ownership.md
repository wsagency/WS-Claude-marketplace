# Decide the recurring ws-matt skill update cadence and ownership

Map: sustain-the-ws-matt-skill-set
Label: wayfinder:grilling
Type: grilling
Status: ready-for-human
Claimed by: work-through session 2026-09-14
Blocked by: 35-research-vendored-skill-upstreams

## Question

What recurring process keeps the vendored ws-matt skill set current, and who owns it? Settle the trigger (calendar cadence, the upstream release signal, or session-time drift detection), the accountable human or role, how a detected upstream change is reviewed before it lands (delta classification, ADR when a convention shifts, changelog treatment), how the documented WS adaptations survive an update, and what state the repository must track so the process is resumable rather than remembered. Scope is the ws-matt set named in the originating plan; whether the same mechanism later covers `herdr` or the convention-tracking skills is out of scope for this map.

## Comments

### Grill note — 2026-09-14 (partial, ticket still open)

**Detection latency: settled — no SLA.** Upstream drift carries no measured cost here; the pin is deliberately conservative. No scheduled signal check and no session-time drift nudge are warranted, so the scheduled-versus-session-time mechanism question is moot and was dropped.

**Adoption gate: newly surfaced constraint.** Taking a *new* upstream skill requires analysis and an eval before it lands, and that capability is deliberately not being built now. So a refresh may only carry deltas to already-vendored skills; new upstream skills stay unadopted regardless of what the delta shows, until an eval capability exists. That eval effort is out of scope for this map.

**Detection and adoption are separate decisions.** The procedure's Gates 0-2 (dirty tree, `pin..HEAD` delta, classification) plus a Gate 8 log line are cheap, bounded, and answer only "has upstream moved and how". Gates 3-8 (parallel audits, conscious porting through the rename map, graph and reference gates, omp rebuild, verification, pin bump) are the unbounded part: they can expand or block whatever work they land in. Any trigger decision must say which of the two it initiates; "refresh at moment X" is ambiguous and must not be recorded as the answer.

Still open: whether the initiating moment runs a non-blocking detection pass that records and defers a contentful delta, or mandates the full refresh in place; who is accountable; and whether the maintenance log alone is sufficient durable state.