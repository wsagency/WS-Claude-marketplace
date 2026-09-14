---
description: Never hand-edit generated files (changelog mirror, explained)
condition: "docs/changelog\\.md|-explained\\.html"
scope: "tool:write(*)"
interruptMode: immediate
---

# Generated file — do not hand-edit

That path is GENERATED output (changelog mirror or explained artefact). WS
convention: fix the SOURCE instead —

- `docs/changelog.md` → edit root `CHANGELOG.md`; the mirror is copied
- explained artefacts → regenerate via /ws-hub explained

Proceed only if the user explicitly asked to hand-edit this generated file.
