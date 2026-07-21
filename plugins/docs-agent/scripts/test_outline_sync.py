import importlib.util, pathlib, unittest

spec = importlib.util.spec_from_file_location(
    "outline_sync", pathlib.Path(__file__).with_name("outline-sync.py"))
osync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(osync)


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
        back = osync.rewrite_links_to_local(out, {"abc123": "docs/how-to/setup.md"})
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


if __name__ == "__main__":
    unittest.main()
