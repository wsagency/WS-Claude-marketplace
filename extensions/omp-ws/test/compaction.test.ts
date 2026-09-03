import { describe, expect, test } from "bun:test";
import { buildPreservedContext } from "../src/compaction";

describe("buildPreservedContext", () => {
	test("empty when nothing to preserve", () => {
		expect(buildPreservedContext([], false)).toEqual([]);
	});

	test("lists open tickets by name, capped at 5", () => {
		const lines = buildPreservedContext(["a.md", "b.md"], false);
		expect(lines).toEqual(["WS open tickets (dev-docs/tickets/open/): a.md, b.md"]);

		const many = buildPreservedContext(["1.md", "2.md", "3.md", "4.md", "5.md", "6.md", "7.md"], false);
		expect(many).toEqual(["WS open tickets (dev-docs/tickets/open/): 1.md, 2.md, 3.md, 4.md, 5.md (+2 more)"]);
	});

	test("flags uncommitted CHANGELOG changes", () => {
		const lines = buildPreservedContext([], true);
		expect(lines).toEqual(["WS: CHANGELOG.md has uncommitted changes — keep the pending changelog entry in mind."]);
	});

	test("names the canonical changelog path", () => {
		const lines = buildPreservedContext([], true, "changes/HISTORY.md");
		expect(lines).toEqual(["WS: changes/HISTORY.md has uncommitted changes — keep the pending changelog entry in mind."]);
	});

	test("combines both", () => {
		expect(buildPreservedContext(["t.md"], true)).toHaveLength(2);
	});
});
