import { describe, expect, test } from "bun:test";
import { formatAdr, formatAdrNumber, nextAdrNumber } from "../src/tools/adr";

describe("nextAdrNumber", () => {
	test("continues the highest existing number", () => {
		expect(nextAdrNumber(["0001-adopt-dual-track-docs.md", "0002-lockstep-marketplace-versioning.md", "0003-single-ws-plugin.md"])).toBe(4);
	});
	test("ignores non-ADR files", () => {
		expect(nextAdrNumber(["README.md", "0007-x.md", "notes.txt"])).toBe(8);
	});
	test("starts at 1 for an empty dir", () => {
		expect(nextAdrNumber([])).toBe(1);
	});
	test("handles unpadded prefixes", () => {
		expect(nextAdrNumber(["12-legacy.md"])).toBe(13);
	});
});

describe("formatAdrNumber", () => {
	test("4-digit zero-pad", () => {
		expect(formatAdrNumber(4)).toBe("0004");
		expect(formatAdrNumber(123)).toBe("0123");
	});
});

describe("formatAdr", () => {
	test("lightweight template: `# NNNN — Title` + sentences", () => {
		const text = formatAdr("0004", "Ship omp-ws as a separate package", "We ship native omp behaviors as @wsagency/omp-ws because the Claude-format marketplace cannot carry TS. Revisit if omp gains marketplace extension support.");
		expect(text.startsWith("# 0004 — Ship omp-ws as a separate package\n\n")).toBe(true);
		expect(text.endsWith("marketplace extension support.\n")).toBe(true);
	});
});
