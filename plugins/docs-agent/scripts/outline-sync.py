#!/usr/bin/env python3
"""Publish a docs/ tree to an Outline collection (docs.wsagency.io).

Subcommands: lint | push.  Stdlib only.  State: .outline-sync.json
at --root (committed).  Auth: OUTLINE_API_TOKEN env var, or the file
~/.config/ws-docs/outline-token.  One-way sync — git is authoritative:
edits made in Outline are never pulled back; push refuses files changed
on the Outline side (--force bypasses ONLY those revision conflicts,
never lint violations).

TODO(v-next): --normalize (auto-rewrite of profile violations) and
image/attachment upload from docs/assets/ are deferred.
"""
import argparse, hashlib, json, os, re, sys, urllib.error, urllib.request

DEFAULT_URL = "https://docs.wsagency.io"
STATE_FILE = ".outline-sync.json"
TOKEN_FILE = os.path.expanduser("~/.config/ws-docs/outline-token")

HTML_TAG = re.compile(r"<(?!!--)/?[a-zA-Z][^>]*>")
AUTOLINK = re.compile(  # CommonMark autolinks: <scheme://...> and <user@host>
    r"<[A-Za-z][A-Za-z0-9+.\-]*://[^<>\s]+>|<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>")
FOOTNOTE = re.compile(r"\[\^[^\]]+\]")
HIGHLIGHT = re.compile(r"==[^=\n]+==")
HEADING_ID = re.compile(r"^#{1,6} .*\{#[-\w]+\}\s*$", re.M)
FENCE_PAT = r"^ {0,3}```.*?^ {0,3}```[^\n]*$"
INLINE_CODE_PAT = r"`[^`\n]*(?:\n[^`\n]*)?`"
FENCE = re.compile("(?ms)" + FENCE_PAT)
INLINE_CODE = re.compile(INLINE_CODE_PAT)
CODE_REGION = re.compile("(?ms)" + FENCE_PAT + "|" + INLINE_CODE_PAT)


class SyncError(Exception):
    """Outline API request failed."""


def lint_markdown(text):
    """Outline-safe profile check. Returns [] when clean."""
    stripped = INLINE_CODE.sub("", FENCE.sub("", text))  # code may contain anything
    violations = []
    if HTML_TAG.search(AUTOLINK.sub("", stripped)):  # autolinks are not HTML
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


def read_tree(root, docs_dir):
    """Single snapshot of the docs tree: ordered {relpath: text}."""
    texts = {}
    for p in walk_docs(root, docs_dir):
        with open(os.path.join(root, p)) as f:
            texts[p] = f.read()
    return texts


def lint_files(texts):
    """{path: violations} for every file that fails the profile check."""
    failures = {}
    for path, text in texts.items():
        v = lint_markdown(text)
        if v:
            failures[path] = v
    return failures


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


def split_fragment(target):
    if "#" in target:
        path, frag = target.split("#", 1)
        return path, "#" + frag
    return target, ""


def sub_links_outside_code(text, repl):
    """Apply LINK.sub(repl) only outside fenced blocks and inline code."""
    out, last = [], 0
    for m in CODE_REGION.finditer(text):
        out.append(LINK.sub(repl, text[last:m.start()]))
        out.append(m.group(0))
        last = m.end()
    out.append(LINK.sub(repl, text[last:]))
    return "".join(out)


def rewrite_links_to_outline(text, path, url_map):
    """Rewrite relative .md links to /doc/<urlId>. Code regions untouched."""
    base = os.path.dirname(path)

    def repl(m):
        target, frag = split_fragment(m.group(2))
        if not target or target.startswith(("http://", "https://", "/", "mailto:")):
            return m.group(0)
        resolved = os.path.normpath(os.path.join(base, target)).replace(os.sep, "/")
        if resolved in url_map:
            return f"{m.group(1)}/doc/{url_map[resolved]}{frag}{m.group(3)}"
        return m.group(0)
    return sub_links_outside_code(text, repl)


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
            raise SyncError(f"Outline API {endpoint} failed: {e.code} {e.read().decode()[:300]}")
        except urllib.error.URLError as e:
            raise SyncError(f"Outline API {endpoint} failed: {e.reason}")


def cmd_lint(root, state):
    failures = lint_files(read_tree(root, state["docs_dir"]))
    print(json.dumps({"clean": not failures, "violations": failures}, indent=2))
    return 1 if failures else 0


def cmd_push(root, state, dry_run, force, collection_name=None):
    docs_dir = state["docs_dir"]
    texts = read_tree(root, docs_dir)  # one read per file: hash + title + render
    files = list(texts)
    if not files and state["documents"]:
        sys.exit(f"push refused: no markdown files under {docs_dir}/ in {root} "
                 f"but state tracks {len(state['documents'])} documents "
                 "(wrong --root? deleted docs dir?)")
    failures = lint_files(texts)
    report = {"lint": {"clean": not failures, "violations": failures},
              "created": [], "updated": [], "skipped": [], "conflicts": [],
              "link_fixups": [], "archived": []}
    if failures:  # never bypassed: --force only covers revision conflicts
        report["error"] = "push refused: profile violations (fix them first)"
        print(json.dumps(report, indent=2))
        return 1
    plan = plan_push(files, lambda p: texts[p], state)
    stale = [p for p in state["documents"] if p not in files]
    if dry_run:
        for path in files:
            report["skipped" if plan[path] == "skip" else plan[path] + "d"].append(path)
        report["archived"] = stale
        print(json.dumps(report, indent=2))
        return 0
    api = OutlineAPI(state["outline"]["url"], read_token())
    url_map = {p: e.get("url_id") or e["id"]
               for p, e in state["documents"].items() if "id" in e}
    sent, pushed = {}, []
    try:
        if not state["outline"]["collection_id"]:
            name = (collection_name or state["outline"].get("collection_name")
                    or os.path.basename(os.path.abspath(root)))
            state["outline"]["collection_id"] = api.call("collections.create", name=name)["id"]
            state["outline"]["collection_name"] = name
            save_state(root, state)
        for path in files:  # pass 1: create/update, building the full url map
            action = plan[path]
            if action == "skip":
                report["skipped"].append(path); continue
            raw = texts[path]
            body = rewrite_links_to_outline(raw, path, url_map)
            title = doc_title(raw, path)
            if action == "update":
                entry = state["documents"][path]
                info = api.call("documents.info", id=entry["id"])
                if info.get("revision") != entry.get("last_synced_revision") and not force:
                    report["conflicts"].append(path); continue
                doc = api.call("documents.update", id=entry["id"], title=title, text=body)
            else:
                parent = parent_of(path, docs_dir)
                parent_id = state["documents"].get(parent, {}).get("id") if parent else None
                doc = api.call("documents.create", title=title, text=body, publish=True,
                               collectionId=state["outline"]["collection_id"],
                               **({"parentDocumentId": parent_id} if parent_id else {}))
            state["documents"][path] = {"id": doc["id"],
                                        "url_id": doc.get("urlId") or doc["id"],
                                        "last_synced_hash": content_hash(raw),
                                        "last_synced_revision": doc.get("revision")}
            save_state(root, state)
            url_map[path] = doc.get("urlId") or doc["id"]
            sent[path] = body
            pushed.append(path)
            report[action + "d"].append(path)
        for path in pushed:  # pass 2: re-render with the complete url map
            final = rewrite_links_to_outline(texts[path], path, url_map)
            if final == sent[path]:
                continue
            entry = state["documents"][path]
            doc = api.call("documents.update", id=entry["id"],
                           title=doc_title(texts[path], path), text=final)
            entry["last_synced_revision"] = doc.get("revision")
            save_state(root, state)
            report["link_fixups"].append(path)
        for path in stale:
            api.call("documents.archive", id=state["documents"][path]["id"])
            del state["documents"][path]
            save_state(root, state)
            report["archived"].append(path)
    except Exception as e:  # partial push: state was saved after each mutation
        report["error"] = f"push aborted: {e}"
        print(json.dumps(report, indent=2))
        return 1
    print(json.dumps(report, indent=2))
    return 2 if report["conflicts"] else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("command", choices=["lint", "push"])
    ap.add_argument("--root", default=".")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--collection-name",
                    help="Outline collection to create on first push "
                         "(default: basename of --root)")
    args = ap.parse_args()
    state = load_state(args.root)
    try:
        if args.command == "lint":
            sys.exit(cmd_lint(args.root, state))
        sys.exit(cmd_push(args.root, state, args.dry_run, args.force,
                          collection_name=args.collection_name))
    except SyncError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
