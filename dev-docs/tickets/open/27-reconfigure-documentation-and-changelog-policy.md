# Reconfigure documentation and changelog policy

**What to build:** Let a configured repository change documentation and changelog policy with minimal patches, missing-only enablement, content-preserving disablement, and explicit manifests for every path or track transition.

**Blocked by:** 16-integrate-reusable-docs-bootstrap, 24-reconfigure-runtime-policy-with-safe-resume

**Status:** ready-for-agent

- [ ] The user can select documentation, changelog, or concrete fields without resetting the rest of either section, and all unselected state is reported as preserved.
- [ ] Audience, scope, ADR routing, cadence, skip types, and similar policy-only changes update only canonical policy and the managed references that actually depend on them.
- [ ] Enabling documentation invokes the shared missing-only bootstrap through the confirmed reconfiguration plan; disabling policy preserves every existing document and authored directory.
- [ ] Changing a configured track, source, destination, mirror, or changelog path produces a content manifest naming collisions, copy-or-move intent, managed-reference effects, and verification steps before cutover.
- [ ] No source artifact is deleted until its destination and all active references are verified, and cancellation leaves the original configuration and content unchanged.
- [ ] The operation uses the shared dependency closure, journal, remote/local fingerprint, prepare-cutover-cleanup, safe-resume, partial-acceptance, and audit contracts.
- [ ] Deterministic scenarios cover policy-only changes, docs enablement, docs disablement, path collision, interrupted move, resume, preserved authored content, and aligned no-op behavior.
