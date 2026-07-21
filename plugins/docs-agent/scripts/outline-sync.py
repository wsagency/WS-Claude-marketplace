#!/usr/bin/env python3
"""Sync a docs/ tree with an Outline collection (docs.wsagency.io).

Subcommands: lint | push | pull.  Stdlib only.  State: .outline-sync.json
at --root (committed).  Auth: OUTLINE_API_TOKEN env var, or the file
~/.config/ws-docs/outline-token.  Git stays authoritative: push refuses
files changed on both sides (see --force), pull only writes working-tree
files for a reviewed PR.

TODO(v-next): --normalize (auto-rewrite of profile violations) and
image/attachment upload from docs/assets/ are deferred.
"""
import argparse, hashlib, json, os, re, sys, urllib.error, urllib.request

DEFAULT_URL = "https://docs.wsagency.io"
STATE_FILE = ".outline-sync.json"
TOKEN_FILE = os.path.expanduser("~/.config/ws-docs/outline-token")

HTML_TAG = re.compile(r"<(?!!--)/?[a-zA-Z][^>]*>")
FOOTNOTE = re.compile(r"\[\^[^\]]+\]")
HIGHLIGHT = re.compile(r"==[^=\n]+==")
HEADING_ID = re.compile(r"^#{1,6} .*\{#[-\w]+\}\s*$", re.M)
FENCE = re.compile(r"(?ms)^ {0,3}```.*?^ {0,3}```[^\n]*$")
INLINE_CODE = re.compile(r"`[^`\n]*(?:\n[^`\n]*)?`")


def lint_markdown(text):
    """Outline-safe profile check. Returns [] when clean."""
    stripped = INLINE_CODE.sub("", FENCE.sub("", text))  # code may contain anything
    violations = []
    if HTML_TAG.search(stripped):
        violations.append("raw HTML element (Outline has no HTML support)")
    if FOOTNOTE.search(stripped):
        violations.append("footnote syntax [^..] (unsupported)")
    if HIGHLIGHT.search(stripped):
        violations.append("==highlight== (unsupported in markdown)")
    if HEADING_ID.search(stripped):
        violations.append("manual heading ID {#...} (Outline auto-assigns)")
    return violations


def load_state(root):
    p = os.path.join(root, STATE_FILE)
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return {"outline": {"url": DEFAULT_URL, "collection_id": None},
            "docs_dir": "docs", "documents": {}}


def save_state(root, state):
    with open(os.path.join(root, STATE_FILE), "w") as f:
        json.dump(state, f, indent=2, sort_keys=True)
        f.write("\n")


def read_token():
    token = os.environ.get("OUTLINE_API_TOKEN")
    if not token and os.path.exists(TOKEN_FILE):
        token = open(TOKEN_FILE).read().strip()
    if not token:
        sys.exit("No Outline token. Set OUTLINE_API_TOKEN or write the token "
                 "to ~/.config/ws-docs/outline-token (create an API token in "
                 "Outline: Settings → API tokens).")
    return token


def content_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


LINK = re.compile(r"(\[[^\]]*\]\()([^)\s]+)(\))")


def doc_title(text, path):
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    stem = os.path.splitext(os.path.basename(path))[0]
    return stem.replace("-", " ").replace("_", " ").title()


def walk_docs(root, docs_dir):
    base = os.path.join(root, docs_dir)
    files = []
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames.sort()
        rel_dir = os.path.relpath(dirpath, root)
        mds = sorted(f for f in filenames if f.endswith(".md"))
        ordered = ([f for f in ("index.md", "explained.md") if f in mds]
                   + [f for f in mds if f not in ("index.md", "explained.md")])
        files.extend(os.path.join(rel_dir, f).replace(os.sep, "/") for f in ordered)
    return files


def parent_of(path, docs_dir):
    folder = os.path.dirname(path).replace(os.sep, "/")
    if os.path.basename(path) == "index.md":
        parent_folder = os.path.dirname(folder)
        if parent_folder in ("", docs_dir.rstrip("/")) and folder == docs_dir:
            return None
        candidate = f"{parent_folder}/index.md"
        return candidate if parent_folder else None
    if folder == docs_dir:
        return None
    return f"{folder}/index.md"


def rewrite_links_to_outline(text, path, url_map):
    base = os.path.dirname(path)

    def repl(m):
        target = m.group(2)
        if target.startswith(("http://", "https://", "/", "#", "mailto:")):
            return m.group(0)
        resolved = os.path.normpath(os.path.join(base, target)).replace(os.sep, "/")
        if resolved in url_map:
            return f"{m.group(1)}/doc/{url_map[resolved]}{m.group(3)}"
        return m.group(0)
    return LINK.sub(repl, text)


def rewrite_links_to_local(text, reverse_map):
    def repl(m):
        target = m.group(2)
        if target.startswith("/doc/"):
            url_id = target[len("/doc/"):]
            if url_id in reverse_map:
                return f"{m.group(1)}{os.path.relpath(reverse_map[url_id], 'docs/tutorials').replace(os.sep, '/')}{m.group(3)}"
        return m.group(0)
    return LINK.sub(repl, text)


def plan_push(files, read_text, state):
    docs = state.get("documents", {})
    plan = {}
    for path in files:
        text = read_text(path)
        entry = docs.get(path)
        if entry is None:
            plan[path] = "create"
        elif entry.get("last_synced_hash") == content_hash(text):
            plan[path] = "skip"
        else:
            plan[path] = "update"
    return plan


class OutlineAPI:
    def __init__(self, url, token):
        self.url, self.token = url.rstrip("/"), token

    def call(self, endpoint, **payload):
        req = urllib.request.Request(
            f"{self.url}/api/{endpoint}",
            data=json.dumps(payload).encode(),
            headers={"Authorization": f"Bearer {self.token}",
                     "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as resp:
                return json.load(resp)["data"]
        except urllib.error.HTTPError as e:
            raise SystemExit(f"Outline API {endpoint} failed: {e.code} {e.read().decode()[:300]}")


def cmd_lint(root, state):
    failures = {}
    for path in walk_docs(root, state["docs_dir"]):
        v = lint_markdown(open(os.path.join(root, path)).read())
        if v:
            failures[path] = v
    print(json.dumps({"clean": not failures, "violations": failures}, indent=2))
    return 1 if failures else 0


def cmd_push(root, state, dry_run, force):
    if cmd_lint(root, state) and not force:
        sys.exit("push refused: profile violations above (fix or --force)")
    api = None if dry_run else OutlineAPI(state["outline"]["url"], read_token())
    if not state["outline"]["collection_id"] and not dry_run:
        name = os.path.basename(os.path.abspath(root))
        state["outline"]["collection_id"] = api.call("collections.create", name=name)["id"]
    files = walk_docs(root, state["docs_dir"])
    read = lambda p: open(os.path.join(root, p)).read()
    plan = plan_push(files, read, state)
    url_map = {p: e["id"] for p, e in state["documents"].items() if "id" in e}
    report = {"created": [], "updated": [], "skipped": [], "conflicts": [], "archived": []}
    for path in files:
        action = plan[path]
        if action == "skip":
            report["skipped"].append(path); continue
        text = rewrite_links_to_outline(read(path), path, url_map)
        title = doc_title(read(path), path)
        if dry_run:
            report[action + "d"].append(path); continue
        if action == "update":
            entry = state["documents"][path]
            info = api.call("documents.info", id=entry["id"])
            if info.get("revision") != entry.get("last_synced_revision") and not force:
                report["conflicts"].append(path); continue
            doc = api.call("documents.update", id=entry["id"], title=title, text=text)
        else:
            parent = parent_of(path, state["docs_dir"])
            parent_id = state["documents"].get(parent, {}).get("id") if parent else None
            doc = api.call("documents.create", title=title, text=text, publish=True,
                           collectionId=state["outline"]["collection_id"],
                           **({"parentDocumentId": parent_id} if parent_id else {}))
        state["documents"][path] = {"id": doc["id"], "url_id": doc.get("urlId", doc["id"]),
                                    "last_synced_hash": content_hash(read(path)),
                                    "last_synced_revision": doc.get("revision")}
        url_map[path] = doc["id"]
        report[action + "d"].append(path)
    for path in [p for p in state["documents"] if p not in files]:
        if not dry_run:
            api.call("documents.archive", id=state["documents"][path]["id"])
            del state["documents"][path]
        report["archived"].append(path)
    if not dry_run:
        save_state(root, state)
    print(json.dumps(report, indent=2))
    return 2 if report["conflicts"] else 0


def cmd_pull(root, state):
    api = OutlineAPI(state["outline"]["url"], read_token())
    reverse = {e["id"]: p for p, e in state["documents"].items()}
    report = {"pulled": [], "new_from_outline": [], "unchanged": []}
    for path, entry in state["documents"].items():
        info = api.call("documents.info", id=entry["id"])
        if info.get("revision") == entry.get("last_synced_revision"):
            report["unchanged"].append(path); continue
        text = rewrite_links_to_local(info["text"], {e.get("url_id", e["id"]): p
                                                    for p, e in state["documents"].items()})
        os.makedirs(os.path.dirname(os.path.join(root, path)), exist_ok=True)
        open(os.path.join(root, path), "w").write(text)
        report["pulled"].append(path)
    listing = api.call("documents.list", collectionId=state["outline"]["collection_id"], limit=100)
    for doc in listing:
        if doc["id"] not in reverse:
            new_path = f'{state["docs_dir"]}/from-outline/{doc["id"]}.md'
            os.makedirs(os.path.dirname(os.path.join(root, new_path)), exist_ok=True)
            open(os.path.join(root, new_path), "w").write(f'# {doc["title"]}\n\n{doc.get("text", "")}')
            report["new_from_outline"].append(new_path)
    print(json.dumps(report, indent=2))
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("command", choices=["lint", "push", "pull"])
    ap.add_argument("--root", default=".")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    state = load_state(args.root)
    if args.command == "lint":
        sys.exit(cmd_lint(args.root, state))
    if args.command == "push":
        sys.exit(cmd_push(args.root, state, args.dry_run, args.force))
    sys.exit(cmd_pull(args.root, state))


if __name__ == "__main__":
    main()
