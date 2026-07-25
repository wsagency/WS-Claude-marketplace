import contextlib, importlib.util, io, json, os, pathlib, tempfile, unittest

spec = importlib.util.spec_from_file_location(
    "outline_sync", pathlib.Path(__file__).with_name("outline-sync.py"))
osync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(osync)


class FakeOutline:
    """In-memory Outline API double. urlId deliberately differs from id."""

    def __init__(self):
        self.collections = {}
        self.documents = {}
        self.calls = []          # (endpoint, payload) log
        self.fail_on = None      # ("endpoint", nth-call-of-that-endpoint)
        self._counts = {}
        self._seq = 0

    def seed(self, doc_id, title, text, revision=1, collection_id=None, url_id=None):
        self.documents[doc_id] = {
            "id": doc_id, "urlId": url_id or f"url-{doc_id}", "title": title,
            "text": text, "revision": revision, "collectionId": collection_id}
        return self.documents[doc_id]

    def call(self, endpoint, **payload):
        self.calls.append((endpoint, payload))
        n = self._counts[endpoint] = self._counts.get(endpoint, 0) + 1
        if self.fail_on == (endpoint, n):
            raise RuntimeError(f"injected failure: {endpoint} call #{n}")
        return getattr(self, "_" + endpoint.replace(".", "_"))(payload)

    def _collections_create(self, p):
        self._seq += 1
        cid = f"col-{self._seq:03d}"
        self.collections[cid] = {"id": cid, "name": p["name"]}
        return dict(self.collections[cid])

    def _documents_create(self, p):
        self._seq += 1
        did = f"doc-{self._seq:03d}"
        doc = {"id": did, "urlId": f"url-{did}", "title": p["title"],
               "text": p["text"], "revision": 1,
               "collectionId": p.get("collectionId"),
               "parentDocumentId": p.get("parentDocumentId")}
        self.documents[did] = doc
        return dict(doc)

    def _documents_update(self, p):
        doc = self.documents[p["id"]]
        doc["title"] = p.get("title", doc["title"])
        doc["text"] = p.get("text", doc["text"])
        doc["revision"] += 1
        return dict(doc)

    def _documents_info(self, p):
        return dict(self.documents[p["id"]])

    def _documents_archive(self, p):
        self.documents[p["id"]]["archived"] = True
        return dict(self.documents[p["id"]])

    def _documents_list(self, p):
        docs = [dict(d) for d in self.documents.values()
                if not d.get("archived")
                and d.get("collectionId") == p.get("collectionId")]
        offset, limit = p.get("offset", 0), p.get("limit", 25)
        return docs[offset:offset + limit]


class SyncTestCase(unittest.TestCase):
    """Temp docs root + FakeOutline injected in place of OutlineAPI."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = tmp.name
        self.fake = FakeOutline()
        self._orig = {"OutlineAPI": osync.OutlineAPI, "read_token": osync.read_token}
        osync.OutlineAPI = lambda url, token: self.fake
        osync.read_token = lambda: "fake-token"
        self.addCleanup(self._unpatch)

    def _unpatch(self):
        osync.OutlineAPI = self._orig["OutlineAPI"]
        osync.read_token = self._orig["read_token"]

    def write(self, rel, text):
        path = os.path.join(self.root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(text)

    def read(self, rel):
        with open(os.path.join(self.root, rel)) as f:
            return f.read()

    def fresh_state(self, collection_id=None):
        state = osync.load_state(self.root)
        state["outline"]["collection_id"] = collection_id
        return state

    def run_push(self, state, dry_run=False, force=False, **kw):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = osync.cmd_push(self.root, state, dry_run, force, **kw)
        return rc, buf.getvalue()

    def run_pull(self, state):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = osync.cmd_pull(self.root, state)
        return rc, buf.getvalue()

    def disk_state(self):
        with open(os.path.join(self.root, osync.STATE_FILE)) as f:
            return json.load(f)


class TestLint(unittest.TestCase):
    def test_clean_outline_safe_markdown_passes(self):
        text = ("# Title\n\n:::info\nnote\n:::\n\n```mermaid\ngraph TD; A-->B\n```\n\n"
                "| a | b |\n|---|---|\n| 1 | 2 |\n\n- [ ] task\n\n$$x^2$$\n\n"
                "<!-- a comment is fine -->\nhttps://www.youtube.com/watch?v=x\n")
        self.assertEqual(osync.lint_markdown(text), [])

    def test_raw_html_rejected_but_comments_allowed(self):
        self.assertTrue(any("HTML" in v for v in osync.lint_markdown("hello <div>x</div>")))
        self.assertEqual(osync.lint_markdown("<!-- ok -->"), [])

    def test_footnote_highlight_heading_id_rejected(self):
        self.assertTrue(osync.lint_markdown("text[^1]\n\n[^1]: note"))
        self.assertTrue(osync.lint_markdown("this is ==marked=="))
        self.assertTrue(osync.lint_markdown("## Title {#custom-id}"))

    def test_commonmark_autolinks_are_not_html(self):
        text = "Visit <https://example.com/a?b=1> or write <team@example.com>.\n"
        self.assertEqual(osync.lint_markdown(text), [])


class TestMapping(unittest.TestCase):
    def test_doc_title_prefers_h1_else_filename(self):
        self.assertEqual(osync.doc_title("# My Title\nbody", "docs/x.md"), "My Title")
        self.assertEqual(osync.doc_title("no heading", "docs/how-to/setup-ci.md"), "Setup Ci")

    def test_parent_of_maps_folder_index(self):
        self.assertEqual(osync.parent_of("docs/how-to/setup.md", "docs"), "docs/how-to/index.md")
        self.assertIsNone(osync.parent_of("docs/index.md", "docs"))
        self.assertEqual(osync.parent_of("docs/how-to/index.md", "docs"), "docs/index.md")

    def test_link_rewrite_roundtrip(self):
        url_map = {"docs/how-to/setup.md": "abc123"}
        src = "See [setup](../how-to/setup.md) and [ext](https://x.y)."
        out = osync.rewrite_links_to_outline(src, "docs/tutorials/start.md", url_map)
        self.assertIn("(/doc/abc123)", out)
        self.assertIn("https://x.y", out)
        back = osync.rewrite_links_to_local(out, {"abc123": "docs/how-to/setup.md"},
                                            "docs/tutorials/start.md")
        self.assertIn("(../how-to/setup.md)", back)


class TestPlanPush(unittest.TestCase):
    def test_unchanged_skipped_new_created_changed_updated(self):
        state = {"documents": {"docs/a.md": {"id": "d1", "last_synced_hash": osync.content_hash("old")}}}
        texts = {"docs/a.md": "old", "docs/b.md": "new"}
        plan = osync.plan_push(list(texts), lambda p: texts[p], state)
        self.assertEqual(plan["docs/a.md"], "skip")
        self.assertEqual(plan["docs/b.md"], "create")
        texts["docs/a.md"] = "changed"
        self.assertEqual(osync.plan_push(list(texts), lambda p: texts[p], state)["docs/a.md"], "update")


class TestRewrite(unittest.TestCase):
    def test_fragment_preserved_through_push_rewrite(self):
        out = osync.rewrite_links_to_outline(
            "[s](../how-to/setup.md#install)", "docs/tutorials/t.md",
            {"docs/how-to/setup.md": "u-setup"})
        self.assertIn("(/doc/u-setup#install)", out)

    def test_code_regions_are_never_rewritten(self):
        url_map = {"docs/how-to/setup.md": "u-setup"}
        src = ("See [real](../how-to/setup.md).\n\n"
               "```md\n[example](../how-to/setup.md)\n```\n\n"
               "and `[inline](../how-to/setup.md)` too.\n")
        out = osync.rewrite_links_to_outline(src, "docs/tutorials/t.md", url_map)
        self.assertEqual(out.count("(/doc/u-setup)"), 1)
        self.assertEqual(out.count("../how-to/setup.md"), 2)
        back = osync.rewrite_links_to_local(
            "```\n[keep](/doc/u-setup)\n```\n[fix](/doc/u-setup)\n",
            {"u-setup": "docs/how-to/setup.md"}, "docs/tutorials/t.md")
        self.assertIn("[fix](../how-to/setup.md)", back)
        self.assertIn("[keep](/doc/u-setup)", back)


class TestCrashRecovery(SyncTestCase):
    def test_state_persisted_when_third_create_fails(self):
        for name in ("a", "b", "c"):
            self.write(f"docs/{name}.md", f"# {name.upper()}\n\nbody {name}\n")
        state = self.fresh_state("col-1")
        self.fake.fail_on = ("documents.create", 3)
        rc, out = self.run_push(state)
        self.assertNotEqual(rc, 0)
        report = json.loads(out)                  # single JSON doc even on failure
        self.assertIn("error", report)
        self.assertEqual(report["created"], ["docs/a.md", "docs/b.md"])
        saved = self.disk_state()                 # successful creates survived
        self.assertIn("docs/a.md", saved["documents"])
        self.assertIn("docs/b.md", saved["documents"])
        self.assertNotIn("docs/c.md", saved["documents"])
        entry = saved["documents"]["docs/a.md"]
        self.assertTrue(entry["id"] and entry["url_id"] and entry["last_synced_revision"])


class TestPullUpdatesState(SyncTestCase):
    def test_pull_then_push_cycle_is_conflict_free(self):
        self.write("docs/index.md", "# Home\n\nhello\n")
        self.write("docs/guide.md", "# Guide\n\nv1\n")
        state = self.fresh_state()
        rc, out = self.run_push(state)
        self.assertEqual(rc, 0)
        (col,) = self.fake.collections.values()   # default collection name
        self.assertEqual(col["name"], os.path.basename(os.path.abspath(self.root)))
        gid = state["documents"]["docs/guide.md"]["id"]
        self.fake.documents[gid]["text"] = "# Guide\n\nedited in outline\n"
        self.fake.documents[gid]["revision"] += 1
        rc, out = self.run_pull(state)
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads(out)["pulled"], ["docs/guide.md"])
        self.assertIn("edited in outline", self.read("docs/guide.md"))
        entry = self.disk_state()["documents"]["docs/guide.md"]
        self.assertEqual(entry["last_synced_revision"], self.fake.documents[gid]["revision"])
        self.assertEqual(entry["last_synced_hash"], osync.content_hash(self.read("docs/guide.md")))
        rc, out = self.run_push(state)            # nothing to do, no conflicts
        report = json.loads(out)
        self.assertEqual(rc, 0)
        self.assertEqual(report["conflicts"], [])
        self.assertEqual(report["updated"], [])
        self.assertEqual(sorted(report["skipped"]), ["docs/guide.md", "docs/index.md"])


class TestNewFromOutline(SyncTestCase):
    def test_pulled_new_doc_is_registered_and_not_duplicated(self):
        state = self.fresh_state("col-1")
        self.fake.seed("doc-900", "Server Note", "written in outline\n", collection_id="col-1")
        rc, out = self.run_pull(state)
        self.assertEqual(rc, 0)
        new_path = "docs/from-outline/doc-900.md"
        self.assertEqual(json.loads(out)["new_from_outline"], [new_path])
        entry = state["documents"][new_path]
        self.assertEqual(entry["id"], "doc-900")
        self.assertEqual(entry["url_id"], "url-doc-900")
        self.assertEqual(entry["last_synced_revision"], 1)
        self.assertEqual(entry["last_synced_hash"], osync.content_hash(self.read(new_path)))
        before = len(self.fake.calls)
        rc, out = self.run_push(state)            # must update-or-skip, never duplicate
        self.assertEqual(rc, 0)
        report = json.loads(out)
        self.assertEqual(report["created"], [])
        self.assertIn(new_path, report["skipped"])
        created = [c for c in self.fake.calls[before:] if c[0] == "documents.create"]
        self.assertEqual(created, [])
        self.assertEqual(len(self.fake.documents), 1)


class TestForceScope(SyncTestCase):
    def test_force_does_not_bypass_lint(self):
        self.write("docs/bad.md", "# Bad\n\n<div>nope</div>\n")
        state = self.fresh_state("col-1")
        rc, out = self.run_push(state, force=True)
        self.assertNotEqual(rc, 0)
        report = json.loads(out)                  # one JSON doc, lint embedded
        self.assertFalse(report["lint"]["clean"])
        self.assertIn("docs/bad.md", report["lint"]["violations"])
        self.assertEqual(self.fake.calls, [])     # nothing pushed

    def test_force_still_bypasses_revision_conflicts(self):
        self.write("docs/a.md", "# A\n\nv1\n")
        state = self.fresh_state("col-1")
        self.run_push(state)
        did = state["documents"]["docs/a.md"]["id"]
        self.fake.documents[did]["revision"] += 5   # server moved on
        self.write("docs/a.md", "# A\n\nv2 local\n")  # local changed too
        rc, out = self.run_push(state)              # without force: conflict
        self.assertEqual(rc, 2)
        self.assertEqual(json.loads(out)["conflicts"], ["docs/a.md"])
        rc, out = self.run_push(state, force=True)
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads(out)["updated"], ["docs/a.md"])
        self.assertIn("v2 local", self.fake.documents[did]["text"])


class TestForwardLinks(SyncTestCase):
    def test_second_pass_resolves_forward_links(self):
        self.write("docs/a.md", "# A\n\nSee [b](b.md)\n")
        self.write("docs/b.md", "# B\n\nBack to [a](a.md)\n")
        state = self.fresh_state("col-1")
        rc, out = self.run_push(state)
        self.assertEqual(rc, 0)
        report = json.loads(out)
        a, b = state["documents"]["docs/a.md"], state["documents"]["docs/b.md"]
        self.assertIn(f'(/doc/{b["url_id"]})', self.fake.documents[a["id"]]["text"])
        self.assertIn(f'(/doc/{a["url_id"]})', self.fake.documents[b["id"]]["text"])
        self.assertEqual(report["link_fixups"], ["docs/a.md"])
        # hash stays the LOCAL raw-text hash
        self.assertEqual(a["last_synced_hash"], osync.content_hash(self.read("docs/a.md")))
        # fixup revision recorded: an immediate re-push is a no-op
        rc, out = self.run_push(state)
        report = json.loads(out)
        self.assertEqual(rc, 0)
        self.assertEqual(report["conflicts"], [])
        self.assertEqual(report["updated"], [])


class TestUrlIdSymmetry(SyncTestCase):
    def test_push_uses_urlid_and_pull_maps_both_keys(self):
        self.write("docs/x.md", "# X\n\ntarget\n")
        self.write("docs/y.md", "# Y\n\nGo to [x](x.md)\n")
        state = self.fresh_state("col-1")
        self.run_push(state)
        x, y = state["documents"]["docs/x.md"], state["documents"]["docs/y.md"]
        self.assertNotEqual(x["url_id"], x["id"])
        self.assertIn(f'(/doc/{x["url_id"]})', self.fake.documents[y["id"]]["text"])
        self.assertNotIn(f'(/doc/{x["id"]})', self.fake.documents[y["id"]]["text"])
        # server edit links once by urlId (with fragment) and once by raw id
        self.fake.documents[y["id"]]["text"] = (
            f'# Y\n\n[a](/doc/{x["url_id"]}#install) and [b](/doc/{x["id"]})\n')
        self.fake.documents[y["id"]]["revision"] += 1
        rc, out = self.run_pull(state)
        self.assertEqual(rc, 0)
        pulled = self.read("docs/y.md")
        self.assertIn("(x.md#install)", pulled)
        self.assertIn("(x.md)", pulled)
        self.assertNotIn("/doc/", pulled)


class TestDeepPathPull(SyncTestCase):
    def test_pull_rewrites_links_relative_to_destination(self):
        state = self.fresh_state("col-1")
        state["documents"] = {
            "docs/guides/deep/page.md": {"id": "doc-p", "url_id": "url-doc-p",
                                         "last_synced_revision": 1,
                                         "last_synced_hash": "stale"},
            "docs/how-to/setup.md": {"id": "doc-s", "url_id": "url-doc-s",
                                     "last_synced_revision": 1,
                                     "last_synced_hash": "whatever"},
        }
        self.fake.seed("doc-p", "Page", "# Page\n\nSee [setup](/doc/url-doc-s)\n",
                       revision=2, collection_id="col-1")
        self.fake.seed("doc-s", "Setup", "# Setup\n\nsteps\n", revision=1,
                       collection_id="col-1")
        rc, out = self.run_pull(state)
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads(out)["pulled"], ["docs/guides/deep/page.md"])
        self.assertIn("(../../how-to/setup.md)", self.read("docs/guides/deep/page.md"))


class TestPagination(SyncTestCase):
    def test_pull_lists_beyond_first_page(self):
        state = self.fresh_state("col-1")
        for i in range(120):
            self.fake.seed(f"doc-{i:03d}", f"Doc {i}", f"body {i}\n", collection_id="col-1")
        rc, out = self.run_pull(state)
        self.assertEqual(rc, 0)
        self.assertEqual(len(json.loads(out)["new_from_outline"]), 120)
        self.assertEqual(len(state["documents"]), 120)
        list_calls = [c for c in self.fake.calls if c[0] == "documents.list"]
        self.assertEqual(len(list_calls), 2)      # 100 + short page of 20


class TestMissingDocsGuard(SyncTestCase):
    def test_push_refuses_when_docs_dir_empty_but_state_tracks_docs(self):
        state = self.fresh_state("col-1")
        state["documents"] = {"docs/a.md": {"id": "doc-a", "url_id": "url-doc-a",
                                            "last_synced_revision": 1,
                                            "last_synced_hash": "h"}}
        self.fake.seed("doc-a", "A", "body\n", collection_id="col-1")
        with self.assertRaises(SystemExit):
            with contextlib.redirect_stdout(io.StringIO()):
                osync.cmd_push(self.root, state, False, False)
        archived = [c for c in self.fake.calls if c[0] == "documents.archive"]
        self.assertEqual(archived, [])


class TestSingleJsonOutput(SyncTestCase):
    def test_dry_run_push_prints_one_json_document(self):
        self.write("docs/index.md", "# Home\n\nhi\n")
        state = self.fresh_state()
        rc, out = self.run_push(state, dry_run=True)
        self.assertEqual(rc, 0)
        report = json.loads(out)                  # raises if two JSON docs printed
        self.assertTrue(report["lint"]["clean"])
        self.assertEqual(report["created"], ["docs/index.md"])
        self.assertEqual(self.fake.calls, [])     # dry run touches nothing


class TestCollectionName(SyncTestCase):
    def test_collection_name_flag_used_and_stored(self):
        self.write("docs/index.md", "# Home\n\nhi\n")
        state = self.fresh_state()
        rc, _ = self.run_push(state, collection_name="Team Handbook")
        self.assertEqual(rc, 0)
        (col,) = self.fake.collections.values()
        self.assertEqual(col["name"], "Team Handbook")
        self.assertEqual(self.disk_state()["outline"]["collection_name"], "Team Handbook")


if __name__ == "__main__":
    unittest.main()
