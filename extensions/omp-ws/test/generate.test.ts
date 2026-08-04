import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
	AGENT_MODEL_MAP,
	AGENT_TOOL_MAP,
	agentModel,
	generate,
	RUNTIME_SCRIPT_FILES,
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
	test("maps agents to purpose-specific roles", () => {
		expect(agentModel("ws-reviewer")).toBe("@slow");
		expect(agentModel("hub-architect")).toBe("@plan");
		expect(agentModel("architecture-documenter")).toBe("@plan");
		expect(agentModel("researcher")).toBe("@task");
		expect(agentModel("tdd-runner")).toBe("@task");
		expect(agentModel("adr-writer")).toBe("@task");
		expect(agentModel("changelog-analyzer")).toBe("@smol");
		expect(agentModel("public-api-watcher")).toBe("@smol");
		expect(agentModel("docs-doctor")).toBe("@tiny");
		expect(agentModel("unknown-future-agent")).toBe("@task");
	});

	test("every mapped model is an @role alias, never a Claude model id", () => {
		for (const model of [...Object.values(AGENT_MODEL_MAP), agentModel("anything-else")]) {
			expect(model).toMatch(/^@[a-z-]+$/);
			expect(model).not.toMatch(/claude|sonnet|opus|haiku/i);
		}
	});
});

describe("AGENT_TOOL_MAP", () => {
	test("maps Claude agent tools to omp-resolvable ids", () => {
		expect(AGENT_TOOL_MAP).toEqual({ WebSearch: "web_search", WebFetch: "read" });
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
			"name: ws-reviewer",
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
		const result = transformAgent(source, "ws-reviewer");
		expect(result).toContain("name: ws-reviewer\n");
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

	test("remaps Claude-only tool names to their omp equivalents (inline form)", () => {
		const source = [
			"---",
			"name: researcher",
			"description: d",
			"tools: Read, Glob, Grep, Bash, WebSearch, WebFetch, Write",
			"---",
			"b",
			"",
		].join("\n");
		const result = transformAgent(source, "researcher");
		expect(result).toContain("tools: Read, Glob, Grep, Bash, web_search, read, Write");
		expect(result).not.toContain("WebSearch");
		expect(result).not.toContain("WebFetch");
	});

	test("remaps Claude-only tool names to their omp equivalents (block form)", () => {
		const source = [
			"---",
			"name: researcher",
			"description: d",
			"tools:",
			"  - Read",
			"  - WebSearch",
			"  - WebFetch",
			"  - Bash",
			"---",
			"b",
			"",
		].join("\n");
		const result = transformAgent(source, "researcher");
		expect(result).toContain("- web_search");
		expect(result).toContain("- read");
		expect(result).toContain("- Read");
		expect(result).toContain("- Bash");
		expect(result).not.toContain("- WebSearch");
		expect(result).not.toContain("- WebFetch");
	});
	test("preserves trailing text after a block-form tool item", () => {
		// Inline comments, YAML anchors, or quoted suffixes on a `  - name` item must
		// survive the tool-name remap — the contract is "kept textually verbatim".
		const source = [
			"---",
			"name: researcher",
			"description: d",
			"tools:",
			"  - Read  # inline note",
			"  - WebSearch  # search the web",
			"---",
			"b",
			"",
		].join("\n");
		const result = transformAgent(source, "researcher");
		expect(result).toContain("  - Read  # inline note");
		expect(result).toContain("  - web_search  # search the web");
		expect(result).not.toContain("WebSearch");
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

describe("generate runtime assets", () => {
	test("copies templates and only the shipped helper scripts", async () => {
		const sourceRoot = path.resolve(import.meta.dir, "../../../plugins/ws");
		const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-generate-"));

		try {
			const counts = await generate(sourceRoot, outRoot);
			expect(counts.runtimeScripts).toBe(RUNTIME_SCRIPT_FILES.length);
			expect((await fs.readdir(path.join(outRoot, "scripts"))).sort()).toEqual([...RUNTIME_SCRIPT_FILES].sort());
			expect(counts.commands).toBe(7);
			expect(counts.skills).toBe(30);
			expect(counts.agents).toBe(14);
			expect(counts.rules).toBe(4);
			for (const agentFile of await fs.readdir(path.join(outRoot, "agents"))) {
				const agentPrompt = await fs.readFile(path.join(outRoot, "agents", agentFile), "utf8");
				expect(agentPrompt).toContain("**Artifact language:**");
			}
			const readme = (await fs.readFile(path.resolve(import.meta.dir, "../README.md"), "utf8")).replace(/\s+/g, " ");
			expect(readme).toContain(`\`commands/\` (${counts.commands})`);
			expect(readme).toContain(`\`skills/\` (${counts.skills})`);
			expect(readme).toContain(`\`agents/\` (${counts.agents}`);
			expect(readme).toContain(`\`rules/\` (${counts.rules} TTSR`);
			expect(await fs.readFile(path.join(outRoot, "templates", "project.yaml.tmpl"), "utf8")).toContain(
				"__PROJECT_NAME__",
			);
			expect(await fs.readFile(path.join(outRoot, "scripts", "outline-sync.py"), "utf8")).toContain(
				"Outline",
			);
			const edgeRule = await fs.readFile(
				path.join(outRoot, "rules", "omp-edge-discipline.md"),
				"utf8",
			);
			expect(edgeRule).toContain("One owner per work unit");
			expect(edgeRule).toContain("English artifacts");
			// Hub-only openwiki-freshness rule: packaged for /ws-hub to copy into
			// a hub's .omp/rules/, but OUTSIDE the auto-discovered rules/ dir.
			expect(counts.hubRules).toBe(1);
			const hubRule = await fs.readFile(
				path.join(outRoot, "templates", "omp", "hub-rules", "openwiki-freshness.md"),
				"utf8",
			);
			expect(hubRule).toContain("alwaysApply: true");
			const packagedRules = await fs.readdir(path.join(outRoot, "rules"));
			expect(packagedRules).not.toContain("openwiki-freshness.md");
			expect(packagedRules).toContain("omp-edge-discipline.md");
		} finally {
			await fs.rm(outRoot, { recursive: true, force: true });
		}
	});
});
