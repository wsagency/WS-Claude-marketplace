import { access, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { validateCanonicalConfig } from "../ws-project-bootstrap/config.mjs";

export const CANONICAL_CONFIG_PATH = ".wsagency/config.yaml";
export const LEGACY_CONFIG_PATHS = Object.freeze([
	".claude/docs-config.yaml",
	".claude/ws-project.yaml",
]);

export const DEFAULT_DOCUMENTATION_POLICY = Object.freeze({
	user_track: "docs",
	dev_track: "dev-docs",
	default_audience: "ask",
	default_scope: "repo",
	adr_for_arch_changes: true,
});

export const DEFAULT_CHANGELOG_POLICY = Object.freeze({
	update_mode: "pull_request",
	path: "CHANGELOG.md",
	skip_types: Object.freeze(["docs", "chore", "test", "style", "build", "ci"]),
});

const CAPABILITY_SECTIONS = Object.freeze({
	inspect: [],
	bootstrap: [],
	documentation: ["docs"],
	changelog: ["changelog"],
	maintenance: ["docs", "changelog"],
	hub_documentation: ["docs"],
});

export class DocumentationPolicyError extends Error {
	constructor(code, message, source = CANONICAL_CONFIG_PATH) {
		super(message);
		this.name = "DocumentationPolicyError";
		this.code = code;
		this.source = source;
	}
}

async function exists(target) {
	try {
		await access(target);
		return true;
	} catch (error) {
		if (error?.code === "ENOENT") return false;
		throw error;
	}
}

function blocked(root, error) {
	return {
		root,
		status: "blocked",
		config: null,
		docs: null,
		changelog: null,
		blockers: [{ code: error.code, source: error.source, message: error.message }],
	};
}

/**
 * Inspect policy owned by one repository root. This function never walks to an
 * ancestor config: hub children own materialized policy and must not inherit it
 * at runtime.
 */
export async function inspectCanonicalPolicy(root) {
	const resolvedRoot = await realpath(path.resolve(root));
	const canonicalPath = path.join(resolvedRoot, CANONICAL_CONFIG_PATH);
	if (!(await exists(canonicalPath))) {
		const legacySources = [];
		for (const relativePath of LEGACY_CONFIG_PATHS) {
			if (await exists(path.join(resolvedRoot, relativePath))) legacySources.push(relativePath);
		}
		if (legacySources.length > 0) {
			const sources = legacySources.join(", ");
			return blocked(resolvedRoot, new DocumentationPolicyError(
				"legacy_config",
				`Legacy project policy detected at ${sources}; it is not a policy fallback. Run /ws-setup to migrate it to ${CANONICAL_CONFIG_PATH}.`,
				sources,
			));
		}
		return {
			root: resolvedRoot,
			status: "missing",
			config: null,
			docs: null,
			changelog: null,
			blockers: [],
		};
	}

	const details = await stat(canonicalPath);
	if (!details.isFile()) {
		return blocked(resolvedRoot, new DocumentationPolicyError(
			"invalid_config_path",
			`${CANONICAL_CONFIG_PATH} is not a regular file. Run /ws-setup to repair canonical policy.`,
		));
	}
	const validation = validateCanonicalConfig(await readFile(canonicalPath, "utf8"));
	if (validation.status === "older") {
		return blocked(resolvedRoot, new DocumentationPolicyError(
			"older_schema",
			`${CANONICAL_CONFIG_PATH} uses an older schema. Run /ws-setup to migrate it.`,
		));
	}
	if (validation.status === "future") {
		return blocked(resolvedRoot, new DocumentationPolicyError(
			"future_schema",
			`${CANONICAL_CONFIG_PATH} uses a newer schema. Update the ws plugin before continuing.`,
		));
	}
	if (validation.status !== "valid") {
		const detail = validation.errors.map(issue => `${issue.path}: ${issue.message}`).join(" ");
		return blocked(resolvedRoot, new DocumentationPolicyError(
			"invalid_config",
			`${CANONICAL_CONFIG_PATH} is invalid: ${detail} Run /ws-setup to repair canonical policy.`,
		));
	}
	return {
		root: resolvedRoot,
		status: "valid",
		config: validation.config,
		docs: validation.config.docs ?? null,
		changelog: validation.config.changelog ?? null,
		blockers: [],
	};
}

export function derivePolicyReadiness(inspection, capability) {
	const requiredSections = CAPABILITY_SECTIONS[capability];
	if (!requiredSections) throw new Error(`Unknown documentation capability: ${capability}.`);
	if (inspection.status === "blocked") return { ready: false, blockers: [...inspection.blockers] };
	if (inspection.status === "missing") {
		if (requiredSections.length === 0) return { ready: true, blockers: [] };
		return {
			ready: false,
			blockers: [{
				code: "missing_config",
				source: CANONICAL_CONFIG_PATH,
				message: `${CANONICAL_CONFIG_PATH} is missing. Run /ws-setup before using ${capability.replaceAll("_", " ")}.`,
			}],
		};
	}
	const blockers = requiredSections
		.filter(section => inspection.config?.[section] == null)
		.map(section => ({
			code: `missing_${section}_policy`,
			source: CANONICAL_CONFIG_PATH,
			message: `${CANONICAL_CONFIG_PATH} has no ${section} policy. Run /ws-setup to configure it.`,
		}));
	return { ready: blockers.length === 0, blockers };
}

export async function requirePolicyCapability(root, capability) {
	const inspection = await inspectCanonicalPolicy(root);
	const readiness = derivePolicyReadiness(inspection, capability);
	if (!readiness.ready) {
		const blocker = readiness.blockers[0];
		throw new DocumentationPolicyError(blocker.code, blocker.message, blocker.source);
	}
	return inspection;
}

/** Derive filesystem readiness without persisting a completion marker. */
export function deriveDocumentationReadiness(inspection, snapshot = {}) {
	const policyReady = inspection.status === "valid" && inspection.docs !== null;
	const changelogPolicyReady = inspection.status === "valid" && inspection.changelog !== null;
	const projectShape = snapshot.projectShape ?? "standalone";
	const userTrackRequired = projectShape === "standalone";
	const docsReady = Boolean(
		policyReady
		&& snapshot.devTrack === true
		&& (!userTrackRequired || snapshot.userTrack === true),
	);
	const changelogReady = Boolean(changelogPolicyReady && snapshot.changelog === true);
	const productOutputReady = projectShape === "standalone" || snapshot.productDocsRepository === true;
	return {
		configValid: inspection.status === "valid",
		docsPolicyReady: policyReady,
		changelogPolicyReady,
		docsReady,
		changelogReady,
		publishReady: docsReady && productOutputReady,
		blockers: [
			...inspection.blockers,
			...(!policyReady && inspection.status === "valid" ? [{ code: "missing_docs_policy", source: CANONICAL_CONFIG_PATH, message: `${CANONICAL_CONFIG_PATH} has no docs policy.` }] : []),
			...(!changelogPolicyReady && inspection.status === "valid" ? [{ code: "missing_changelog_policy", source: CANONICAL_CONFIG_PATH, message: `${CANONICAL_CONFIG_PATH} has no changelog policy.` }] : []),
			...(policyReady && snapshot.devTrack !== true ? [{ code: "missing_dev_track", source: inspection.docs.dev_track, message: `Contributor documentation track ${inspection.docs.dev_track} is missing.` }] : []),
			...(policyReady && userTrackRequired && snapshot.userTrack !== true ? [{ code: "missing_user_track", source: inspection.docs.user_track, message: `User documentation track ${inspection.docs.user_track} is missing.` }] : []),
			...(projectShape !== "standalone" && snapshot.requireProductDocsRepository === true && snapshot.productDocsRepository !== true ? [{ code: "missing_product_docs_repository", source: "project.yaml", message: "No type: output, purpose: docs repository is registered; register one explicitly with /ws-hub add." }] : []),
		],
	};
}
