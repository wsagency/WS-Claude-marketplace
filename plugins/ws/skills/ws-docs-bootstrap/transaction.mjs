import { createHash } from "node:crypto";
import { access, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = path.dirname(fileURLToPath(import.meta.url));
const MISSING_FINGERPRINT = null;

const DOCS_DIRECTORIES = ["docs", "docs/tutorials", "docs/how-to", "docs/reference", "docs/explanation", "docs/release-notes"];
const DEV_DOCS_DIRECTORIES = ["dev-docs", "dev-docs/decisions", "dev-docs/scoping", "dev-docs/runbooks", "dev-docs/reference", "dev-docs/explanation"];

const FILE_TARGETS = [
	"CHANGELOG.md",
	"CONTRIBUTING.md",
	"docs/contributing.md",
	"docs/index.md",
	"dev-docs/development.md",
	"dev-docs/index.md"
];

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

async function readSnapshotEntry(root, target, expectedKind) {
	const absolute = path.join(root, target);
	try {
		const details = await stat(absolute);
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

export async function discoverDocumentation(root, projectShape) {
	const resolvedRoot = await realpath(path.resolve(root));
	const entries = {};
	for (const target of DOCS_DIRECTORIES) entries[target] = await readSnapshotEntry(resolvedRoot, target, "directory");
	for (const target of DEV_DOCS_DIRECTORIES) entries[target] = await readSnapshotEntry(resolvedRoot, target, "directory");
	for (const target of FILE_TARGETS) entries[target] = await readSnapshotEntry(resolvedRoot, target, "file");
	return {
		root: resolvedRoot,
		projectShape,
		entries
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

import { readFileSync } from "node:fs";

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

export function planDocumentation(discovery) {
	const effects = [];
	const isStandalone = discovery.projectShape === "standalone" || discovery.projectShape === "not_git";
	const includeDocs = isStandalone;
	
	let order = 100;

	const configFragment = {
		docs: {
			user_track: "docs",
			dev_track: "dev-docs",
			default_audience: "ask",
			default_scope: "repo",
			adr_for_arch_changes: true,
		},
		changelog: {
			update_mode: "pull_request",
			path: "CHANGELOG.md",
			skip_types: ["docs", "chore", "test", "style", "build", "ci"],
		},
	};
	// Base directories
	if (includeDocs) {
		for (const dir of DOCS_DIRECTORIES) effects.push(directoryEffect(order++, dir, discovery));
	}
	for (const dir of DEV_DOCS_DIRECTORIES) effects.push(directoryEffect(order++, dir, discovery));

	// Base files
	effects.push(fileEffect(order++, "CHANGELOG.md", "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).\n\n## [Unreleased]\n", discovery));
	effects.push(fileEffect(order++, "CONTRIBUTING.md", readTemplate("CONTRIBUTING.md"), discovery));
	
	if (includeDocs) {
		effects.push(fileEffect(order++, "docs/contributing.md", "# Contributing\n\nPlease refer to this guide when contributing.\n", discovery));
		effects.push(fileEffect(order++, "docs/index.md", "# Documentation\n\nWelcome to the documentation.\n", discovery));
	} else {
		effects.push(baseEffect(order++, "docs", "directory", "SKIP", "Hub mode skips user docs tracking per conventions.", discovery.entries["docs"]));
	}
	
	effects.push(fileEffect(order++, "dev-docs/development.md", "# Development\n\nThis guide covers project setup and development.\n", discovery));
	effects.push(fileEffect(order++, "dev-docs/index.md", "# Internal Documentation\n\nWelcome to the dev-docs.\n", discovery));

	const contextFragments = {
		agents: "\n# Documentation maintenance\n\nThis project uses the WS dual-track-docs convention. Run `/ws-docs` to audit or scaffold documentation.\n",
		claude: "<!-- Canonical project context lives in AGENTS.md (agent-neutral). Keep this file as a one-line import. -->\n@AGENTS.md\n"
	};

	effects.sort((left, right) => left.order - right.order);
	const scope = { root: discovery.root, projectShape: discovery.projectShape };
	const hashPayload = {
		configFragment,
		scope,
		effects: effects.map(effect => ({
			order: effect.order,
			target: effect.target,
			kind: effect.kind,
			classification: effect.classification,
			after: effect.after,
			fingerprint: effect.fingerprint,
		})),
	};
	return { hash: sha256(JSON.stringify(hashPayload)), scope, effects, contextFragments, configFragment };
}

export async function applyDocumentation(root, plan, failureInjection) {
	const operations = [];
	if (failureInjection === "before_writes") {
		throw new Error("Injected failure before writes.");
	}

	const completed = [];
	const pending = [];
	const writes = plan.effects.filter(e => e.classification === "CREATE" || e.classification === "UPDATE");
	
	for (let i = 0; i < writes.length; i++) {
		const effect = writes[i];
		const absolute = path.join(root, effect.target);
		
		if (failureInjection === effect.target) {
			pending.push(...writes.slice(i));
			const error = new Error(`Injected failure writing ${effect.target}.`);
			error.completed = completed;
			error.pending = pending;
			error.operations = operations;
			throw error;
		}

		try {
			operations.push({ action: "write", target: effect.target });
			if (effect.kind === "directory") {
				await mkdir(absolute, { recursive: true });
			} else {
				await mkdir(path.dirname(absolute), { recursive: true });
				await writeFile(absolute, effect.after, "utf8");
			}
			const verified = await readSnapshotEntry(root, effect.target, effect.kind);
			if (effect.kind === "directory" ? verified.kind !== "directory" : verified.content !== effect.after) {
				throw new Error(`Verification failed after writing ${effect.target}.`);
			}
			operations.push({ action: "verify", target: effect.target });
			completed.push(effect);
		} catch (e) {
			pending.push(...writes.slice(i));
			e.completed = completed;
			e.pending = pending;
			e.operations = operations;
			throw e;
		}
	}
	return operations;
}
