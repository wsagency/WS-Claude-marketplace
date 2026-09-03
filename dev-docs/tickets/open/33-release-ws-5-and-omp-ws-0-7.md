# Release WS 5.0.0 and omp-ws 0.7.0

**What to build:** Publish the exact preverified native package before tagging the matching marketplace release, verify both installed artifacts, and fail closed if registry publication or release identity diverges from the approved pair.

**Blocked by:** 32-prove-installed-claude-and-omp-parity

**Status:** in-progress

- [ ] Immediately before the external publication step, the user confirms the exact native package name, 0.7.0 version, retained artifact identity, target registry, marketplace 5.0.0 commit, and tag.
- [ ] The retained and previously tested native archive is published without rebuilding or substituting another artifact.
- [ ] Registry metadata, package contents, version, and a clean isolated installation are verified after publication before any marketplace tag or release is created.
- [ ] A publication or verification failure stops the sequence, does not create or announce the marketplace tag, and reports the exact partial external state.
- [ ] The marketplace release tags the exact reviewed 5.0.0 commit only after native verification succeeds and publishes the canonical migration and release communication already reviewed with that commit.
- [ ] A clean Claude Code marketplace installation and a clean omp installation resolve the documented release pair and expose only the canonical setup surface.
- [ ] Final reporting records the published identities and verification evidence without exposing credentials or claiming success for an unverified artifact.
