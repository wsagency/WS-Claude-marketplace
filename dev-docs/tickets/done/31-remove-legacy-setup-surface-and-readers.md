# Remove the legacy setup surface and readers

**What to build:** Complete the contract phase by making /ws-setup and its two internal workers the only setup convention in marketplace source, generated omp output, help, references, and runtime behavior, with no aliases or compatibility readers.

**Blocked by:** 25-reconfigure-tracker-and-jira-ownership, 26-reconfigure-triage-and-domain-routing, 27-reconfigure-documentation-and-changelog-policy, 28-cut-tracker-and-engineering-consumers-over, 29-cut-docs-and-hub-consumers-over, 30-cut-native-omp-runtime-consumers-over

**Status:** done

- [x] The Jira initializer command, setup route under the engineering graph router, legacy setup skill, obsolete generated equivalents, old names, and obsolete runtime settings are removed rather than aliased, forwarded, or deprecated.
- [x] Source and generated surfaces positively contain /ws-setup, the project-bootstrap worker, the docs-bootstrap worker, the canonical schema, required templates, and runtime support.
- [x] Permanent absence gates cover removed commands, routes, directories, names, config readers, settings, help text, references, graph edges, tests, and generated artifacts.
- [x] Help, command and skill references, graph documentation, prerequisites, install guidance, and canonical migration guidance all describe the same clean-cutover surface and user-mediated setup handoffs.
- [x] The native package is rebuilt from marketplace source, and generated content is never hand-edited.
- [x] Public-surface references and package descriptions remain synchronized, and the root changelog plus its user-facing mirror record the breaking replacement and migration path.
- [x] A repository with legacy state receives only the fail-closed /ws-setup migration direction, while a canonical repository exposes no second setup convention.
- [x] The complete focused and generation test suites pass with no legacy compatibility shim remaining.
