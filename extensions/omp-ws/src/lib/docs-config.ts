/**
 * Reading `.claude/docs-config.yaml` (and the ws-project fallback) with the
 * same semantics as enforce-changelog.sh / enforce-stop.sh.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { sectionList, sectionValue } from "./yaml-lite";

export const DEFAULT_SKIP_TYPES = ["docs", "chore", "test", "style", "build", "ci"];

export interface DocsConfig {
	/** False when .claude/docs-config.yaml is absent — every gate is a no-op then. */
	exists: boolean;
	/** auto.enforce_via_hooks — default true; only explicit "false" disables. */
	enforceViaHooks: boolean;
	/** auto.changelog_per_commit — default false; only explicit "true" enables. */
	changelogPerCommit: boolean;
	/** changelog.skip_types from docs-config, then ws-project.yaml, then defaults. */
	skipTypes: string[];
}

export async function loadDocsConfig(cwd: string): Promise<DocsConfig> {
	const configText = await readIfExists(path.join(cwd, ".claude", "docs-config.yaml"));
	if (configText === undefined) {
		return { exists: false, enforceViaHooks: true, changelogPerCommit: false, skipTypes: DEFAULT_SKIP_TYPES };
	}
	const projectText = await readIfExists(path.join(cwd, ".claude", "ws-project.yaml"));
	return parseDocsConfig(configText, projectText);
}

/** Pure core, testable without a filesystem. */
export function parseDocsConfig(configText: string, projectText?: string): DocsConfig {
	const enforce = sectionValue(configText, "auto", "enforce_via_hooks");
	const perCommit = sectionValue(configText, "auto", "changelog_per_commit");
	const skipTypes =
		sectionList(configText, "changelog", "skip_types") ??
		(projectText !== undefined ? sectionList(projectText, "changelog", "skip_types") : undefined) ??
		DEFAULT_SKIP_TYPES;
	return {
		exists: true,
		enforceViaHooks: enforce !== "false",
		changelogPerCommit: perCommit === "true",
		skipTypes,
	};
}

/**
 * True for paths the changelog rules treat as documentation: docs/,
 * dev-docs/, any *.md (CHANGELOG.md included). Same case list as the hooks.
 */
export function isDocsPath(file: string): boolean {
	if (file.startsWith("docs/") || file.startsWith("dev-docs/")) return true;
	if (file.endsWith(".md") || file.endsWith(".MD")) return true;
	return file === "CHANGELOG.md";
}

/** Any non-docs file in the set? (The "has_code" test of the shell hooks.) */
export function hasCodeChanges(files: string[]): boolean {
	return files.some(file => !isDocsPath(file));
}

export function touchesChangelog(files: string[]): boolean {
	// git prints paths relative to the GIT ROOT, so a package dir below the
	// root yields e.g. "extensions/pkg/CHANGELOG.md". Match the suffix so the
	// gate/nudge can be satisfied in nested repos, not just at the git root.
	return files.some(file => file === "CHANGELOG.md" || file.endsWith("/CHANGELOG.md"));
}

async function readIfExists(filePath: string): Promise<string | undefined> {
	try {
		return await fs.readFile(filePath, "utf8");
	} catch {
		return undefined;
	}
}
