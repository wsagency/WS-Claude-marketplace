---
description: Never hand-edit generated files (openwiki, changelog mirror, explained)
condition: "openwiki/(?!INSTRUCTIONS)[^\\s]+\\.md|docs/changelog\\.md|-explained\\.html"
scope: "tool:write(*)"
interruptMode: immediate
---

# Generated file — do not hand-edit

That path is GENERATED output (OpenWiki page, changelog mirror, or explained
artefact). WS convention: fix the SOURCE instead —

- OpenWiki pages → change code or dev-docs, then run the prompted
  `openwiki --update` refresh (`openwiki/INSTRUCTIONS.md` is the one editable file)
- `docs/changelog.md` → edit root `CHANGELOG.md`; the mirror is copied
- explained artefacts → regenerate via /ws-hub-explained

Proceed only if the user explicitly asked to hand-edit this generated file.
