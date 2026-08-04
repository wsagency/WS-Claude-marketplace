import { describe, expect, test } from "bun:test";
import { renderTicket, ticketPaths } from "../src/tools/ticket";
import { slugify } from "../src/lib/slug";

describe("slugify", () => {
	test("kebab-cases titles", () => {
		expect(slugify("Add OTP screen for login")).toBe("add-otp-screen-for-login");
	});
	test("strips punctuation and diacritics", () => {
		expect(slugify("Fix: token refresh (race condition)!")).toBe("fix-token-refresh-race-condition");
		// đ has no NFKD decomposition (stroke letter, not a diacritic) — dropped.
		expect(slugify("Čćžšđ support")).toBe("cczs-support");
	});
	test("collapses repeats and trims dashes", () => {
		expect(slugify("  --weird   title--  ")).toBe("weird-title");
	});
	test("neutralizes path-traversal segments to a safe (possibly empty) slug", () => {
		expect(slugify("..")).toBe("");
		expect(slugify("../..")).toBe("");
		expect(slugify("../escape")).toBe("escape");
	});
});

describe("renderTicket", () => {
	test("matches the local-tracker template", () => {
		const text = renderTicket({
			title: "Add dark mode toggle",
			body: "User can switch theme from settings and it persists.",
			blockedBy: ["add-settings-screen"],
			criteria: ["Toggle visible in settings", "Preference persists across restarts"],
		});
		expect(text).toBe(
			[
				"# Add dark mode toggle",
				"",
				"**What to build:** User can switch theme from settings and it persists.",
				"",
				"**Blocked by:** add-settings-screen",
				"",
				"**Status:** ready-for-agent",
				"",
				"- [ ] Toggle visible in settings",
				"- [ ] Preference persists across restarts",
				"",
			].join("\n"),
		);
	});

	test("no blockers renders the canonical phrase", () => {
		const text = renderTicket({ title: "T", body: "B" });
		expect(text).toContain("**Blocked by:** None — can start immediately");
	});

	test("share line sits under the title", () => {
		const text = renderTicket({ title: "T", body: "B", share: "https://example.com/s/abc" });
		const lines = text.split("\n");
		expect(lines[0]).toBe("# T");
		expect(lines[2]).toBe("share: https://example.com/s/abc");
	});
});

describe("ticketPaths", () => {
	test("open and done live under dev-docs/tickets", () => {
		const paths = ticketPaths("/repo/dev-docs/tickets", "my-ticket");
		expect(paths.open).toBe("/repo/dev-docs/tickets/open/my-ticket.md");
		expect(paths.done).toBe("/repo/dev-docs/tickets/done/my-ticket.md");
	});
});
