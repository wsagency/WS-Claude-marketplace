#!/usr/bin/env node

import { access, cp, mkdir, mkdtemp, realpath, readdir, rm, stat, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PLUGIN_ID = "ws@ws-marketplace";
const NATIVE_PACKAGE = "@wsagency/omp-ws";
const RETIRED_COMMAND = `${["ws", "init"].join("-")}.md`;
const RETIRED_SKILL = ["ws", "setup", "matt", "pocock", "skills"].join("-");
const RELEASE_MANIFEST_FILE = "release-manifest.json";
const RELEASE_MANIFEST_VERSION = 1;
const GENERATED_SURFACES = Object.freeze(["commands", "skills", "agents", "rules"]);
const EXPECTED_CLAUDE_HOOK_ASSETS = Object.freeze([
	"hooks/docs-policy.mjs",
	"hooks/enforce-changelog.sh",
	"hooks/enforce-stop.sh",
	"hooks/openwiki-freshness.sh",
	"hooks/session-discipline.sh",
	"hooks/session-start-dashboard.mjs",
]);
const EXPECTED_OMP_HOOK_EVENTS = Object.freeze([
	"session.compacting",
	"session_start",
	"session_start",
	"session_stop",
	"session_stop",
	"tool_call",
	"tool_call",
]);
const EXPECTED_OMP_RULES = Object.freeze([
	"omp-edge-discipline.md",
	"ws-commit-format.md",
	"ws-generated-files.md",
	"ws-guard-git.md",
]);
const EXPECTED_OMP_TOOLS = Object.freeze(["ws_adr", "ws_changelog", "ws_ticket"]);

export const REQUIRED_INSTALLED_ASSETS = Object.freeze([
	"commands/ws-setup.md",
	"skills/ws-project-bootstrap/SKILL.md",
	"skills/ws-docs-bootstrap/SKILL.md",
	"skills/ws-project-bootstrap/references/project-config.schema.json",
	"skills/ws-project-bootstrap/manifest-contract.mjs",
	"skills/ws-project-bootstrap/manifest-contract.d.mts",
	"skills/ws-project-bootstrap/transaction.mjs",
	"skills/ws-project-bootstrap/fixtures/released-repositories/ws-init-only/expected/outcome.json",
]);

export const REMOVED_INSTALLED_ASSETS = Object.freeze([
	path.join("commands", RETIRED_COMMAND),
	path.join("skills", RETIRED_SKILL),
	path.join("agents", "ws-init.md"),
]);

function isolatedEnvironment(home, extra = {}) {
	const allowed = ["PATH", "SHELL", "TMPDIR", "LANG", "LC_ALL", "TERM"];
	const env = Object.fromEntries(allowed.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
	return {
		...env,
		HOME: home,
		NO_COLOR: "1",
		CI: "1",
		...extra,
	};
}

export function verificationPaths(tempRoot) {
	const claudeHome = path.join(tempRoot, "claude-home");
	const claudeConfig = path.join(tempRoot, "claude-config");
	const ompHome = path.join(tempRoot, "omp-home");
	const ompXdgConfig = path.join(tempRoot, "omp-xdg-config");
	const ompXdgData = path.join(tempRoot, "omp-xdg-data");
	const npmPrefix = path.join(tempRoot, "omp-package");
	const workspace = path.join(tempRoot, "workspace");
	return {
		tempRoot,
		claudeHome,
		claudeConfig,
		ompHome,
		ompXdgConfig,
		ompXdgData,
		npmPrefix,
		workspace,
		nativeRoot: path.join(npmPrefix, "node_modules", "@wsagency", "omp-ws"),
	};
}

export function buildVerificationSteps({ marketplaceRoot, tarballPath, paths }) {
	const claudeEnv = isolatedEnvironment(paths.claudeHome, { CLAUDE_CONFIG_DIR: paths.claudeConfig });
	const ompEnv = isolatedEnvironment(paths.ompHome, {
		XDG_CONFIG_HOME: paths.ompXdgConfig,
		XDG_DATA_HOME: paths.ompXdgData,
		OMP_PROFILE: "release-verification",
	});
	return [
		{ label: "claude-marketplace-add", command: "claude", args: ["plugin", "marketplace", "add", marketplaceRoot], cwd: paths.workspace, env: claudeEnv },
		{ label: "claude-plugin-install", command: "claude", args: ["plugin", "install", PLUGIN_ID, "--scope", "user"], cwd: paths.workspace, env: claudeEnv },
		{ label: "claude-plugin-details", command: "claude", args: ["plugin", "details", PLUGIN_ID], cwd: paths.workspace, env: claudeEnv },
		{ label: "npm-tarball-install", command: "npm", args: ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", paths.npmPrefix, tarballPath], cwd: paths.workspace, env: ompEnv },
		{ label: "omp-plugin-link", command: "omp", args: ["plugin", "link", paths.nativeRoot, "--scope", "user"], cwd: paths.workspace, env: ompEnv },
		{ label: "omp-plugin-list", command: "omp", args: ["plugin", "list", "--json"], cwd: paths.workspace, env: ompEnv },
		{ label: "omp-plugin-doctor", command: "omp", args: ["plugin", "doctor", "--json"], cwd: paths.workspace, env: ompEnv },
	];
}

export async function assertInstalledSurface(pluginRoot) {
	const resolved = await realpath(pluginRoot);
	for (const relative of REQUIRED_INSTALLED_ASSETS) {
		const target = path.join(resolved, relative);
		const info = await stat(target).catch(() => null);
		if (!info?.isFile()) throw new Error(`Installed artifact is missing required file: ${relative}`);
	}
	for (const relative of REMOVED_INSTALLED_ASSETS) {
		try {
			await access(path.join(resolved, relative));
			throw new Error(`Installed artifact still exposes removed surface: ${relative}`);
		} catch (error) {
			if (error?.code !== "ENOENT") throw error;
		}
	}
	return { root: resolved, required: [...REQUIRED_INSTALLED_ASSETS], removed: [...REMOVED_INSTALLED_ASSETS] };
}

function defaultRunCommand(step) {
	const result = spawnSync(step.command, step.args, {
		cwd: step.cwd,
		env: step.env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`${step.label} failed (${result.status}): ${(result.stderr || result.stdout || "no output").trim()}`);
	}
	return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

async function initializeFixtureRepository(root, env, runCommand) {
	for (const [label, args] of [
		["git-init", ["init", "--quiet"]],
		["git-user-name", ["config", "user.name", "WS Release Verifier"]],
		["git-user-email", ["config", "user.email", "release-verifier@example.invalid"]],
		["git-add", ["add", "."]],
		["git-commit", ["commit", "--quiet", "--allow-empty", "-m", "test: installed migration fixture"]],
	]) {
		await runCommand({ label, command: "git", args, cwd: root, env });
	}
}

export async function exerciseInstalledTransaction(pluginRoot, workspaceRoot, label, runCommand, env) {
	const skillRoot = path.join(pluginRoot, "skills", "ws-project-bootstrap");
	const fixtureRepository = path.join(skillRoot, "fixtures", "released-repositories", "ws-init-only", "repository");
	const root = path.join(workspaceRoot, `migration-${label}`);
	await cp(fixtureRepository, root, { recursive: true });
	await initializeFixtureRepository(root, env, runCommand);

	const nonce = `${Date.now()}-${label}`;
	const [{ runManifestTransaction }, { discoverLegacySetup }, { discoverStandaloneRepository }] = await Promise.all([
		import(`${pathToFileURL(path.join(skillRoot, "manifest-contract.mjs")).href}?verify=${nonce}`),
		import(`${pathToFileURL(path.join(skillRoot, "migration.mjs")).href}?verify=${nonce}`),
		import(`${pathToFileURL(path.join(skillRoot, "transaction.mjs")).href}?verify=${nonce}`),
	]);
	const machine = { activeHarness: "omp", sessionDiscipline: true, dangerousGitGuard: true, jiraCli: true };
	const request = {
		mode: "migration",
		root,
		snapshot: {
			legacy: await discoverLegacySetup(root, machine),
			core: await discoverStandaloneRepository(root, machine),
		},
		choices: { core: { jiraValidation: { ready: true }, docsReadiness: { ready: true } } },
		adapters: { verifyMigrationReadiness: async () => ({ jiraReady: true, docsReady: true }) },
	};
	const planned = await runManifestTransaction(request);
	if (!planned.requiresAuthorization || planned.operations.length !== 0) throw new Error(`${label} installed migration did not stop at authorization.`);
	const applied = await runManifestTransaction({ ...request, authorization: planned.manifest.hash });
	if (!applied.applied || applied.readiness?.configValid !== true) throw new Error(`${label} installed migration did not verify readiness.`);

	const alignedRequest = {
		...request,
		snapshot: {
			legacy: await discoverLegacySetup(root, machine),
			core: await discoverStandaloneRepository(root, machine),
		},
	};
	const aligned = await runManifestTransaction(alignedRequest);
	if (aligned.requiresAuthorization || !/No migration changes required|Valid canonical configuration wins/.test(aligned.report)) {
		throw new Error(`${label} installed aligned rerun was not a prompt-free no-op.`);
	}
	return { label, plannedItems: planned.manifest.items.length, operations: applied.operations.length, aligned: true };
}

async function resolveClaudePluginInstallation(claudeConfig) {
	const registryPath = path.join(claudeConfig, "plugins", "installed_plugins.json");
	const registry = JSON.parse(await readFile(registryPath, "utf8"));
	const entries = registry?.plugins?.[PLUGIN_ID];
	const entry = Array.isArray(entries) ? entries.find(candidate => candidate?.enabled !== false && candidate?.installPath) : null;
	if (!entry) throw new Error(`Claude registry does not contain an enabled ${PLUGIN_ID} installation.`);
	return {
		root: await realpath(entry.installPath),
		version: entry.version,
		gitCommitSha: entry.gitCommitSha,
	};
}

function sha256(content) {
	return createHash("sha256").update(content).digest("hex");
}

function containedPath(root, relative, label) {
	if (
		typeof relative !== "string"
		|| relative === ""
		|| relative.includes("\\")
		|| path.isAbsolute(relative)
		|| relative.split("/").some(segment => segment === "" || segment === "." || segment === "..")
	) {
		throw new Error(`${label} contains an unsafe path: ${String(relative)}`);
	}
	return path.join(root, ...relative.split("/"));
}

async function listSurfaceFiles(root, relative = "") {
	const entries = await readdir(path.join(root, relative), { withFileTypes: true });
	const files = [];
	for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
		const child = path.join(relative, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listSurfaceFiles(root, child)));
		} else if (entry.isFile()) {
			files.push(child.split(path.sep).join("/"));
		} else {
			throw new Error(`Installed release surface contains an unsupported entry: ${child}`);
		}
	}
	return files;
}

function parseReleaseManifest(content) {
	let manifest;
	try {
		manifest = JSON.parse(content);
	} catch {
		throw new Error(`Native package ${RELEASE_MANIFEST_FILE} is not valid JSON.`);
	}
	if (manifest?.schemaVersion !== RELEASE_MANIFEST_VERSION || !Array.isArray(manifest.files)) {
		throw new Error(`Native package ${RELEASE_MANIFEST_FILE} has an unsupported shape.`);
	}
	if (!/^[0-9a-f]{40}$/.test(manifest.marketplaceCommit ?? "")) {
		throw new Error(`Native package ${RELEASE_MANIFEST_FILE} does not contain a full marketplace commit.`);
	}
	return manifest;
}

export async function verifySharedGeneratedSurface(claudeRoot, nativeRoot, expectedMarketplaceCommit) {
	const [resolvedClaudeRoot, resolvedNativeRoot] = await Promise.all([realpath(claudeRoot), realpath(nativeRoot)]);
	const manifestContent = await readFile(path.join(resolvedNativeRoot, RELEASE_MANIFEST_FILE), "utf8").catch(error => {
		if (error?.code === "ENOENT") throw new Error(`Native package is missing ${RELEASE_MANIFEST_FILE}.`);
		throw error;
	});
	const manifest = parseReleaseManifest(manifestContent);
	if (manifest.marketplaceCommit !== expectedMarketplaceCommit) {
		throw new Error(
			`Native artifact marketplace commit mismatch. Expected ${expectedMarketplaceCommit}, got ${manifest.marketplaceCommit}`,
		);
	}

	const targetFiles = [];
	for (const surface of GENERATED_SURFACES) {
		for (const relative of await listSurfaceFiles(path.join(resolvedNativeRoot, surface))) {
			targetFiles.push(`${surface}/${relative}`);
		}
	}
	const seenTargets = new Set();
	const bySurface = Object.fromEntries(GENERATED_SURFACES.map(surface => [surface, 0]));
	for (const entry of manifest.files) {
		if (
			!GENERATED_SURFACES.includes(entry?.surface)
			|| typeof entry.source !== "string"
			|| typeof entry.target !== "string"
			|| !/^[0-9a-f]{64}$/.test(entry.sourceSha256 ?? "")
			|| !/^[0-9a-f]{64}$/.test(entry.generatedSha256 ?? "")
		) {
			throw new Error(`Native package ${RELEASE_MANIFEST_FILE} contains an invalid file entry.`);
		}
		if (!entry.target.startsWith(`${entry.surface}/`)) {
			throw new Error(`Native package ${RELEASE_MANIFEST_FILE} maps ${entry.target} to the wrong surface.`);
		}
		const validSource = entry.source.startsWith(`${entry.surface}/`)
			|| (entry.surface === "rules" && entry.source.startsWith("templates/omp/rules/"));
		if (!validSource) {
			throw new Error(`Native package ${RELEASE_MANIFEST_FILE} maps ${entry.source} from the wrong surface.`);
		}
		if (seenTargets.has(entry.target)) {
			throw new Error(`Native package ${RELEASE_MANIFEST_FILE} contains duplicate target: ${entry.target}`);
		}
		seenTargets.add(entry.target);
		bySurface[entry.surface] += 1;

		const sourcePath = containedPath(resolvedClaudeRoot, entry.source, RELEASE_MANIFEST_FILE);
		const targetPath = containedPath(resolvedNativeRoot, entry.target, RELEASE_MANIFEST_FILE);
		const [sourceContent, targetContent] = await Promise.all([
			readFile(sourcePath).catch(error => {
				if (error?.code === "ENOENT") throw new Error(`Claude installation is missing shared source asset: ${entry.source}`);
				throw error;
			}),
			readFile(targetPath).catch(error => {
				if (error?.code === "ENOENT") throw new Error(`Native installation is missing generated asset: ${entry.target}`);
				throw error;
			}),
		]);
		const sourceDigest = sha256(sourceContent);
		if (sourceDigest !== entry.sourceSha256) {
			throw new Error(`Claude/native parity drift for ${entry.source}: expected ${entry.sourceSha256}, got ${sourceDigest}`);
		}
		const targetDigest = sha256(targetContent);
		if (targetDigest !== entry.generatedSha256) {
			throw new Error(`Installed native asset checksum mismatch for ${entry.target}: expected ${entry.generatedSha256}, got ${targetDigest}`);
		}
	}

	const expectedTargets = [...seenTargets].sort();
	targetFiles.sort();
	if (JSON.stringify(targetFiles) !== JSON.stringify(expectedTargets)) {
		const missing = targetFiles.filter(target => !seenTargets.has(target));
		const absent = expectedTargets.filter(target => !targetFiles.includes(target));
		throw new Error(
			`Native generated surface does not match ${RELEASE_MANIFEST_FILE}; unmanifested: ${missing.join(", ") || "none"}; missing: ${absent.join(", ") || "none"}`,
		);
	}
	return {
		manifest: RELEASE_MANIFEST_FILE,
		manifestSha256: sha256(Buffer.from(manifestContent)),
		marketplaceCommit: manifest.marketplaceCommit,
		files: manifest.files.length,
		bySurface,
	};
}

function assertExactMembers(actual, expected, label) {
	const normalized = [...actual].sort();
	const required = [...expected].sort();
	if (JSON.stringify(normalized) !== JSON.stringify(required)) {
		throw new Error(`${label} mismatch. Expected ${required.join(", ")}, got ${normalized.join(", ") || "none"}`);
	}
	return normalized;
}

export async function probeClaudeRuntime(pluginRoot) {
	const root = await realpath(pluginRoot);
	const [pluginContent, hooksContent] = await Promise.all([
		readFile(path.join(root, ".claude-plugin", "plugin.json"), "utf8"),
		readFile(path.join(root, "hooks", "hooks.json"), "utf8"),
	]);
	const plugin = JSON.parse(pluginContent);
	const hooks = JSON.parse(hooksContent);
	if (plugin?.name !== "ws" || !hooks?.hooks || typeof hooks.hooks !== "object") {
		throw new Error("Claude installation is missing the ws plugin runtime manifest.");
	}
	const registrations = [];
	for (const [event, groups] of Object.entries(hooks.hooks)) {
		if (!Array.isArray(groups)) throw new Error(`Claude hook event ${event} has an unexpected shape.`);
		for (const group of groups) {
			if (!Array.isArray(group?.hooks)) throw new Error(`Claude hook event ${event} has an unexpected registration.`);
			for (const hook of group.hooks) {
				const match = /^\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s]+)$/.exec(hook?.command ?? "");
				if (hook?.type !== "command" || !match) throw new Error(`Claude hook event ${event} has an unsupported command.`);
				registrations.push({ event, matcher: group.matcher ?? "", asset: match[1] });
			}
		}
	}
	const registeredAssets = registrations.map(registration => registration.asset);
	for (const expected of EXPECTED_CLAUDE_HOOK_ASSETS) {
		if (expected === "hooks/docs-policy.mjs") continue;
		if (!registeredAssets.includes(expected)) throw new Error(`Claude runtime delivery is missing hook registration: ${expected}`);
	}
	const assets = [];
	for (const relative of EXPECTED_CLAUDE_HOOK_ASSETS) {
		const content = await readFile(containedPath(root, relative, "Claude runtime")).catch(error => {
			if (error?.code === "ENOENT") throw new Error(`Claude runtime delivery is missing asset: ${relative}`);
			throw error;
		});
		assets.push({ path: relative, sha256: sha256(content) });
	}
	return {
		plugin: plugin.name,
		hookManifestSha256: sha256(Buffer.from(hooksContent)),
		registrations,
		assets,
	};
}

function runtimeProbeZod() {
	const schema = {
		describe() { return schema; },
		optional() { return schema; },
	};
	return {
		array() { return schema; },
		enum() { return schema; },
		object() { return schema; },
		string() { return schema; },
	};
}

export async function probeOmpRuntime(pluginRoot) {
	const root = await realpath(pluginRoot);
	const extensionPath = path.join(root, "dist", "index.js");
	const extensionContent = await readFile(extensionPath).catch(error => {
		if (error?.code === "ENOENT") throw new Error("omp runtime delivery is missing dist/index.js.");
		throw error;
	});
	const module = await import(`${pathToFileURL(extensionPath).href}?release-probe=${Date.now()}`);
	if (typeof module.default !== "function") throw new Error("omp runtime delivery has no extension entry point.");
	const hookEvents = [];
	const tools = [];
	module.default({
		zod: runtimeProbeZod(),
		on(event, handler) {
			if (typeof handler !== "function") throw new Error(`omp runtime registered a non-function handler for ${event}.`);
			hookEvents.push(event);
		},
		registerTool(tool) {
			if (typeof tool?.name !== "string" || typeof tool?.execute !== "function") {
				throw new Error("omp runtime registered an invalid tool.");
			}
			tools.push(tool.name);
		},
	});
	const rules = (await readdir(path.join(root, "rules"), { withFileTypes: true }))
		.filter(entry => entry.isFile() && entry.name.endsWith(".md"))
		.map(entry => entry.name);
	return {
		extension: "dist/index.js",
		extensionSha256: sha256(extensionContent),
		hookEvents: assertExactMembers(hookEvents, EXPECTED_OMP_HOOK_EVENTS, "omp runtime hook delivery"),
		tools: assertExactMembers(tools, EXPECTED_OMP_TOOLS, "omp runtime tool delivery"),
		rules: assertExactMembers(rules, EXPECTED_OMP_RULES, "omp runtime rule delivery"),
	};
}

async function validateInputs(options) {
	const root = await realpath(path.resolve(options.marketplaceRoot));
	const tarball = await realpath(path.resolve(options.tarballPath));
	const marketplacePath = path.join(root, ".claude-plugin", "marketplace.json");
	const marketplaceFile = await stat(marketplacePath).catch(() => null);
	const archive = await stat(tarball).catch(() => null);
	if (!marketplaceFile?.isFile()) throw new Error("Marketplace root does not contain .claude-plugin/marketplace.json.");
	if (!archive?.isFile() || path.extname(tarball) !== ".tgz") throw new Error("Retained native package must be an existing .tgz file.");

	const marketplace = JSON.parse(await readFile(marketplacePath, "utf8"));
	const plugin = marketplace?.plugins?.find(candidate => candidate?.name === "ws");
	if (!plugin) throw new Error("Marketplace manifest does not contain the ws plugin.");
	if (plugin.version !== options.expectedMarketplaceVersion) {
		throw new Error(`Marketplace manifest version mismatch. Expected ${options.expectedMarketplaceVersion}, got ${plugin.version}`);
	}
	return {
		marketplaceRoot: root,
		tarballPath: tarball,
		marketplaceVersion: plugin.version,
		tarballSize: archive.size,
	};
}

function assertCommandResult(step, result) {
	if (result?.status !== 0) {
		throw new Error(`${step.label} failed (${result?.status ?? "no status"}): ${(result?.stderr || result?.stdout || "no output").trim()}`);
	}
	return result;
}

export async function verifyReleaseArtifacts(options, dependencies = {}) {
	const requiredOptions = [
		"marketplaceRoot",
		"tarballPath",
		"expectedMarketplaceVersion",
		"expectedPackageName",
		"expectedPackageVersion",
		"expectedMarketplaceCommit",
		"expectedTarballSha256",
	];
	for (const name of requiredOptions) {
		if (!options?.[name]) throw new Error(`Explicit ${name} is required.`);
	}
	if (!/^[0-9a-f]{40}$/.test(options.expectedMarketplaceCommit)) {
		throw new Error("Explicit expectedMarketplaceCommit must be a full lowercase Git SHA.");
	}
	const inputs = await validateInputs(options);
	const runCommand = dependencies.runCommand ?? defaultRunCommand;
	const identityEnv = isolatedEnvironment(inputs.marketplaceRoot);

	const gitStatusStep = {
		label: "git-status",
		command: "git",
		args: ["status", "--porcelain", "--untracked-files=all"],
		cwd: inputs.marketplaceRoot,
		env: identityEnv,
	};
	const gitStatus = assertCommandResult(gitStatusStep, await runCommand(gitStatusStep));
	if (gitStatus.stdout.trim() !== "") throw new Error("Marketplace repository has uncommitted changes.");

	const gitCommitStep = {
		label: "git-commit",
		command: "git",
		args: ["rev-parse", "HEAD"],
		cwd: inputs.marketplaceRoot,
		env: identityEnv,
	};
	const gitCommit = assertCommandResult(gitCommitStep, await runCommand(gitCommitStep));
	const actualCommit = gitCommit.stdout.trim();
	if (actualCommit !== options.expectedMarketplaceCommit) {
		throw new Error(`Marketplace commit mismatch. Expected ${options.expectedMarketplaceCommit}, got ${actualCommit}`);
	}

	const tarballData = await readFile(inputs.tarballPath);
	const tarballSha256 = sha256(tarballData);
	if (tarballSha256 !== options.expectedTarballSha256) {
		throw new Error(`Tarball SHA256 mismatch. Expected ${options.expectedTarballSha256}, got ${tarballSha256}`);
	}

	const tempRoot = await mkdtemp(path.join(tmpdir(), "ws-release-artifacts-"));
	const paths = verificationPaths(tempRoot);
	const inspectSurface = dependencies.inspectSurface ?? assertInstalledSurface;
	const verifyParity = dependencies.verifySharedGeneratedSurface ?? verifySharedGeneratedSurface;
	const inspectClaudeRuntime = dependencies.probeClaudeRuntime ?? probeClaudeRuntime;
	const inspectOmpRuntime = dependencies.probeOmpRuntime ?? probeOmpRuntime;
	const exerciseTransaction = dependencies.exerciseTransaction ?? exerciseInstalledTransaction;
	try {
		for (const target of [paths.claudeHome, paths.claudeConfig, paths.ompHome, paths.ompXdgConfig, paths.ompXdgData, paths.npmPrefix, paths.workspace]) {
			await mkdir(target, { recursive: true });
		}
		const steps = buildVerificationSteps({ ...inputs, paths });
		const commandResults = [];
		for (const step of steps) {
			const result = assertCommandResult(step, await runCommand(step));
			commandResults.push({ label: step.label, ...result });
		}

		const claudeDetails = commandResults.find(result => result.label === "claude-plugin-details")?.stdout ?? "";
		if (!claudeDetails.includes("Component inventory") || !/(^|\n)ws(\n|$)/.test(claudeDetails)) {
			throw new Error("Claude plugin details did not identify the installed ws plugin.");
		}

		const claudeInstallation = await (
			dependencies.resolveClaudePluginInstallation ?? resolveClaudePluginInstallation
		)(paths.claudeConfig);
		if (claudeInstallation.version !== options.expectedMarketplaceVersion) {
			throw new Error(`Claude marketplace version mismatch. Expected ${options.expectedMarketplaceVersion}, got ${claudeInstallation.version}`);
		}
		if (claudeInstallation.gitCommitSha !== options.expectedMarketplaceCommit) {
			throw new Error(`Claude marketplace commit mismatch. Expected ${options.expectedMarketplaceCommit}, got ${claudeInstallation.gitCommitSha}`);
		}

		const ompListResult = commandResults.find(result => result.label === "omp-plugin-list");
		let ompList;
		try {
			ompList = JSON.parse(ompListResult.stdout);
		} catch {
			throw new Error("Failed to parse omp plugin list JSON.");
		}
		const ompNpmPlugin = ompList.npm?.find(plugin => plugin.name === options.expectedPackageName);
		if (!ompNpmPlugin) throw new Error("omp plugin list is missing the expected npm package.");
		if (ompNpmPlugin.version !== options.expectedPackageVersion) {
			throw new Error(`omp package version mismatch. Expected ${options.expectedPackageVersion}, got ${ompNpmPlugin.version}`);
		}

		const ompDoctorResult = commandResults.find(result => result.label === "omp-plugin-doctor");
		let ompDoctor;
		try {
			ompDoctor = JSON.parse(ompDoctorResult.stdout);
		} catch {
			throw new Error("Failed to parse omp plugin doctor JSON.");
		}
		if (!Array.isArray(ompDoctor)) throw new Error("omp plugin doctor returned an unexpected JSON shape.");
		const unhealthy = ompDoctor.filter(item => item.status !== "ok"
			&& !(item.name === "package_manifest" && item.status === "warning" && item.message === "Not created yet"));
		if (unhealthy.length > 0) {
			throw new Error(`omp plugin doctor reports unhealthy status: ${unhealthy.map(item => item.name).join(", ")}`);
		}

		const [claudeSurface, ompSurface] = await Promise.all([
			inspectSurface(claudeInstallation.root),
			inspectSurface(paths.nativeRoot),
		]);
		const nativePackageJson = JSON.parse(await readFile(path.join(ompSurface.root, "package.json"), "utf8"));
		if (nativePackageJson.name !== options.expectedPackageName) {
			throw new Error(`Native package name mismatch. Expected ${options.expectedPackageName}, got ${nativePackageJson.name}`);
		}
		if (nativePackageJson.version !== options.expectedPackageVersion) {
			throw new Error(`Native package version mismatch. Expected ${options.expectedPackageVersion}, got ${nativePackageJson.version}`);
		}
		const ompEnv = steps.find(step => step.label === "omp-plugin-list").env;
		const [parity, claudeRuntime, ompRuntime, claudeMigration, ompMigration] = await Promise.all([
			verifyParity(claudeSurface.root, ompSurface.root, options.expectedMarketplaceCommit),
			inspectClaudeRuntime(claudeSurface.root),
			inspectOmpRuntime(ompSurface.root),
			exerciseTransaction(claudeInstallation.root, paths.workspace, "claude", runCommand, ompEnv),
			exerciseTransaction(paths.nativeRoot, paths.workspace, "omp", runCommand, ompEnv),
		]);
		return {
			identities: {
				marketplaceVersion: inputs.marketplaceVersion,
				packageName: nativePackageJson.name,
				packageVersion: nativePackageJson.version,
				marketplaceCommit: actualCommit,
				tarballSha256,
				tarballSize: inputs.tarballSize,
			},
			commands: commandResults.map(result => result.label),
			parity,
			claude: { root: claudeSurface.root, runtime: claudeRuntime, migration: claudeMigration },
			omp: {
				root: ompSurface.root,
				runtime: {
					...ompRuntime,
					linkedPlugin: ompNpmPlugin,
					doctor: ompDoctor,
				},
				migration: ompMigration,
			},
		};
	} finally {
		await rm(tempRoot, { recursive: true, force: true });
	}
}

function option(name) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
	const marketplaceRoot = option("--marketplace-root");
	const tarballPath = option("--tarball");
	const expectedMarketplaceVersion = option("--expected-marketplace-version");
	const expectedPackageName = option("--expected-package-name");
	const expectedPackageVersion = option("--expected-package-version");
	const expectedMarketplaceCommit = option("--expected-marketplace-commit");
	const expectedTarballSha256 = option("--expected-tarball-sha256");

	const allowed = new Set([
		"--marketplace-root", marketplaceRoot,
		"--tarball", tarballPath,
		"--expected-marketplace-version", expectedMarketplaceVersion,
		"--expected-package-name", expectedPackageName,
		"--expected-package-version", expectedPackageVersion,
		"--expected-marketplace-commit", expectedMarketplaceCommit,
		"--expected-tarball-sha256", expectedTarballSha256
	]);
	const unexpected = process.argv.slice(2).filter(argument => !allowed.has(argument));
	if (unexpected.length > 0) throw new Error(`Unknown verifier arguments: ${unexpected.join(", ")}`);

	const result = await verifyReleaseArtifacts({
		marketplaceRoot,
		tarballPath,
		expectedMarketplaceVersion,
		expectedPackageName,
		expectedPackageVersion,
		expectedMarketplaceCommit,
		expectedTarballSha256
	});
	console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch(error => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
