# Refresh the vendored ws-matt set from upstream 959a8e9

Label: maintenance
Status: needs-info
Blocked by: None — but the adoption question below must be answered before porting.

**What to build:** Apply the upstream delta detected by the 2026-09-15 bounded detection pass (see `dev-docs/maintenance-log.md`) to the vendored ws-matt set, through Gates 3-8 of `ws-repo-maintenance`, as its own deliberate session. This never runs inside a release.

- `pin_before`: `ed37663cc5fbef691ddfecd080dff42f7e7e350d` (2026-07-21)
- `candidate_head`: `959a8e9f1edc3adbe2f7e3054bb6fbefa6696260` (2026-09-15)
- `class`: `inventory` — 37 vendored paths changed, and `skills/engineering/wizard/` was added upstream

**Adoption question that must be answered first — do not infer:** the class is `inventory` only because a NEW skill (`wizard`) appeared upstream, yet ticket 37 settled that a new upstream skill is not adopted until an analysis-and-eval capability exists, which is deliberately not being built. So either this refresh ports only the changes to the 17 already-vendored skills and explicitly declines `wizard` (in which case the pin policy needs a ruling, because the pin records the last contentful source actually applied and declining part of the delta makes a full-range pin misleading), or `wizard` is admitted and the eval requirement is revisited. `skills/engineering/ask-matt/PHASE-BOUNDARIES.md` is a new companion file inside an already-vendored skill, not a new skill, so it ports with its skill.

**Acceptance, once that is settled:**

- [ ] Gate 3 audits run in parallel and are reconciled before any byte is ported: upstream delta, WS adaptations against the preserve-list, graph/reference impact, and distribution impact.
- [ ] Every WS-local adaptation named in `plugins/ws/UPSTREAM.md` survives the port, including the three named additions (ws-to-tickets post-publish scheduling, ws-research default path, local-ticket `share:` line) and the `## Graph node` sections.
- [ ] Ports go through the rename map; no upstream path lands under an upstream name.
- [ ] Gate 5: inventory, edges, and skill behaviour changes are reflected in the graph and reference docs.
- [ ] Gate 6: the native omp package is rebuilt because `plugins/ws/` surface changed.
- [ ] Gate 7: the `UPSTREAM.md` re-verify checklist passes, including byte-identical `LICENSE`.
- [ ] Gate 8: the pin is bumped per the ruling above and the outcome is recorded in `dev-docs/maintenance-log.md` with `pin_before` / `candidate_head` / `class` / `skills_touched` / `pin_after`.
