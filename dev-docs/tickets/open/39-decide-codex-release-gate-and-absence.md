# Decide the Codex release gate and absence verification

Map: extend-ws-to-codex
Label: wayfinder:grilling
Type: grilling
Status: ready-for-human
Blocked by: 36-decide-codex-distribution-channel

## Question

What does the release gate verify for a Codex target, given that `verify-release-artifacts.mjs` today drives a real isolated `claude plugin install` plus omp link/list/doctor with required-asset and removed-asset checks? Settle which installed assets must be present and which retired ones must be absent on Codex, whether an isolated Codex profile can be installed and probed non-interactively (`codex plugin marketplace add` against a local source) or only inspected statically, what the gate does when a runtime probe is impossible, and whether a Codex smoke is release-blocking or advisory on the first release that ships it.

Graduated from the map's fog once `34-research-codex-extension-surface` established what Codex actually loads.

