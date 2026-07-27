import { describe, expect, test } from "bun:test";
import { addChangelogEntry, formatEntryLine, SECTION_ORDER, TYPE_TO_SECTION } from "../src/tools/changelog";

const BASE = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-01-01

### Added

- Initial release
`;

describe("formatEntryLine", () => {
	test("plain entry", () => {
		expect(formatEntryLine({ type: "feat", text: "Add X" })).toBe("- Add X");
	});
	test("ticket suffix", () => {
		expect(formatEntryLine({ type: "fix", text: "Repair Y", ticket: "WSC-42" })).toBe("- Repair Y (WSC-42)");
	});
	test("breaking prefix", () => {
		expect(formatEntryLine({ type: "breaking", text: "Drop Z" })).toBe("- **BREAKING:** Drop Z");
	});
});

describe("type mapping", () => {
	test("matches the WS AGENTS.md mapping", () => {
		expect(TYPE_TO_SECTION.feat).toBe("Added");
		expect(TYPE_TO_SECTION.fix).toBe("Fixed");
		expect(TYPE_TO_SECTION.perf).toBe("Changed");
		expect(TYPE_TO_SECTION.refactor).toBe("Changed");
		expect(TYPE_TO_SECTION.security).toBe("Security");
		expect(TYPE_TO_SECTION.breaking).toBe("Changed");
	});
});

describe("addChangelogEntry", () => {
	test("creates the section inside empty [Unreleased]", () => {
		const result = addChangelogEntry(BASE, { type: "feat", text: "Add ws_ticket tool" });
		const unreleased = result.split("## [1.0.0]")[0] as string;
		expect(unreleased).toContain("### Added");
		expect(unreleased).toContain("- Add ws_ticket tool");
		// Released section untouched
		expect(result).toContain("- Initial release");
	});

	test("appends to an existing section", () => {
		const once = addChangelogEntry(BASE, { type: "feat", text: "First" });
		const twice = addChangelogEntry(once, { type: "feat", text: "Second" });
		const unreleased = twice.split("## [1.0.0]")[0] as string;
		expect(unreleased.indexOf("- First")).toBeLessThan(unreleased.indexOf("- Second"));
		expect(unreleased.match(/### Added/g)?.length).toBe(1);
	});

	test("creates sections in canonical order", () => {
		let doc = addChangelogEntry(BASE, { type: "security", text: "Patch dep" });
		doc = addChangelogEntry(doc, { type: "fix", text: "Repair" });
		doc = addChangelogEntry(doc, { type: "feat", text: "Add" });
		const unreleased = doc.split("## [1.0.0]")[0] as string;
		const added = unreleased.indexOf("### Added");
		const fixed = unreleased.indexOf("### Fixed");
		const security = unreleased.indexOf("### Security");
		expect(added).toBeGreaterThan(-1);
		expect(added).toBeLessThan(fixed);
		expect(fixed).toBeLessThan(security);
	});

	test("breaking lands in Changed with prefix", () => {
		const result = addChangelogEntry(BASE, { type: "breaking", text: "Merge plugins into one" });
		const unreleased = result.split("## [1.0.0]")[0] as string;
		expect(unreleased).toContain("### Changed");
		expect(unreleased).toContain("- **BREAKING:** Merge plugins into one");
	});

	test("works when [Unreleased] is the last section (no releases yet)", () => {
		const doc = "# Changelog\n\n## [Unreleased]\n";
		const result = addChangelogEntry(doc, { type: "feat", text: "Bootstrap" });
		expect(result).toContain("### Added");
		expect(result).toContain("- Bootstrap");
	});

	test("throws without an [Unreleased] section", () => {
		expect(() => addChangelogEntry("# Changelog\n\n## [1.0.0] - 2026-01-01\n", { type: "feat", text: "X" })).toThrow(/Unreleased/);
	});

	test("canonical order constant matches Keep a Changelog", () => {
		expect(SECTION_ORDER).toEqual(["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"]);
	});
});
