import { describe, expect, test } from "bun:test";
import { sectionList, sectionValue } from "../src/lib/yaml-lite";

const WS_PROJECT = `jira:
  project: WSC   # bound Jira project
  board: 12
hooks:
  session_start_dashboard: false
`;

const GLOBAL = `ui:
  session_start_dashboard: "true"
account:
  email: someone@example.com
`;

describe("sectionValue", () => {
	test("reads a sectioned key with trailing comment", () => {
		expect(sectionValue(WS_PROJECT, "jira", "project")).toBe("WSC");
	});
	test("reads the hooks toggle", () => {
		expect(sectionValue(WS_PROJECT, "hooks", "session_start_dashboard")).toBe("false");
	});
	test("strips quotes", () => {
		expect(sectionValue(GLOBAL, "ui", "session_start_dashboard")).toBe("true");
	});
	test("stops at the next top-level key", () => {
		expect(sectionValue(GLOBAL, "ui", "email")).toBeUndefined();
	});
	test("undefined for missing section or key", () => {
		expect(sectionValue(WS_PROJECT, "nothere", "project")).toBeUndefined();
		expect(sectionValue(WS_PROJECT, "jira", "nothere")).toBeUndefined();
	});
});

describe("sectionList", () => {
	test("parses flow lists", () => {
		expect(sectionList("changelog:\n  skip_types: [docs, chore, test]\n", "changelog", "skip_types")).toEqual(["docs", "chore", "test"]);
	});
	test("parses quoted and space-separated forms", () => {
		expect(sectionList('changelog:\n  skip_types: ["docs", \'chore\']\n', "changelog", "skip_types")).toEqual(["docs", "chore"]);
	});
	test("undefined when absent", () => {
		expect(sectionList("changelog:\n  other: 1\n", "changelog", "skip_types")).toBeUndefined();
	});
});
