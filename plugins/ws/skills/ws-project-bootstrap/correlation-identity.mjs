import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import { parseOriginIdentity } from "./trackers.mjs";

const CONTRACT_VERSION = "wsc1";
const HASH_PATTERN = "[a-f0-9]{64}";
const SCOPED_ID_PATTERN = new RegExp(`^${CONTRACT_VERSION}:(${HASH_PATTERN}):(${HASH_PATTERN})$`, "i");
const MARKER_PATTERN = new RegExp(`^WS-CORRELATION-${CONTRACT_VERSION.toUpperCase()}-(${HASH_PATTERN})-(${HASH_PATTERN})$`, "i");

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function canonicalOriginIdentity(origin) {
	if (origin && typeof origin === "object") {
		const { provider, host, owner, repo } = origin;
		if ([provider, host, owner, repo].every(value => typeof value === "string" && value.length > 0)) {
			return parseOriginIdentity(`https://${host}/${owner}/${repo}.git`);
		}
		return null;
	}
	if (typeof origin !== "string" || origin.trim() === "") return null;
	const source = origin.trim();
	return parseOriginIdentity(source.includes("://") || source.includes(":") ? source : `https://${source}`);
}

export function validateRepositoryIdentity(identity) {
	if (typeof identity !== "string" || !/^(?:origin|local):[a-z0-9][a-z0-9:._/-]*$/.test(identity)) {
		throw new Error("Repository correlation identity is malformed.");
	}
	return identity;
}

export function resolveRepositoryIdentity({ root, verifiedOrigin, persistedIdentity } = {}) {
	const origin = canonicalOriginIdentity(verifiedOrigin);
	if (origin) {
		const originIdentity = validateRepositoryIdentity(
			`origin:${origin.provider}:${origin.host}/${origin.owner}/${origin.repo}`.toLowerCase(),
		);
		if (persistedIdentity !== undefined && persistedIdentity !== null) {
			const persisted = validateRepositoryIdentity(persistedIdentity);
			if (persisted !== originIdentity) {
				throw new Error("Persisted Jira correlation identity has a verified repository ownership mismatch.");
			}
		}
		return originIdentity;
	}
	if (persistedIdentity !== undefined && persistedIdentity !== null) {
		return validateRepositoryIdentity(persistedIdentity);
	}
	if (typeof root !== "string" || root.trim() === "") {
		throw new Error("Originless Local/Jira synchronization requires an explicit repository root identity.");
	}
	let normalizedRoot;
	try {
		normalizedRoot = realpathSync.native(root).normalize("NFC");
	} catch {
		normalizedRoot = path.resolve(root).normalize("NFC");
	}
	return `local:${sha256(JSON.stringify(["ws-repository-root-v1", normalizedRoot]))}`;
}

export function repositoryIdentityScope(repositoryIdentity) {
	return sha256(JSON.stringify(["ws-repository-scope-v1", validateRepositoryIdentity(repositoryIdentity)]));
}

export function createJiraCorrelation(repositoryIdentity, jiraProject, sourceCorrelationId) {
	const identity = validateRepositoryIdentity(repositoryIdentity);
	if (typeof jiraProject !== "string" || jiraProject.trim() === "") throw new Error("Jira correlation requires a project key.");
	if (typeof sourceCorrelationId !== "string" || sourceCorrelationId.trim() === "") {
		throw new Error("Jira correlation requires a source operation identity.");
	}
	const project = jiraProject.trim().toUpperCase();
	const scope = repositoryIdentityScope(identity);
	const token = sha256(JSON.stringify([
		"ws-jira-correlation-v1",
		identity,
		project,
		sourceCorrelationId,
	]));
	return {
		id: `${CONTRACT_VERSION}:${scope}:${token}`,
		scope,
		token,
		marker: `WS-CORRELATION-${CONTRACT_VERSION.toUpperCase()}-${scope}-${token}`,
	};
}

export function parseJiraCorrelationId(value) {
	if (typeof value !== "string") return null;
	const match = value.toLowerCase().match(SCOPED_ID_PATTERN);
	return match ? { id: value.toLowerCase(), scope: match[1], token: match[2] } : null;
}

export function parseJiraCorrelationMarker(value) {
	if (typeof value !== "string") return null;
	const match = value.match(MARKER_PATTERN);
	if (!match) return null;
	const scope = match[1].toLowerCase();
	const token = match[2].toLowerCase();
	return {
		id: `${CONTRACT_VERSION}:${scope}:${token}`,
		scope,
		token,
		marker: `WS-CORRELATION-${CONTRACT_VERSION.toUpperCase()}-${scope}-${token}`,
	};
}

export function resolveJiraCorrelation(repositoryIdentity, jiraProject, correlationId) {
	const expectedScope = repositoryIdentityScope(repositoryIdentity);
	const scoped = parseJiraCorrelationId(correlationId);
	if (scoped) {
		if (scoped.scope !== expectedScope) throw new Error("Jira correlation identity belongs to a different repository.");
		return { ...scoped, marker: `WS-CORRELATION-${CONTRACT_VERSION.toUpperCase()}-${scoped.scope}-${scoped.token}` };
	}
	if (!/^[a-f0-9]{64}$/i.test(correlationId)) {
		throw new Error("Jira source correlation identity must be a SHA-256 value.");
	}
	return createJiraCorrelation(repositoryIdentity, jiraProject, correlationId.toLowerCase());
}

export function repositorySourceLink(repositoryIdentity, localId) {
	if (typeof localId !== "string" || localId === "") throw new Error("Local ticket identity is required.");
	return `local://${CONTRACT_VERSION}/${repositoryIdentityScope(repositoryIdentity)}/${encodeURIComponent(localId)}`;
}
