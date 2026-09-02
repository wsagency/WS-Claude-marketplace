import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	DEFAULT_CHANGELOG_POLICY,
	DEFAULT_DOCUMENTATION_POLICY,
} from "./policy.mjs";

async function nearestExistingRealPath(target) {
	let candidate = target;
	while (true) {
		try {
			return await realpath(candidate);
		} catch (error) {
			if (error?.code !== "ENOENT") throw error;
			const parent = path.dirname(candidate);
			if (parent === candidate) throw error;
			candidate = parent;
		}
	}
}

async function validateContainment(resolvedRoot, target) {
	const absolute = path.resolve(resolvedRoot, target);
	if (absolute !== resolvedRoot && !absolute.startsWith(`${resolvedRoot}${path.sep}`)) {
		throw new Error(`Target escapes the repository: ${target}`);
	}
	let candidate = absolute;
	while (candidate !== resolvedRoot) {
		try {
			if ((await lstat(candidate)).isSymbolicLink()) {
				throw new Error(`Target uses symlinked ancestry: ${target}`);
			}
		} catch (error) {
			if (error?.code !== "ENOENT") throw error;
		}
		candidate = path.dirname(candidate);
	}
	const nearest = await nearestExistingRealPath(absolute);
	if (nearest !== resolvedRoot && !nearest.startsWith(`${resolvedRoot}${path.sep}`)) {
		throw new Error(`Target ancestry escapes the repository: ${target}`);
	}
}

const SKILL_ROOT = path.dirname(fileURLToPath(import.meta.url));
const MISSING_FINGERPRINT = null;

export const DOCUMENTATION_CONTEXT_FRAGMENTS = Object.freeze({
	agents: "\n# Documentation maintenance\n\nDocumentation policy is read only from `.wsagency/config.yaml`. Run `/ws-docs` to inspect or maintain the configured tracks.\n",
	claude: "<!-- Canonical project context lives in AGENTS.md (agent-neutral). Keep this file as a one-line import. -->\n@AGENTS.md\n",
});

function documentationTargets(policy = {}) {
	const docs = { ...DEFAULT_DOCUMENTATION_POLICY, ...(policy.docs ?? {}) };
	const changelog = {
		...DEFAULT_CHANGELOG_POLICY,
		...(policy.changelog ?? {}),
		skip_types: [...(policy.changelog?.skip_types ?? DEFAULT_CHANGELOG_POLICY.skip_types)],
	};
	const userDirectories = [
		docs.user_track,
		`${docs.user_track}/tutorials`,
		`${docs.user_track}/how-to`,
		`${docs.user_track}/reference`,
		`${docs.user_track}/explanation`,
		`${docs.user_track}/release-notes`,
	];
	const devDirectories = [
		docs.dev_track,
		`${docs.dev_track}/decisions`,
		`${docs.dev_track}/scoping`,
		`${docs.dev_track}/runbooks`,
		`${docs.dev_track}/reference`,
		`${docs.dev_track}/explanation`,
	];
	return {
		docs,
		changelog,
		userDirectories,
		devDirectories,
		fileTargets: [
			changelog.path,
			"CONTRIBUTING.md",
			`${docs.user_track}/contributing.md`,
			`${docs.user_track}/index.md`,
			`${docs.dev_track}/development.md`,
			`${docs.dev_track}/index.md`,
		],
	};
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

async function readSnapshotEntry(root, target, expectedKind) {
	const absolute = path.join(root, target);
	try {
		const details = await lstat(absolute);
		if (details.isSymbolicLink()) {
			return { kind: "blocked", fingerprint: "blocked:symlink" };
		}
		if (expectedKind === "directory" && details.isDirectory()) {
			return { kind: "directory", fingerprint: "directory" };
		}
		if (expectedKind === "file" && details.isFile()) {
			const content = await readFile(absolute, "utf8");
			return { kind: "file", content, fingerprint: sha256(content) };
		}
		return { kind: details.isDirectory() ? "directory" : "file", fingerprint: `unexpected:${details.mode}` };
	} catch (error) {
		if (error && typeof error === "object" && "code" in error) {
			if (error.code === "ENOENT") return { kind: "missing", fingerprint: MISSING_FINGERPRINT };
			if (error.code === "ENOTDIR") return { kind: "blocked", fingerprint: "blocked:ENOTDIR" };
		}
		throw error;
	}
}

export async function discoverDocumentation(root, projectShape, policy = {}) {
	const resolvedRoot = await realpath(path.resolve(root));
	const targets = documentationTargets(policy);
	const entries = {};
	for (const target of targets.userDirectories) entries[target] = await readSnapshotEntry(resolvedRoot, target, "directory");
	for (const target of targets.devDirectories) entries[target] = await readSnapshotEntry(resolvedRoot, target, "directory");
	for (const target of targets.fileTargets) entries[target] = await readSnapshotEntry(resolvedRoot, target, "file");
	return {
		root: resolvedRoot,
		projectShape,
		policy: { docs: targets.docs, changelog: targets.changelog },
		entries,
	};
}
function renderDiff(target, before, after) {
	if (before === after) return "";
	const beforeLines = before === "" ? [] : before.replace(/\n$/, "").split("\n");
	const afterLines = after === "" ? [] : after.replace(/\n$/, "").split("\n");
	let prefix = 0;
	while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix += 1;
	let suffix = 0;
	while (
		suffix < beforeLines.length - prefix &&
		suffix < afterLines.length - prefix &&
		beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
	) suffix += 1;
	const removed = beforeLines.slice(prefix, beforeLines.length - suffix).map(line => `-${line}`);
	const added = afterLines.slice(prefix, afterLines.length - suffix).map(line => `+${line}`);
	return [`--- ${target}`, `+++ ${target}`, `@@ line ${prefix + 1} @@`, ...removed, ...added].join("\n");
}

function baseEffect(order, target, kind, classification, reason, entry, after) {
	const before = entry?.kind === "file" ? entry.content ?? "" : undefined;
	return {
		order,
		target,
		kind,
		classification,
		reason,
		...(before === undefined ? {} : { before }),
		...(after === undefined ? {} : { after }),
		diff: before === undefined || after === undefined ? (after === undefined ? "" : renderDiff(target, "", after)) : renderDiff(target, before, after),
		fingerprint: entry?.fingerprint ?? null,
	};
}

function directoryEffect(order, target, discovery) {
	const entry = discovery.entries[target] ?? { kind: "missing", fingerprint: null };
	if (entry.kind === "directory") return baseEffect(order, target, "directory", "NO-OP", "Directory already exists.", entry);
	if (entry.kind === "missing") return baseEffect(order, target, "directory", "CREATE", `Create the ${target} directory.`, entry);
	return baseEffect(order, target, "directory", "BLOCKING_CONFLICT", "A non-directory entry occupies the required path.", entry);
}


function readTemplate(name) {
	try {
		return readFileSync(path.join(SKILL_ROOT, "templates", name), "utf8");
	} catch {
		return "";
	}
}

function fileEffect(order, target, desired, discovery) {
	const entry = discovery.entries[target] ?? { kind: "missing", fingerprint: null };
	if (entry.kind === "missing") return baseEffect(order, target, "file", "CREATE", `Create ${target}.`, entry, desired);
	if (entry.kind !== "file") return baseEffect(order, target, "file", "BLOCKING_CONFLICT", "A non-file entry occupies the required path.", entry);
	if (entry.content === desired) return baseEffect(order, target, "file", "NO-OP", "File is already aligned.", entry, desired);
	return baseEffect(order, target, "file", "PRESERVE", "Preserve existing authored content.", entry, entry.content);
}

function documentationPlanHash(scope, effects, configFragment, contextFragments) {
	return sha256(JSON.stringify({
		configFragment,
		contextFragments,
		scope,
		effects: effects.map(effect => ({
			order: effect.order,
			target: effect.target,
			kind: effect.kind,
			classification: effect.classification,
			after: effect.after,
			fingerprint: effect.fingerprint,
		})),
	}));
}

export function planDocumentation(discovery) {
	const effects = [];
	const includeUserTrack = ["standalone", "not_git", "hub_subrepository"].includes(discovery.projectShape);
	const targets = documentationTargets(discovery.policy);
	const configFragment = {
		docs: { ...targets.docs },
		changelog: { ...targets.changelog, skip_types: [...targets.changelog.skip_types] },
	};
	let order = 100;

	if (includeUserTrack) {
		for (const directory of targets.userDirectories) effects.push(directoryEffect(order++, directory, discovery));
	}
	for (const directory of targets.devDirectories) effects.push(directoryEffect(order++, directory, discovery));

	effects.push(fileEffect(
		order++,
		targets.changelog.path,
		"# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).\n\n## [Unreleased]\n",
		discovery,
	));
	const contributing = includeUserTrack
		? readTemplate("CONTRIBUTING.md")
			.replaceAll("docs/contributing.md", `${targets.docs.user_track}/contributing.md`)
			.replaceAll("dev-docs/development.md", `${targets.docs.dev_track}/development.md`)
		: `# Contributing\n\nSee the [development guide](${targets.docs.dev_track}/development.md) for contributor setup and conventions.\n`;
	effects.push(fileEffect(order++, "CONTRIBUTING.md", contributing, discovery));

	if (includeUserTrack) {
		effects.push(fileEffect(order++, `${targets.docs.user_track}/contributing.md`, "# Contributing\n\nPlease refer to this guide when contributing.\n", discovery));
		effects.push(fileEffect(order++, `${targets.docs.user_track}/index.md`, "# Documentation\n\nWelcome to the documentation.\n", discovery));
	} else {
		effects.push(baseEffect(
			order++,
			targets.docs.user_track,
			"directory",
			"SKIP",
			"Hub mode leaves product user documentation to an explicitly registered output repository.",
			discovery.entries[targets.docs.user_track],
		));
	}

	effects.push(fileEffect(order++, `${targets.docs.dev_track}/development.md`, "# Development\n\nThis guide covers project setup and development.\n", discovery));
	effects.push(fileEffect(order++, `${targets.docs.dev_track}/index.md`, "# Internal Documentation\n\nWelcome to the dev-docs.\n", discovery));

	const contextFragments = { ...DOCUMENTATION_CONTEXT_FRAGMENTS };

	const seenTargets = new Set();
	for (const effect of effects) {
		if (seenTargets.has(effect.target)) {
			throw new Error(`Duplicate planned documentation target: ${effect.target}.`);
		}
		seenTargets.add(effect.target);
	}
	effects.sort((left, right) => left.order - right.order);
	const scope = { root: discovery.root, projectShape: discovery.projectShape };
	return {
		hash: documentationPlanHash(scope, effects, configFragment, contextFragments),
		scope,
		effects,
		contextFragments,
		configFragment,
	};
}

export async function preflightDocumentation(root, plan) {
	const resolvedRoot = await realpath(path.resolve(root));
	if (plan.scope?.root !== resolvedRoot) throw new Error("Documentation plan scope does not match the target root.");
	if (plan.hash !== documentationPlanHash(plan.scope, plan.effects, plan.configFragment, plan.contextFragments)) {
		throw new Error("Documentation plan authorization is stale or invalid.");
	}
	for (const effect of plan.effects.filter(effect => effect.classification === "CREATE" || effect.classification === "UPDATE")) {
		await validateContainment(resolvedRoot, effect.target);
		const current = await readSnapshotEntry(resolvedRoot, effect.target, effect.kind);
		if (current.fingerprint !== effect.fingerprint) {
			throw new Error(`Documentation plan drift detected for ${effect.target}.`);
		}
	}
}

export async function applyDocumentation(root, plan, authorization, failureInjection) {
	const resolvedRoot = await realpath(path.resolve(root));
	if (authorization !== plan.hash) throw new Error("Documentation plan authorization is stale or invalid.");
	await preflightDocumentation(resolvedRoot, plan);
	const operations = [];
	const completed = [];
	const writes = plan.effects.filter(effect => effect.classification === "CREATE" || effect.classification === "UPDATE");
	if (failureInjection === "before_writes") {
		const error = new Error("Injected failure before writes.");
		error.completed = completed;
		error.pending = writes;
		error.operations = operations;
		throw error;
	}

	for (let index = 0; index < writes.length; index += 1) {
		const effect = writes[index];
		const absolute = path.resolve(resolvedRoot, effect.target);
		if (failureInjection === effect.target) {
			const error = new Error(`Injected failure writing ${effect.target}.`);
			error.completed = completed;
			error.pending = writes.slice(index);
			error.operations = operations;
			throw error;
		}

		try {
			await validateContainment(resolvedRoot, effect.target);
			operations.push({ action: "write", target: effect.target });
			if (effect.kind === "directory") await mkdir(absolute, { recursive: true });
			else {
				await mkdir(path.dirname(absolute), { recursive: true });
				await writeFile(absolute, effect.after, "utf8");
			}
			const verified = await readSnapshotEntry(resolvedRoot, effect.target, effect.kind);
			if (effect.kind === "directory" ? verified.kind !== "directory" : verified.content !== effect.after) {
				throw new Error(`Verification failed after writing ${effect.target}.`);
			}
			operations.push({ action: "verify", target: effect.target });
			completed.push(effect);
		} catch (error) {
			error.completed = completed;
			error.pending = writes.slice(index);
			error.operations = operations;
			throw error;
		}
	}
	return operations;
}
