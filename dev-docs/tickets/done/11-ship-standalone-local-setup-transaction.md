# Ship the standalone Local setup transaction

**What to build:** Make /ws-setup complete a safe, end-to-end first run for an existing valid standalone git repository using the recommended Local Markdown tracker, then recognize the aligned repository on rerun without prompting or writing.

**Blocked by:** None — can start immediately

**Status:** done

- [x] Discovery is read-only, summarizes the detected standalone repository and current setup state, and asks only choices that valid existing state cannot answer.
- [x] The recommended Local setup produces a strict versioned canonical project configuration, the core tracker, triage, domain, context, and runtime-policy artifacts, and no secrets or machine identity.
- [x] Before any write, the user sees one complete plan that classifies every effect as create, update, preserve, skip, no-op, or blocking conflict and shows exact changes to existing managed content.
- [x] One final confirmation authorizes the complete plan; the ordered writes are read back and verified before the final readiness report is shown.
- [x] A second run against the verified result asks no questions, requires no confirmation, writes nothing, and reports “No changes required”.
- [x] A deterministic manifest-transaction contract exercises discovery input, scripted choices, the confirmed plan, isolated repository writes, derived readiness, and the final report through one behavioral seam.
- [x] The marketplace source and generated omp surface both discover the new public command, its core internal worker, the canonical schema contract, and the transaction support needed for this tracer.
