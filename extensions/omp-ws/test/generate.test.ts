import { describe, expect, test } from "bun:test";
import {
	AGENT_MODEL_MAP,
	agentModel,
	extractKeyBlock,
	skillHasDescription,
	splitFrontmatter,
	transformAgent,
	transformCommand,
} from "../scripts/generate";

describe("splitFrontmatter", () => {
	test("splits fences and keeps body verbatim", () => {
		const doc = splitFrontmatter("---\na: 1\n---\nbody line\n");
		expect(doc).toEqual({ frontmatter: "a: 1\n", body: "body line\n" });
	});

	test("returns undefined without frontmatter", () => {
		expect(splitFrontmatter("# just markdown\n")).toBeUndefined();
		expect(splitFrontmatter("---\nunclosed")).toBeUndefined();
	});
});

describe("extractKeyBlock", () => {
	test("captures single-line values including quotes", () => {
		expect(extractKeyBlock('description: "a: b" rest\n', "description")).toBe('description: "a: b" rest');
	});

	test("captures indented continuation lines (nested blocks)", () => {
		const fm = "output:\n  type: object\n  required: [a]\nnext: 1\n";
		expect(extractKeyBlock(fm, "output")).toBe("output:\n  type: object\n  required: [a]");
	});

	test("does not match indented (non-top-level) keys", () => {
		const fm = "output:\n  description: nested\n";
		expect(extractKeyBlock(fm, "description")).toBeUndefined();
	});
});

describe("transformCommand", () => {
	test("keeps only description, drops allowed-tools and argument-hint, body verbatim", () => {
		const source = [
			"---",
			"allowed-tools: Bash, Read",
			'description: "Jira-aware git flow: commit"',
			'argument-hint: "[pr | clean]"',
			"---",
			"",
			"# /ws-commit",
			"",
			"- Current branch: !`git branch --show-current`",
			"$ARGUMENTS",
			"",
		].join("\n");
		const result = transformCommand(source, "ws-commit.md");
		expect(result).toBe(
			['---', 'description: "Jira-aware git flow: commit"', "---", "", "# /ws-commit", "", "- Current branch: !`git branch --show-current`", "$ARGUMENTS", ""].join(
				"\n",
			),
		);
	});

	test("fails without description", () => {
		expect(() => transformCommand("---\nallowed-tools: Bash\n---\nbody\n", "x.md")).toThrow(/no description/);
	});

	test("fails without frontmatter", () => {
		expect(() => transformCommand("# no frontmatter\n", "x.md")).toThrow(/no frontmatter/);
	});
});

describe("agentModel", () => {
	test("maps reviewer to @slow and workers to @task", () => {
		expect(agentModel("reviewer")).toBe("@slow");
		expect(agentModel("researcher")).toBe("@task");
		expect(agentModel("tdd-runner")).toBe("@task");
		expect(agentModel("hub-architect")).toBe("@task");
	});

	test("docs agents default to @task", () => {
		expect(agentModel("adr-writer")).toBe("@task");
		expect(agentModel("docs-doctor")).toBe("@task");
	});

	test("every mapped model is an @role alias, never a Claude model id", () => {
		for (const model of [...Object.values(AGENT_MODEL_MAP), agentModel("anything-else")]) {
			expect(model).toMatch(/^@[a-z-]+$/);
			expect(model).not.toMatch(/claude|sonnet|opus|haiku/i);
		}
	});
});

describe("transformAgent", () => {
	test("injects name from filename when missing and appends mapped model", () => {
		const source = ["---", "description: Creates ADRs", "tools:", "  - Bash", "  - Read", "---", "", "You write ADRs.", ""].join("\n");
		const result = transformAgent(source, "adr-writer");
		expect(result).toBe(
			[
				"---",
				"name: adr-writer",
				"description: Creates ADRs",
				"tools:",
				"  - Bash",
				"  - Read",
				'model: "@task"',
				"---",
				"",
				"You write ADRs.",
				"",
			].join("\n"),
		);
	});

	test("preserves existing name, output schema, and autoloadSkills", () => {
		const source = [
			"---",
			"name: reviewer",
			"description: Review worker",
			"tools: Read, Bash",
			"output:",
			"  type: object",
			"  required: [findings]",
			"autoloadSkills: [ws-code-review]",
			"---",
			"Body.",
			"",
		].join("\n");
		const result = transformAgent(source, "reviewer");
		expect(result).toContain("name: reviewer\n");
		expect(result).toContain("output:\n  type: object\n  required: [findings]\n");
		expect(result).toContain("autoloadSkills: [ws-code-review]\n");
		expect(result).toContain('model: "@slow"\n');
		expect(result.endsWith("---\nBody.\n")).toBe(true);
		// name not injected twice
		expect(result.match(/^name:/gm)?.length).toBe(1);
	});

	test("replaces a pre-existing model declaration instead of duplicating it", () => {
		const source = ["---", "name: researcher", "description: d", "model: claude-sonnet-4", "---", "b", ""].join("\n");
		const result = transformAgent(source, "researcher");
		expect(result.match(/^model:/gm)?.length).toBe(1);
		expect(result).toContain('model: "@task"');
		expect(result).not.toContain("claude-sonnet-4");
	});

	test("fails without description", () => {
		expect(() => transformAgent("---\nname: x\n---\nb\n", "x")).toThrow(/no description/);
	});
});

describe("skillHasDescription", () => {
	test("accepts a skill with a description", () => {
		expect(skillHasDescription("---\nname: adr\ndescription: When to write ADRs\n---\nbody\n")).toBe(true);
	});

	test("rejects missing or empty description and missing frontmatter", () => {
		expect(skillHasDescription("---\nname: adr\n---\nbody\n")).toBe(false);
		expect(skillHasDescription("---\ndescription:\nname: adr\n---\nbody\n")).toBe(false);
		expect(skillHasDescription("# no frontmatter\n")).toBe(false);
	});
});
