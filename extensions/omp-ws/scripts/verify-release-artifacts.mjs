#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PLUGIN_ID = "ws@ws-marketplace";
const NATIVE_PACKAGE = "@wsagency/omp-ws";
const RETIRED_COMMAND = `${["ws", "init"].join("-")}.md`;
const RETIRED_SKILL = ["ws", "setup", "matt", "pocock", "skills"].join("-");

export const REQUIRED_INSTALLED_ASSETS = Object.freeze([
	"commands/ws-setup.md",
	"agents/ws-project-bootstrap.md",
	"agents/ws-docs-bootstrap.md",
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

async function resolveClaudePluginRoot(claudeConfig) {
	const registryPath = path.join(claudeConfig, "plugins", "installed_plugins.json");
	const registry = JSON.parse(await readFile(registryPath, "utf8"));
	const entries = registry?.plugins?.[PLUGIN_ID];
	const entry = Array.isArray(entries) ? entries.find(candidate => candidate?.enabled !== false && candidate?.installPath) : null;
	if (!entry) throw new Error(`Claude registry does not contain an enabled ${PLUGIN_ID} installation.`);
	return realpath(entry.installPath);
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

async function exerciseInstalledTransaction(pluginRoot, workspaceRoot, label, runCommand, env) {
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

async function validateInputs(marketplaceRoot, tarballPath) {
	const root = await realpath(path.resolve(marketplaceRoot));
	const tarball = await realpath(path.resolve(tarballPath));
	const marketplace = await stat(path.join(root, ".claude-plugin", "marketplace.json")).catch(() => null);
	const archive = await stat(tarball).catch(() => null);
	if (!marketplace?.isFile()) throw new Error("Marketplace root does not contain .claude-plugin/marketplace.json.");
	if (!archive?.isFile() || path.extname(tarball) !== ".tgz") throw new Error("Retained native package must be an existing .tgz file.");
	return { marketplaceRoot: root, tarballPath: tarball };
}

export async function verifyReleaseArtifacts(options, dependencies = {}) {
	if (!options?.marketplaceRoot || !options?.tarballPath) throw new Error("Explicit marketplaceRoot and tarballPath are required.");
	const inputs = await validateInputs(options.marketplaceRoot, options.tarballPath);
	const tempRoot = await mkdtemp(path.join(tmpdir(), "ws-release-artifacts-"));
	const paths = verificationPaths(tempRoot);
	const runCommand = dependencies.runCommand ?? defaultRunCommand;
	const inspectSurface = dependencies.inspectSurface ?? assertInstalledSurface;
	const exerciseTransaction = dependencies.exerciseTransaction ?? exerciseInstalledTransaction;
	try {
		for (const target of [paths.claudeHome, paths.claudeConfig, paths.ompHome, paths.ompXdgConfig, paths.ompXdgData, paths.npmPrefix, paths.workspace]) {
			await mkdir(target, { recursive: true });
		}
		const steps = buildVerificationSteps({ ...inputs, paths });
		const commandResults = [];
		for (const step of steps) commandResults.push({ label: step.label, ...await runCommand(step) });

		const claudeRoot = await (dependencies.resolveClaudePluginRoot ?? resolveClaudePluginRoot)(paths.claudeConfig);
		const [claudeSurface, ompSurface] = await Promise.all([
			inspectSurface(claudeRoot),
			inspectSurface(paths.nativeRoot),
		]);
		const ompEnv = steps.find(step => step.label === "omp-plugin-list").env;
		const [claudeMigration, ompMigration] = await Promise.all([
			exerciseTransaction(claudeRoot, paths.workspace, "claude", runCommand, ompEnv),
			exerciseTransaction(paths.nativeRoot, paths.workspace, "omp", runCommand, ompEnv),
		]);
		return {
			commands: commandResults.map(result => result.label),
			claude: { root: claudeSurface.root, migration: claudeMigration },
			omp: { root: ompSurface.root, migration: ompMigration },
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
	const allowed = new Set(["--marketplace-root", marketplaceRoot, "--tarball", tarballPath]);
	const unexpected = process.argv.slice(2).filter(argument => !allowed.has(argument));
	if (unexpected.length > 0) throw new Error(`Unknown verifier arguments: ${unexpected.join(", ")}`);
	const result = await verifyReleaseArtifacts({ marketplaceRoot, tarballPath });
	console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch(error => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
