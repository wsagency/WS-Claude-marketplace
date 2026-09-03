# Reconfigure triage and domain routing

**What to build:** Let a configured repository change semantic triage labels or single-context versus multi-context domain routing through explicit migration manifests that preserve active work and never guess bounded-context meaning.

**Blocked by:** 24-reconfigure-runtime-policy-with-safe-resume

**Status:** done

- [x] Reconfigure permits selecting triage labels, domain layout, or concrete fields independently and preserves every unselected policy and artifact.
- [x] A triage-label change maps each old value by semantic role, shows every affected local or remote item, and blocks while affected claimed work or unresolved tracker conflicts make migration unsafe.
- [x] New labels are created or validated before cutover, mappings switch only after verification, and old labels are removed only from affected items after the new state is active.
- [x] A domain-layout change requires an explicit context map, source-to-destination routing for decision and context artifacts, and visible collision handling rather than inferred semantics.
- [x] Content moves or copies are verified before active routing changes, authored prose is preserved, and source deletion occurs only when explicitly authorized.
- [x] Both migrations use the shared journal, fingerprint, prepare-cutover-cleanup, safe-resume, and audit contracts established by reconfigure.
- [x] Deterministic scenarios cover semantic relabeling, remote drift, claimed-work blocking, layout collision, interrupted cutover, resume, and aligned no-op behavior.
