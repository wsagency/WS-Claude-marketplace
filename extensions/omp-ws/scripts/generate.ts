/**
 * generate.ts — builds the native omp package surface from the single source
 * of truth in plugins/ws/ (ADR 0004, full-native omp package).
 *
 * Generates:
 *   commands/  <- plugins/ws/commands/*.md      (frontmatter reduced to `description`)
 *   skills/    <- plugins/ws/skills/<name>/     (verbatim tree copy; SKILL.md must have `description`)
 *   agents/    <- plugins/ws/agents/*.md        (frontmatter transform: ensure `name`, map `model` to @role aliases)
 *   rules/     <- plugins/ws/templates/omp/rules/*.md + plugins/ws/rules/omp-edge-discipline.md (verbatim)
 *   templates/ <- plugins/ws/templates/         (runtime assets used by /ws-hub)
 *   scripts/{outline-sync.py,parse-git-log.sh,validate-changelog.sh}
 *              <- plugins/ws/scripts/           (runtime helpers used by commands/skills)
 *
 * Generated directories are wiped and rewritten; runtime helpers sharing this
 * source `scripts/` directory are overwritten by name. Never hand-edit them.
 * Run via `bun run generate` (also the first step of `bun run build`).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
 * Per-agent omp model alias — single `@role` alias strings only, NEVER
 * Claude model ids. The source agents under `plugins/ws/agents/` deliberately
 * carry NO `model:` key: that same frontmatter also feeds the Claude Code
 * plugin, which does not understand the `@role` alias syntax. `transformAgent`
 * strips any `model:` and appends the mapped alias, so the alias exists ONLY
 * in the generated omp package. A project can override a mapped agent through
 * `task.agentModelOverrides`, which outranks the generated frontmatter.
 */
export const AGENT_MODEL_MAP: Record<string, string> = {
	// @slow — deepest judgement (code review, speculative critique)
	"ws-reviewer": "@slow",

	// @plan — architecture and spec mapping (deep structure + design)
	"hub-architect": "@plan",
	"architecture-documenter": "@plan",

	// @task — skilled writing and synthesis (research, TDD, docs authoring)
	researcher: "@task",
	"tdd-runner": "@task",
	"adr-writer": "@task",
	"diataxis-writer": "@task",
	"release-notes-writer": "@task",
	"api-documenter": "@task",

	// @smol — mechanical scan and extract (pattern grep over diffs/repos)
	"changelog-analyzer": "@smol",
	"contributing-generator": "@smol",
	"public-api-watcher": "@smol",
	"arch-watcher": "@smol",

	// @tiny — pure classification (doc-state audit, no authoring)
	"docs-doctor": "@tiny",
};

/** Safety net for an UNKNOWN future agent stem, not the common path. */
export const DEFAULT_AGENT_MODEL = "@task";

export function agentModel(stem: string): string {
	const model = AGENT_MODEL_MAP[stem] ?? DEFAULT_AGENT_MODEL;
	if (!/^@[a-z-]+$/.test(model)) {
		throw new Error(`agent model for ${stem} must be an @role alias, got: ${model}`);
	}
	return model;
}

/**
 * Per-agent omp tool-name remap. The source agents under `plugins/ws/agents/`
 * carry Claude Code tool names in `tools:` — that same frontmatter also feeds
 * the Claude Code plugin, which does not understand omp tool ids. omp's tool
 * resolver (`normalizeToolName`) only lowercases plus maps `search`→`grep` and
 * `find`→`glob`, so `WebSearch`→`websearch` and `WebFetch`→`webfetch` are NOT
 * in its builtin set (the real names are `web_search` and `read`) and
 * `createTools` silently drops them — without this remap the shipped omp
 * researcher would lose all web/read capability. We rewrite these two at
 * generate time so the omp package resolves them while the Claude plugin keeps
 * its original names. Names omp already resolves (Read, Bash, Glob, Grep) are
 * left untouched — omp's own normalizer lowercases them.
 */
export const AGENT_TOOL_MAP: Record<string, string> = {
	WebSearch: "web_search",
	WebFetch: "read",
};

/**
 * Rewrite the `tools:` frontmatter key, mapping Claude-only tool names to their
 * omp equivalents (see AGENT_TOOL_MAP). Handles both the inline (`tools: A, B`)
 * and block (`tools:\n  - A`) forms; names not in the map are preserved verbatim.
 */
function rewriteAgentTools(frontmatter: string): string {
	if (Object.keys(AGENT_TOOL_MAP).length === 0) return frontmatter;
	const lines = frontmatter.split("\n");
	const toolsIdx = lines.findIndex(line => /^tools:[ \t]*.*$/.test(line));
	if (toolsIdx === -1) return frontmatter;
	const toolsLine = lines[toolsIdx];
	if (toolsLine === undefined) return frontmatter;
	const colonIdx = toolsLine.indexOf(":");
	const head = toolsLine.slice(0, colonIdx + 1);
	const value = toolsLine.slice(colonIdx + 1);
	if (value.trim().length > 0) {
		// Inline form: `tools: Read, Glob, Grep, Bash, WebSearch, WebFetch, Write`.
		lines[toolsIdx] =
			head +
			value
				.split(",")
				.map(tok => {
					const name = tok.trim();
					return tok.replace(name, AGENT_TOOL_MAP[name] ?? name);
				})
				.join(",");
	} else {
		// Block form: `tools:` followed by indented `  - name` items.
		for (let j = toolsIdx + 1; j < lines.length; j++) {
			const raw = lines[j];
			if (raw === undefined) break;
			const match = raw.match(/^([ \t]+-[ \t]+)(\w[\w-]*)/);
			const prefix = match?.[1];
			const name = match?.[2];
			if (prefix === undefined || name === undefined) break;
			lines[j] = prefix + (AGENT_TOOL_MAP[name] ?? name) + raw.slice(prefix.length + name.length);
		}
	}
	return lines.join("\n");
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

	// Remap Claude-only tool names to their omp equivalents (see AGENT_TOOL_MAP).
	frontmatter = rewriteAgentTools(frontmatter);

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

const GENERATED_DIRS = ["commands", "skills", "agents", "rules", "templates"] as const;
export const RUNTIME_SCRIPT_FILES = ["outline-sync.py", "parse-git-log.sh", "validate-changelog.sh"] as const;

export const RELEASE_MANIFEST_FILE = "release-manifest.json";
export const RELEASE_MANIFEST_VERSION = 1;

export interface ReleaseSurfaceFile {
	surface: "commands" | "skills" | "agents" | "rules";
	source: string;
	target: string;
	sourceSha256: string;
	generatedSha256: string;
}

export interface ReleaseManifest {
	schemaVersion: typeof RELEASE_MANIFEST_VERSION;
	marketplaceCommit: string;
	files: ReleaseSurfaceFile[];
}

export interface GenerateOptions {
	marketplaceCommit: string;
}

function sha256(content: Uint8Array): string {
	return createHash("sha256").update(content).digest("hex");
}

function portable(relativePath: string): string {
	return relativePath.split(path.sep).join("/");
}

function assertFullCommit(commit: string): string {
	if (!/^[0-9a-f]{40}$/.test(commit)) {
		throw new Error(`Marketplace commit must be a full lowercase Git SHA, got: ${commit || "(empty)"}`);
	}
	return commit;
}

function git(cwd: string, args: string[]): string {
	const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "no output").trim()}`);
	}
	return result.stdout.trim();
}

/**
 * Resolve the immutable source identity embedded in the native artifact.
 * Release automation supplies WS_MARKETPLACE_COMMIT after merge. Local builds
 * may omit it only when the marketplace checkout is clean, making HEAD a
 * verified description of every generated input.
 */
export function resolveMarketplaceCommit(marketplaceRoot: string, explicitCommit?: string): string {
	if (explicitCommit !== undefined && explicitCommit !== "") return assertFullCommit(explicitCommit);
	const status = git(marketplaceRoot, ["status", "--porcelain", "--untracked-files=all"]);
	if (status !== "") {
		throw new Error("WS_MARKETPLACE_COMMIT is required when the marketplace checkout has uncommitted changes.");
	}
	return assertFullCommit(git(marketplaceRoot, ["rev-parse", "--verify", "HEAD^{commit}"]));
}

async function listFilesRecursively(root: string, relative = ""): Promise<string[]> {
	const directory = path.join(root, relative);
	const entries = await fs.readdir(directory, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
		const child = path.join(relative, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listFilesRecursively(root, child)));
		} else if (entry.isFile()) {
			files.push(child);
		} else {
			throw new Error(`Generated release surface does not support non-file entry: ${path.join(root, child)}`);
		}
	}
	return files;
}

async function writeReleaseManifest(
	sourceRoot: string,
	outRoot: string,
	marketplaceCommit: string,
	mappings: Array<Pick<ReleaseSurfaceFile, "surface" | "source" | "target">>,
): Promise<ReleaseManifest> {
	const files: ReleaseSurfaceFile[] = [];
	for (const mapping of mappings.sort((left, right) => left.target < right.target ? -1 : left.target > right.target ? 1 : 0)) {
		const source = portable(mapping.source);
		const target = portable(mapping.target);
		const [sourceContent, generatedContent] = await Promise.all([
			fs.readFile(path.join(sourceRoot, source)),
			fs.readFile(path.join(outRoot, target)),
		]);
		files.push({
			...mapping,
			source,
			target,
			sourceSha256: sha256(sourceContent),
			generatedSha256: sha256(generatedContent),
		});
	}
	const manifest: ReleaseManifest = {
		schemaVersion: RELEASE_MANIFEST_VERSION,
		marketplaceCommit: assertFullCommit(marketplaceCommit),
		files,
	};
	await fs.writeFile(path.join(outRoot, RELEASE_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
	return manifest;
}

async function listMarkdown(dir: string): Promise<string[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	return entries
		.filter(entry => entry.isFile() && entry.name.endsWith(".md"))
		.map(entry => entry.name)
		.sort();
}

export async function generate(
	sourceRoot: string,
	outRoot: string,
	options: GenerateOptions,
): Promise<{ commands: number; skills: number; agents: number; rules: number; hubRules: number; runtimeScripts: number; releaseFiles: number }> {
	const sharedSurface: Array<Pick<ReleaseSurfaceFile, "surface" | "source" | "target">> = [];
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
		sharedSurface.push({ surface: "commands", source: path.join("commands", name), target: path.join("commands", name) });
	}

	// Skills ship verbatim except the repository-maintenance workflow, which is
	// intentionally available only from a source checkout.
	const skillEntries = (await fs.readdir(path.join(sourceRoot, "skills"), { withFileTypes: true }))
		.filter(entry => entry.isDirectory() && entry.name !== "ws-repo-maintenance")
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
		for (const relative of await listFilesRecursively(skillDir)) {
			sharedSurface.push({
				surface: "skills",
				source: path.join("skills", name, relative),
				target: path.join("skills", name, relative),
			});
		}
	}
	if (offenders.length > 0) {
		throw new Error(`skills rejected (omp requires a frontmatter description):\n  - ${offenders.join("\n  - ")}`);
	}

	// agents
	const agentFiles = await listMarkdown(path.join(sourceRoot, "agents"));
	for (const name of agentFiles) {
		const content = await fs.readFile(path.join(sourceRoot, "agents", name), "utf8");
		await fs.writeFile(path.join(outRoot, "agents", name), transformAgent(content, name.replace(/\.md$/, "")));
		sharedSurface.push({ surface: "agents", source: path.join("agents", name), target: path.join("agents", name) });
	}

	// rules (verbatim: TTSR templates + the always-apply edge discipline)
	const packagedPluginRules = ["omp-edge-discipline.md"];
	// Hub-only rules: packaged under templates/omp/hub-rules/ for /ws-hub to copy
	// into each hub's .omp/rules/, but kept OUT of the auto-applied rules/ dir.
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
			path.join("templates", "omp", "rules", name),
		),
		...packagedPluginRules.map(name => path.join("rules", name)),
	];
	for (const source of ruleSources) {
		const target = path.join("rules", path.basename(source));
		await fs.copyFile(path.join(sourceRoot, source), path.join(outRoot, target));
		sharedSurface.push({ surface: "rules", source, target });
	}

	// Runtime assets referenced by generated commands and skills.
	await fs.cp(path.join(sourceRoot, "templates"), path.join(outRoot, "templates"), { recursive: true });

	// Hub-only rule packaged for /ws-hub to copy into a hub's .omp/rules/ —
	// deliberately OUTSIDE the auto-discovered rules/ dir so it never applies
	// globally (it carries alwaysApply: true). templates/omp/rules/ IS globbed
	// into rules/ above, so we ship this at templates/omp/hub-rules/ instead.
	await fs.mkdir(path.join(outRoot, "templates", "omp", "hub-rules"), { recursive: true });
	for (const name of excludedPluginRules) {
		await fs.copyFile(path.join(sourceRoot, "rules", name), path.join(outRoot, "templates", "omp", "hub-rules", name));
	}
	await fs.mkdir(path.join(outRoot, "scripts"), { recursive: true });
	for (const name of RUNTIME_SCRIPT_FILES) {
		await fs.copyFile(path.join(sourceRoot, "scripts", name), path.join(outRoot, "scripts", name));
	}
	const releaseManifest = await writeReleaseManifest(sourceRoot, outRoot, options.marketplaceCommit, sharedSurface);

	return {
		commands: commandFiles.length,
		skills: skillEntries.length,
		agents: agentFiles.length,
		rules: ruleSources.length,
		hubRules: excludedPluginRules.length,
		runtimeScripts: RUNTIME_SCRIPT_FILES.length,
		releaseFiles: releaseManifest.files.length,
	};
}

async function main(): Promise<void> {
	const outRoot = path.resolve(import.meta.dir, "..");
	const marketplaceRoot = path.resolve(outRoot, "../..");
	const sourceRoot = path.join(marketplaceRoot, "plugins", "ws");
	const marketplaceCommit = resolveMarketplaceCommit(marketplaceRoot, process.env.WS_MARKETPLACE_COMMIT);
	const counts = await generate(sourceRoot, outRoot, { marketplaceCommit });
	console.log(
		`omp-ws generate: ${counts.commands} commands, ${counts.skills} skills, ${counts.agents} agents, ${counts.rules} rules, ${counts.hubRules} hub-only rules, templates, ${counts.runtimeScripts} runtime scripts, ${counts.releaseFiles} checksummed shared files at ${marketplaceCommit} (from ${sourceRoot})`,
	);
}

if (import.meta.main) {
	await main();
}
