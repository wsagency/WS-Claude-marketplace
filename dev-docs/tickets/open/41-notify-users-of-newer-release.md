# Notify users of a newer WS release without forcing an upgrade

Label: maintenance
Status: needs-info
Blocked by: None — but the open questions below must be answered before work starts.

**Settled by the user (2026-09-14):** an older installed release keeps working and needs no immediate upgrade; the system tells the user a newer version exists, and that is the end of it. Nothing may force or nag an upgrade.

**Settled by the user (2026-09-14):** the WS plugin itself tells the user when a newer version exists — the notice is ours to deliver, not something to inherit from a harness, because we WANT users to upgrade. Harness-native notices are therefore corroborating research, not a gate on this ticket.

**Version source of truth: settled (2026-09-15) — our own public repositories.** The check reads the released version from the WS public repos, not from a registry or a harness API. The marketplace release version is the anchor; the native package version is reported alongside it when it differs.

**Bootstrap constraint — structural, not a choice.** A notifier introduced in a future release cannot notify anyone running an earlier one: users on 6.0.0 have no notifier code. Whatever is built here covers releases AFTER the notifier ships. The first upgrade into the notifier-bearing release therefore still depends on out-of-band or harness-native discovery, so that path must be documented rather than assumed away — and it is the reason the harness-native question below is worth answering even though WS delivers its own notice.

**Not settled — do not infer:**

- Whether Claude Code and omp already surface plugin or package update notices natively — now only to avoid a double notice, since WS delivers its own either way.

- How often it may appear (once per session, once per version, or on explicit request) and what the user considers nagging.
- Whether the notice belongs to the marketplace release, the native package version, or both.

**Next step:** a research pass on harness-native update notification (to avoid duplicate notices) plus the version-source and frequency answers, then acceptance criteria. They are deliberately not written yet, because writing them now would invent the very choices this ticket must ask.

Context: [Decide the recurring ws-matt skill update cadence and ownership](./37-decide-skill-update-cadence-and-ownership.md).
