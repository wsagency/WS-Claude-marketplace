# Integrate reusable documentation bootstrap

**What to build:** Give /ws-setup and /ws-docs init one reusable, missing-only documentation bootstrap worker while keeping /ws-setup as the sole owner of its complete plan, confirmation, shared context changes, and recovery report.

**Blocked by:** 11-ship-standalone-local-setup-transaction

**Status:** ready-for-agent

- [ ] One internal docs-bootstrap contract describes the complete project-shape-aware initialization of user and contributor documentation, configuration, changelog support, and shared maintenance instructions.
- [ ] Both public callers invoke that internal worker directly rather than invoking each other, and the worker never prompts or schedules another entry node.
- [ ] Under /ws-setup, every documentation create, update, preserve, skip, conflict, worker dispatch, and shared-file fragment appears in the single pre-write plan and final confirmation.
- [ ] The worker creates only missing confirmed artifacts, preserves existing authored content and customized policy, and never performs regeneration or catch-up work during bootstrap.
- [ ] Shared context-file content is returned to the caller and composed once with the core setup fragment, so two workers never write the same artifact independently.
- [ ] An injected documentation failure stops setup, reports verified completed and pending manifest entries, and a rerun resumes only the missing documentation work.
- [ ] Standalone first run, pre-existing partial documentation, authored-content preservation, no-op rerun, and failure/resume are verified through the shared transaction seam and both public callers.
