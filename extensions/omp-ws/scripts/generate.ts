/**
 * generate.ts — builds the native omp package surface from the single source
 * of truth in plugins/ws/ (ADR 0004, full-native omp package).
 *
 * Generates (wipe + rewrite on every run; all four dirs are gitignored
 * build artifacts, never hand-edited):
 *   commands/  <- plugins/ws/commands/*.md      (frontmatter reduced to `description`)
 *   skills/    <- plugins/ws/skills/<name>/     (verbatim tree copy; SKILL.md must have `description`)
 *   agents/    <- plugins/ws/agents/*.md        (frontmatter transform: ensure `name`, map `model` to @role aliases)
 *   rules/     <- plugins/ws/templates/omp/rules/*.md + plugins/ws/rules/omp-edge-discipline.md (verbatim)
 *
 * Run via `bun run generate` (also the first step of `bun run build`).
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

// --- frontmatter helpers ----------------------------------------------

export interface SplitDoc {
	/** Frontmatter text between the `---` fences, without the fences. */
	frontmatter: string;
	/** Everything after the closing fence line, verbatim. */
	body: string;
}

/** Split a markdown doc into frontmatter and body. Undefined when no frontmatter. */
export function splitFrontmatter(content: string): SplitDoc | undefined {
	if (!content.startsWith("---\n")) return undefined;
	const close = content.indexOf("\n---\n", 3);
	if (close === -1) return undefined;
	return {
		frontmatter: content.slice(4, close + 1),
		body: content.slice(close + 5),
	};
}

/**
 * Extract one top-level frontmatter key as verbatim text (the key line plus
 * any indented continuation lines — covers quoted values and block scalars).
 */
export function extractKeyBlock(frontmatter: string, key: string): string | undefined {
	const pattern = new RegExp(`^${key}:[^\\n]*(?:\\n[ \\t]+[^\\n]*)*`, "m");
	return pattern.exec(frontmatter)?.[0];
}

/** True when the frontmatter declares a non-empty top-level key. */
export function hasKey(frontmatter: string, key: string): boolean {
	const block = extractKeyBlock(frontmatter, key);
	if (block === undefined) return false;
	return block.slice(key.length + 1).trim() !== "";
}

// --- commands ---------------------------------------------------------

/**
 * Command transform: body verbatim, frontmatter reduced to `description`
 * (allowed-tools / argument-hint are Claude-only — omp file commands ignore
 * unknown keys, but we keep the surface clean).
 */
export function transformCommand(content: string, fileName: string): string {
	const doc = splitFrontmatter(content);
	if (!doc) throw new Error(`${fileName}: no frontmatter`);
	const description = extractKeyBlock(doc.frontmatter, "description");
	if (description === undefined) throw new Error(`${fileName}: frontmatter has no description`);
	return `---\n${description}\n---\n${doc.body}`;
}

// --- agents -----------------------------------------------------------

/**
 * Per-agent omp model alias (single @role alias strings — never Claude model
 * ids). reviewer gets the slow reviewer-grade role; every other agent in the
 * suite (researcher, tdd-runner, hub-architect, and all docs agents) runs on
 * the task role.
 */
export const AGENT_MODEL_MAP: Record<string, string> = {
	reviewer: "@slow",
	researcher: "@task",
	"tdd-runner": "@task",
	"hub-architect": "@task",
};

export const DEFAULT_AGENT_MODEL = "@task";

export function agentModel(stem: string): string {
	const model = AGENT_MODEL_MAP[stem] ?? DEFAULT_AGENT_MODEL;
	if (!/^@[a-z-]+$/.test(model)) {
		throw new Error(`agent model for ${stem} must be an @role alias, got: ${model}`);
	}
	return model;
}

/**
 * Agent transform: body verbatim; frontmatter kept textually verbatim
 * (preserves description/tools/output/autoloadSkills and comments) except:
 *   - `name:` is injected from the filename when missing (omp requires it —
 *     parseAgentFields returns null without name+description and the agent
 *     would be silently skipped);
 *   - `model:` is replaced/appended with the mapped @role alias.
 */
export function transformAgent(content: string, stem: string): string {
	const doc = splitFrontmatter(content);
	if (!doc) throw new Error(`${stem}.md: no frontmatter`);
	let frontmatter = doc.frontmatter;

	if (!hasKey(frontmatter, "name")) {
		frontmatter = `name: ${stem}\n${frontmatter}`;
	}
	if (!hasKey(frontmatter, "description")) {
		throw new Error(`${stem}.md: frontmatter has no description (required by omp)`);
	}

	// Drop any existing model declaration, then append the mapped alias.
	frontmatter = frontmatter.replace(/^model:[^\n]*(?:\n[ \t]+[^\n]*)*\n?/m, "");
	if (!frontmatter.endsWith("\n")) frontmatter += "\n";
	frontmatter += `model: "${agentModel(stem)}"\n`;

	return `---\n${frontmatter}---\n${doc.body}`;
}

// --- skills -----------------------------------------------------------

/** omp requires a frontmatter description on plugin skills (requireDescription: true). */
export function skillHasDescription(skillMd: string): boolean {
	const doc = splitFrontmatter(skillMd);
	if (!doc) return false;
	return hasKey(doc.frontmatter, "description");
}

// --- main -------------------------------------------------------------

const GENERATED_DIRS = ["commands", "skills", "agents", "rules"] as const;

async function listMarkdown(dir: string): Promise<string[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	return entries
		.filter(entry => entry.isFile() && entry.name.endsWith(".md"))
		.map(entry => entry.name)
		.sort();
}

export async function generate(sourceRoot: string, outRoot: string): Promise<{ commands: number; skills: number; agents: number; rules: number }> {
	for (const dir of GENERATED_DIRS) {
		const target = path.join(outRoot, dir);
		await fs.rm(target, { recursive: true, force: true });
		await fs.mkdir(target, { recursive: true });
	}

	// commands
	const commandFiles = await listMarkdown(path.join(sourceRoot, "commands"));
	for (const name of commandFiles) {
		const content = await fs.readFile(path.join(sourceRoot, "commands", name), "utf8");
		await fs.writeFile(path.join(outRoot, "commands", name), transformCommand(content, name));
	}

	// skills (verbatim tree copy + description validation)
	const skillEntries = (await fs.readdir(path.join(sourceRoot, "skills"), { withFileTypes: true }))
		.filter(entry => entry.isDirectory())
		.map(entry => entry.name)
		.sort();
	const offenders: string[] = [];
	for (const name of skillEntries) {
		const skillDir = path.join(sourceRoot, "skills", name);
		let skillMd: string;
		try {
			skillMd = await fs.readFile(path.join(skillDir, "SKILL.md"), "utf8");
		} catch {
			offenders.push(`${name} (no SKILL.md)`);
			continue;
		}
		if (!skillHasDescription(skillMd)) {
			offenders.push(`${name} (SKILL.md lacks frontmatter description)`);
			continue;
		}
		await fs.cp(skillDir, path.join(outRoot, "skills", name), { recursive: true });
	}
	if (offenders.length > 0) {
		throw new Error(`skills rejected (omp requires a frontmatter description):\n  - ${offenders.join("\n  - ")}`);
	}

	// agents
	const agentFiles = await listMarkdown(path.join(sourceRoot, "agents"));
	for (const name of agentFiles) {
		const content = await fs.readFile(path.join(sourceRoot, "agents", name), "utf8");
		await fs.writeFile(path.join(outRoot, "agents", name), transformAgent(content, name.replace(/\.md$/, "")));
	}

	// rules (verbatim: TTSR templates + the always-apply edge discipline)
	const packagedPluginRules = ["omp-edge-discipline.md"];
	// Per-hub rules: /ws-hub installs these into each hub's .omp/rules/, never the package.
	const excludedPluginRules = ["openwiki-freshness.md"];
	const pluginRules = await listMarkdown(path.join(sourceRoot, "rules"));
	const unaccountedRules = pluginRules.filter(name => !packagedPluginRules.includes(name) && !excludedPluginRules.includes(name));
	if (unaccountedRules.length > 0) {
		throw new Error(
			`rules unaccounted for in generate.ts — add each to packagedPluginRules or excludedPluginRules:\n  - ${unaccountedRules.join("\n  - ")}`,
		);
	}
	const ruleSources = [
		...(await listMarkdown(path.join(sourceRoot, "templates", "omp", "rules"))).map(name =>
			path.join(sourceRoot, "templates", "omp", "rules", name),
		),
		...packagedPluginRules.map(name => path.join(sourceRoot, "rules", name)),
	];
	for (const source of ruleSources) {
		await fs.copyFile(source, path.join(outRoot, "rules", path.basename(source)));
	}

	return { commands: commandFiles.length, skills: skillEntries.length, agents: agentFiles.length, rules: ruleSources.length };
}

async function main(): Promise<void> {
	const outRoot = path.resolve(import.meta.dir, "..");
	const sourceRoot = path.resolve(outRoot, "../../plugins/ws");
	const counts = await generate(sourceRoot, outRoot);
	console.log(
		`omp-ws generate: ${counts.commands} commands, ${counts.skills} skills, ${counts.agents} agents, ${counts.rules} rules (from ${sourceRoot})`,
	);
}

if (import.meta.main) {
	await main();
}
