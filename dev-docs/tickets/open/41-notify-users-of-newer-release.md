# Notify users of a newer WS release without forcing an upgrade

Label: maintenance
Status: needs-info
Blocked by: None — but the open questions below must be answered before work starts.

**Settled by the user (2026-09-14):** an older installed release keeps working and needs no immediate upgrade; the system tells the user a newer version exists, and that is the end of it. Nothing may force or nag an upgrade.

**Not settled — do not infer:**

- Whether Claude Code and omp already surface plugin or package update notices natively. The native WS extension carries no version-drift check (verified by search), but harness-level notices were not investigated; if either harness already tells the user, this ticket may reduce to documentation or disappear.
- Which layer should deliver the notice if one is needed, and what the version source of truth is.
- How often it may appear (once per session, once per version, or on explicit request) and what the user considers nagging.
- Whether the notice belongs to the marketplace release, the native package version, or both.

**Next step:** a research pass on harness-native update notification, then a short decision on delivery and frequency. Acceptance criteria are deliberately not written yet, because writing them now would invent the very choices this ticket must ask.

Context: [Decide the recurring ws-matt skill update cadence and ownership](./37-decide-skill-update-cadence-and-ownership.md).
