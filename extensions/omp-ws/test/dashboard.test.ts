import { describe, expect, test } from "bun:test";
import { parseJiraPlainRows, renderDashboardLines } from "../src/dashboard";

const PLAIN = [
	"WSC-142\tStory\tIn Progress\tHigh\tOTP screen for login",
	"WSC-138\tBug\tIn Progress\tHigh\ttoken refresh race condition",
	"WSC-150\tStory\tTo Do\tMedium\tdark mode toggle",
	"WSC-149\tTask\tTo Do\tMedium\tupgrade React Native to 0.74",
	"WSC-145\tTask\tTo Do\tLow\tAPI contract for v2 endpoints",
	"WSC-130\tStory\tIn Review\tHigh\tbiometric auth",
].join("\n");

describe("parseJiraPlainRows", () => {
	test("parses tab-separated plain output", () => {
		const issues = parseJiraPlainRows(PLAIN);
		expect(issues.length).toBe(6);
		expect(issues[0]).toEqual({ key: "WSC-142", type: "Story", status: "In Progress", priority: "High", summary: "OTP screen for login" });
	});
	test("skips blank and malformed lines", () => {
		expect(parseJiraPlainRows("\n\nnot-a-row\n")).toEqual([]);
	});
});

describe("renderDashboardLines", () => {
	test("caps the widget at header + 4 issues + overflow line", () => {
		const lines = renderDashboardLines(parseJiraPlainRows(PLAIN), "WSC", "WSC-142");
		expect(lines.length).toBe(6);
		expect(lines[0]).toBe("Jira workload — WSC: 6 open assigned issue(s)");
		expect(lines[1]).toContain("WSC-142");
		expect(lines[1]).toContain("(you're here)");
		expect(lines[5]).toContain("and 2 more");
	});
	test("no overflow line for small sets", () => {
		const issues = parseJiraPlainRows(PLAIN).slice(0, 2);
		const lines = renderDashboardLines(issues, undefined, undefined);
		expect(lines.length).toBe(3);
		expect(lines[0]).toBe("Jira workload: 2 open assigned issue(s)");
	});
});
