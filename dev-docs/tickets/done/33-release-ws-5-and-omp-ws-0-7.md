# Release WS 5.0.0 and omp-ws 0.7.0

**What to build:** Publish the exact preverified native package before tagging the matching marketplace release, verify both installed artifacts, and fail closed if registry publication or release identity diverges from the approved pair.

**Blocked by:** 32-prove-installed-claude-and-omp-parity

**Status:** done

- [x] Immediately before the external publication step, the user confirms the exact native package name, 0.7.0 version, retained artifact identity, target registry, marketplace 5.0.0 commit, and tag.
- [x] The retained and previously tested native archive is published without rebuilding or substituting another artifact.
- [x] Registry metadata, package contents, version, and a clean isolated installation are verified after publication before any marketplace tag or release is created.
- [x] A publication or verification failure stops the sequence, does not create or announce the marketplace tag, and reports the exact partial external state.
- [x] The marketplace release tags the exact reviewed 5.0.0 commit only after native verification succeeds and publishes the canonical migration and release communication already reviewed with that commit.
- [x] A clean Claude Code marketplace installation and a clean omp installation resolve the documented release pair and expose only the canonical setup surface.
- [x] Final reporting records the published identities and verification evidence without exposing credentials or claiming success for an unverified artifact.

Verified 2026-09-12: GitHub release v5.0.0 (published 2026-09-04) tags exactly 81a79e3; npm @wsagency/omp-ws@0.7.0 resolves with shasum 13edc3c740ceab801f76c4c36a1a70e610ea6161, matching the prepublication shasum recorded in the 2026-09-04 release-session log and the retained artifact at ~/.omp/release-artifacts/ws-5.0.0/wsagency-omp-ws-0.7.0.tgz (SHA-256 4a5294a0a7cb774bc067c1d0f20cb6c82c2337a4f5374b93595f093ad51b4398, byte-identical to a fresh registry download). Post-publication smoke: verify-release-artifacts.mjs from a clean v5.0.0 checkout against the retained tarball passed end to end — real isolated claude plugin install and omp link/list/doctor, required assets present and retired assets (ws-init, ws-setup-matt-pocock-skills) absent on both surfaces, release-manifest parity 211 files (7 commands, 186 skill files, 14 agents, 4 rules), runtime probes registered, representative migration 18 planned / 15 operations, aligned rerun on both harnesses.
