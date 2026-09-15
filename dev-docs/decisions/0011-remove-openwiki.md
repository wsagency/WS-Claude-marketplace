---
status: accepted
date: 2026-09-14
decision-makers: Kristijan Lukačin
---

# 0011 — Remove OpenWiki from the WS surface

OpenWiki is removed from the WS suite entirely, across both harnesses: the Claude Code Stop hook (`openwiki-freshness.sh`), the omp per-project hook template (`openwiki-freshness.ts`), the hub-only always-apply `openwiki-freshness` rule, the native extension's freshness check (`wiki-freshness.ts`), the `/ws-hub init` hub `openwiki/` scaffold step, and the `/ws-hub doctor` knowledge-freshness check. A hub's own `dev-docs/` remains the product knowledge root — now simply without staleness detection.

## Status

Accepted (2026-09-14)

Supersedes the OpenWiki-related parts of [ADR 0005](0005-skill-and-rule-naming.md), [ADR 0006](0006-hub-repo-types-and-migration.md), and [ADR 0007](0007-progressive-hub-adoption.md); those records remain unmodified as history.

## Context and Problem Statement

OpenWiki was the hub knowledge-freshness mechanism across both harnesses: an optional derived wiki at the hub root (`openwiki/`) mapping all `type: working` sub-repos, with staleness detected by comparing `dev-docs/**` mtimes against the wiki's `.last-update.json` marker. That one concept shipped as six surfaces — a Claude Code Stop hook, an omp per-project hook template, an always-apply rule, the native `@wsagency/omp-ws` freshness check, a `/ws-hub init` scaffold step, and a `/ws-hub doctor` check — plus a type-aware repo-walking parser that had to agree across three implementations. The wiki itself was a derived index that by convention always lost to authored dual-track docs, yet it demanded an external global npm tool, generated-CI-workflow cleanup, marker conventions, and coverage-scope bookkeeping on every hub operation. The maintainer decided (2026-09-14) to drop the whole concept rather than keep maintaining a second, weaker knowledge layer.

## Decision Drivers

- **One knowledge layer.** Authored truth in `dev-docs/` already wins on disagreement; a derived wiki duplicated it and had to be regenerated to stay useful.
- **Dual-harness maintenance cost.** Every change to the concept pays twice — Claude Code hook plus omp hook, rule, and extension check — and the three detectors must stay in parity (they historically drifted).
- **External tool dependency.** Hub setup required `openwiki` on PATH, deletion of its generated CI workflow, and marker/coverage-scope conventions, for an artifact agents consume by reading `dev-docs/` directly anyway.
- **Breaking by nature, so cut once.** Removing a released public surface is breaking regardless; a partial removal would leave dangling pointers in hub scaffolds and doctor checks.

## Considered Options

1. **Keep OpenWiki as-is** — retain the wiki, the init scaffold step, and all staleness detection.
2. **Keep detection, drop the tool** — remove the OpenWiki wiki itself but keep dev-docs-vs-marker staleness reminders.
3. **Remove entirely** — delete the wiki concept, the scaffold step, the rule, both hooks, the extension check, and the doctor check.

## Decision Outcome

Chosen option: "Remove entirely", because the derived wiki duplicated authored `dev-docs/` truth, and keeping staleness detection without the wiki would nag agents against a marker nothing updates. All six surfaces go in one breaking cut; a hub's `dev-docs/` remains the product knowledge root without staleness detection.

### Consequences

- Good, because the product knowledge root is a single authored layer: the hub's `dev-docs/`, read directly, with no derived copy to keep in sync.
- Good, because the generated omp surface loses the hub-only rule packaging mechanism and one hook event, and the three parity-coupled detectors disappear; the applied rule count is unchanged at 4, because the removed rule was never part of the applied surface.
- Good, because hubs no longer need the `openwiki` npm tool, generated-CI-workflow deletion, or `openwiki/` coverage bookkeeping in init, add, and mark-as-output flows.
- Bad, because nothing reminds agents that `dev-docs/` may have drifted; freshness becomes the author's discipline.
- Neutral, because existing hubs may still contain an `openwiki/` directory and tool-managed `<!-- OPENWIKI:START/END -->` marker blocks; both are inert after removal, and the hub owner retires them through OpenWiki itself (or by deleting the directory by hand) — WS never strips a block another tool maintains.
- Neutral, because a replacement staleness mechanism, if any, is a separate later effort — deliberately not designed here.

## Pros and Cons of the Options

### Keep OpenWiki as-is

- Good, because existing hubs keep their cross-repo derived map and the consult-before-exploring pointer workflow.
- Bad, because the wiki keeps drifting from authored truth and every surface change pays the dual-harness cost.
- Bad, because the external tool dependency and CI-workflow cleanup remain permanent hub-setup friction.

### Keep detection, drop the tool

- Good, because agents still get a reminder when product `dev-docs/` changed recently.
- Bad, because the reminder would point at a wiki that no longer exists, or must be redefined against a baseline nobody maintains.
- Bad, because the type-aware repo-walking parser — the most defect-prone surface in the suite — survives along with its three-implementation parity requirement.

### Remove entirely (chosen)

- Good, because the knowledge model collapses to one layer and the maintenance burden to zero.
- Good, because `/ws-hub init`, `add`, `doctor`, and the omp preset all lose a step instead of gaining a special case.
- Bad, because removing a released public surface is breaking and requires a changelog entry and an upgrade note for existing hubs.

## More Information

- Ticket: `dev-docs/tickets/done/42-remove-openwiki-from-the-ws-surface.md` (user request, 2026-09-14).
- ADR 0005 — cites `openwiki-freshness` as an example discipline rule; the naming rule itself stands, only the example is gone.
- ADR 0006 — hub repo types; the semantics table's "OpenWiki coverage" column and the type-aware staleness detection are superseded; the `type: working | input | output` vocabulary and migration path are not.
- ADR 0007 — progressive hub adoption; the standalone ruling that the repo's own `dev-docs/` IS the product knowledge root stands, only its OpenWiki staleness-walk clause is superseded.
