import { expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { generate } from "../scripts/generate";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const SOURCE_ROOT = path.join(REPO_ROOT, "plugins", "ws");
const RETIRED_SETUP_SKILL = ["ws", "setup", "matt", "pocock", "skills"].join("-");
const RETIRED_MATT_SETUP_ROUTE = ["/ws-matt", "setup"].join(" ");
const RETIRED_SETUP_COMMAND = ["/ws", "init"].join("-");
const TEXT_EXTENSIONS: Record<string, true> = {
	".json": true,
	".md": true,
	".mjs": true,
	".mts": true,
	".sh": true,
	".ts": true,
	".yaml": true,
	".yml": true,
};

async function names(root: string): Promise<string[]> {
	return (await fs.readdir(root)).sort();
}

async function source(file: string): Promise<string> {
	return fs.readFile(path.join(REPO_ROOT, file), "utf8");
}

async function textFiles(target: string): Promise<string[]> {
	const stat = await fs.stat(target);
	if (stat.isFile()) return TEXT_EXTENSIONS[path.extname(target)] ? [target] : [];
	const files: string[] = [];
	for (const entry of await fs.readdir(target, { withFileTypes: true })) {
		const child = path.join(target, entry.name);
		if (entry.isDirectory()) files.push(...await textFiles(child));
		else if (TEXT_EXTENSIONS[path.extname(entry.name)]) files.push(child);
	}
	return files;
}

function permitsRetiredSetupReference(relativePath: string): boolean {
	return relativePath.startsWith("plugins/ws/skills/ws-project-bootstrap/fixtures/pre-5-engineering/")
		|| relativePath === "docs/how-to/migrate-to-ws-5.md"
		|| relativePath === "docs/changelog.md";
}

test("WS 5 setup cutover is complete in source and generated output", async () => {
	const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-setup-cutover-"));
	try {
		const counts = await generate(SOURCE_ROOT, outRoot);
		expect(counts.commands).toBe(7);
		expect(counts.skills).toBe(30);

		const expectedCommands = [
			"ws-commit.md",
			"ws-docs.md",
			"ws-help.md",
			"ws-hub.md",
			"ws-matt.md",
			"ws-setup.md",
			"ws-status.md",
		];
		expect(await names(path.join(SOURCE_ROOT, "commands"))).toEqual(expectedCommands);
		expect(await names(path.join(outRoot, "commands"))).toEqual(expectedCommands);
		const setupCommand = await source("plugins/ws/commands/ws-setup.md");
		expect(setupCommand).toContain("ws-project-bootstrap");
		expect(setupCommand).toContain("ws-docs-bootstrap");

		const sourceSkills = (await fs.readdir(path.join(SOURCE_ROOT, "skills"), { withFileTypes: true }))
			.filter(entry => entry.isDirectory())
			.map(entry => entry.name)
			.sort();
		const generatedSkills = await names(path.join(outRoot, "skills"));
		expect(sourceSkills).toHaveLength(31);
		expect(generatedSkills).toHaveLength(30);
		expect(generatedSkills).toEqual(sourceSkills.filter(name => name !== "ws-repo-maintenance"));
		expect(generatedSkills).toContain("ws-project-bootstrap");
		expect(generatedSkills).toContain("ws-docs-bootstrap");
		expect(sourceSkills).toContain("ws-repo-maintenance");
		expect(sourceSkills).not.toContain(RETIRED_SETUP_SKILL);

		for (const relativePath of [
			"SKILL.md",
			"config.mjs",
			"consumer.mjs",
			"migration.mjs",
			"migration-engineering.mjs",
			"references/project-config.schema.json",
			"fixtures/pre-5-engineering/issue-tracker-local.md",
		]) {
			const sourceAsset = path.join(SOURCE_ROOT, "skills", "ws-project-bootstrap", relativePath);
			const generatedAsset = path.join(outRoot, "skills", "ws-project-bootstrap", relativePath);
			expect(await fs.readFile(generatedAsset)).toEqual(await fs.readFile(sourceAsset));
		}

		for (const relativePath of ["SKILL.md", "policy.mjs", "reconfigure.mjs", "transaction.mjs"]) {
			const sourceAsset = path.join(SOURCE_ROOT, "skills", "ws-docs-bootstrap", relativePath);
			const generatedAsset = path.join(outRoot, "skills", "ws-docs-bootstrap", relativePath);
			expect(await fs.readFile(generatedAsset)).toEqual(await fs.readFile(sourceAsset));
		}

		const packageManifest = JSON.parse(await source("extensions/omp-ws/package.json"));
		expect(packageManifest.omp.extensions).toEqual(["./dist/index.js"]);
		expect(packageManifest.omp).not.toHaveProperty("settings");

		const mattCommand = await source("plugins/ws/commands/ws-matt.md");
		const graph = await source("plugins/ws/docs/graph.md");
		const edgeRule = await source("plugins/ws/rules/omp-edge-discipline.md");
		for (const activeSurface of [mattCommand, graph, edgeRule]) {
			expect(activeSurface).not.toContain(RETIRED_SETUP_SKILL);
			expect(activeSurface).not.toContain(RETIRED_MATT_SETUP_ROUTE);
		}

		const runtimePolicy = await source("extensions/omp-ws/src/lib/project-policy.ts");
		expect(runtimePolicy).not.toContain("plugin-overrides.json");
		expect(runtimePolicy).not.toContain("LEGACY_PACKAGE_SETTING_KEYS");
		expect(await fs.stat(path.join(REPO_ROOT, "extensions/omp-ws/src/lib/plugin-paths.ts"))).toBeTruthy();
		for (const removedReader of ["settings.ts", "docs-config.ts", "yaml-lite.ts"]) {
			await expect(fs.stat(path.join(REPO_ROOT, "extensions/omp-ws/src/lib", removedReader))).rejects.toMatchObject({ code: "ENOENT" });
		}

		const scanTargets = [
			"plugins/ws",
			"extensions/omp-ws/src",
			"extensions/omp-ws/test",
			"extensions/omp-ws/package.json",
			"extensions/omp-ws/README.md",
			"README.md",
			"docs",
			"dev-docs/architecture.md",
			"dev-docs/omp-native-improvements.md",
		];
		const retiredTokens = [RETIRED_SETUP_SKILL, RETIRED_MATT_SETUP_ROUTE, RETIRED_SETUP_COMMAND];
		const offenders: string[] = [];
		for (const target of scanTargets) {
			for (const file of await textFiles(path.join(REPO_ROOT, target))) {
				const relativePath = path.relative(REPO_ROOT, file);
				if (permitsRetiredSetupReference(relativePath)) continue;
				const content = await fs.readFile(file, "utf8");
				for (const token of retiredTokens) {
					if (content.includes(token)) offenders.push(`${relativePath}: ${token}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	} finally {
		await fs.rm(outRoot, { recursive: true, force: true });
	}
});

test("WS 5 release metadata, references, and migration guide stay aligned", async () => {
	const marketplace = JSON.parse(await source(".claude-plugin/marketplace.json"));
	const plugin = JSON.parse(await source("plugins/ws/.claude-plugin/plugin.json"));
	const packageManifest = JSON.parse(await source("extensions/omp-ws/package.json"));
	expect(marketplace.plugins).toHaveLength(1);
	expect(marketplace.plugins[0].name).toBe("ws");
	expect(marketplace.plugins[0].version).toBe("5.0.0");
	expect(marketplace.plugins[0].description).toBe(plugin.description);
	expect(plugin).not.toHaveProperty("version");
	expect(packageManifest.name).toBe("@wsagency/omp-ws");
	expect(packageManifest.version).toBe("0.7.0");
	expect(packageManifest.omp.extensions).toEqual(["./dist/index.js"]);
	expect(packageManifest.files).toEqual(expect.arrayContaining(["dist", "commands", "skills", "agents", "rules", "templates"]));

	const changelog = await source("CHANGELOG.md");
	expect(await source("docs/changelog.md")).toBe(changelog);
	expect(changelog).toContain("## [5.0.0] - 2026-09-02");
	expect(changelog).toContain("Upgrade native omp installations to `@wsagency/omp-ws` 0.7.0");
	expect(changelog).toContain("sole `/ws-setup` entry point");

	const reference = await source("docs/reference/commands.md");
	expect(reference).toContain("## /ws-setup");
	expect(reference).toContain("`ws-project-bootstrap` + `ws-docs-bootstrap`");
	const migrationGuide = await source("docs/how-to/migrate-to-ws-5.md");
	expect(migrationGuide).toContain("omp plugin install @wsagency/omp-ws@0.7.0");
	expect(migrationGuide).toContain(`Do not run \`${RETIRED_SETUP_COMMAND}\` or \`${RETIRED_MATT_SETUP_ROUTE}\``);
	expect(migrationGuide).toContain("No changes required");
});
