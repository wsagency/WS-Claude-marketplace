import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
	applyPlan,
	buildPlan,
	CANONICAL_CONFIG_YAML,
	deriveReadiness,
	discoverStandaloneRepository,
	preflightPlan,
	RECOMMENDED_LOCAL_CHOICES,
} from "./transaction.mjs";
import {
	parseCanonicalConfigYaml,
	serializeCanonicalConfig,
	validateCanonicalConfig,
} from "./config.mjs";
import { applyDocumentation, discoverDocumentation, planDocumentation, preflightDocumentation } from "../ws-docs-bootstrap/transaction.mjs";
import { applyLegacyCleanup, discoverLegacySetup, planLegacyMigration } from "./migration.mjs";

const REGISTRY_KEYS = new Set(["name", "path", "url", "description", "tech", "type", "purpose"]);
const REPOSITORY_TYPES = new Set(["working", "input", "output"]);
const KNOWN_OUTPUT_PURPOSES = new Set(["docs", "explained"]);
const SAFE_RERUN = "/ws-setup";

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function stripYamlComment(line) {
	let quote = null;
	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];
		if ((character === '"' || character === "'") && line[index - 1] !== "\\") quote = quote === character ? null : quote ?? character;
		if (character === "#" && quote === null && (index === 0 || /\s/.test(line[index - 1]))) return line.slice(0, index);
	}
	return line;
}

function parseRegistryScalar(source, lineNumber) {
	const value = source.trim();
	if (value === "") throw new Error(`Missing registry value at line ${lineNumber}.`);
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
	if (/[[\]{}&*!|>]/.test(value)) throw new Error(`Unsupported registry YAML value at line ${lineNumber}.`);
	return value;
}

export function parseProjectYaml(content) {
	if (typeof content !== "string") throw new Error("project.yaml must be text.");
	const repositories = [];
	let inRepositories = false;
	let sawRepositories = false;
	let current = null;
	const lines = content.replaceAll("\r\n", "\n").split("\n");
	const finish = () => {
		if (current) repositories.push(current);
		current = null;
	};
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const raw = lines[lineIndex];
		if (raw.includes("\t")) throw new Error(`Tabs are not allowed at line ${lineIndex + 1}.`);
		const code = stripYamlComment(raw).trimEnd();
		if (code.trim() === "") continue;
		if (/^repos\s*:/.test(code)) {
			if (code.trim() !== "repos:") throw new Error(`repos must be a block sequence at line ${lineIndex + 1}.`);
			finish();
			inRepositories = true;
			sawRepositories = true;
			continue;
		}
		if (/^[^\s]/.test(code)) {
			if (inRepositories) finish();
			inRepositories = false;
			continue;
		}
		if (!inRepositories) continue;
		const item = code.match(/^\s{2}-\s+([a-z][a-z0-9_]*)\s*:\s*(.*)$/);
		if (item) {
			finish();
			current = {};
			const [, key, source] = item;
			if (!REGISTRY_KEYS.has(key)) throw new Error(`Unknown repository key ${key} at line ${lineIndex + 1}.`);
			current[key] = parseRegistryScalar(source, lineIndex + 1);
			continue;
		}
		const property = code.match(/^\s{4}([a-z][a-z0-9_]*)\s*:\s*(.*)$/);
		if (!property || !current) throw new Error(`Malformed repository entry at line ${lineIndex + 1}.`);
		const [, key, source] = property;
		if (!REGISTRY_KEYS.has(key)) throw new Error(`Unknown repository key ${key} at line ${lineIndex + 1}.`);
		if (Object.hasOwn(current, key)) throw new Error(`Duplicate repository key ${key} at line ${lineIndex + 1}.`);
		current[key] = parseRegistryScalar(source, lineIndex + 1);
	}
	finish();
	if (!sawRepositories) throw new Error("project.yaml is missing the repos block.");
	const names = new Set();
	const knownPurposes = new Set();
	for (const repository of repositories) {
		for (const required of ["name", "path", "description", "type"]) {
			if (!repository[required]) throw new Error(`Repository entry is missing ${required}.`);
		}
		if (!REPOSITORY_TYPES.has(repository.type)) throw new Error(`Repository ${repository.name} has invalid type ${repository.type}.`);
		if (repository.type !== "output" && repository.purpose) throw new Error(`Repository ${repository.name} may use purpose only with type output.`);
		if (names.has(repository.name)) throw new Error(`Duplicate repository name ${repository.name}.`);
		if (repository.type === "output" && KNOWN_OUTPUT_PURPOSES.has(repository.purpose)) {
			if (knownPurposes.has(repository.purpose)) throw new Error(`Duplicate output purpose ${repository.purpose}.`);
			knownPurposes.add(repository.purpose);
		}
		names.add(repository.name);
	}
	return repositories;
}

function deepMerge(base, override) {
	const result = { ...base };
	for (const [key, value] of Object.entries(override ?? {})) {
		if (value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
			result[key] = deepMerge(result[key], value);
		} else result[key] = value;
	}
	return result;
}

export function mergeConfig(hubConfigSource, explicitConfigSource) {
	const hub = parseCanonicalConfigYaml(hubConfigSource || CANONICAL_CONFIG_YAML);
	const explicit = explicitConfigSource ? parseCanonicalConfigYaml(explicitConfigSource) : {};
	return serializeCanonicalConfig(deepMerge(hub, explicit));
}

function normalizeOrigin(origin) {
	if (typeof origin !== "string" || origin.trim() === "") return null;
	const source = origin.trim();
	const scp = source.match(/^[^@\s]+@([^:\s]+):(.+)$/);
	if (scp) return `${scp[1].toLowerCase()}/${scp[2].replace(/^\/+|\/+$/g, "").replace(/\.git$/, "")}`;
	try {
		const parsed = new URL(source);
		if (!["https:", "ssh:", "git:"].includes(parsed.protocol) || !parsed.hostname) return null;
		return `${parsed.hostname.toLowerCase()}/${parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "")}`;
	} catch {
		return null;
	}
}

function syntheticDiscovery(root, machine) {
	return {
		root,
		projectShape: "not_git",
		setupState: "unconfigured",
		git: { isRepository: false, root: null, origin: null, head: null, dirty: [] },
		machine: { ...machine },
		entries: {},
	};
}

function canonicalStateErrors(discovery) {
	const entry = discovery.entries[".wsagency/config.yaml"];
	if (!entry || entry.kind === "missing") return [];
	if (entry.kind !== "file") return ["Canonical configuration path is not a regular file."];
	const validation = validateCanonicalConfig(entry.content);
	if (validation.status === "valid" || validation.status === "older") return [];
	if (validation.status === "future") return ["Canonical configuration uses a future schema version."];
	return [`Canonical configuration is invalid: ${validation.errors.map(error => error.message).join(" ")}`];
}

async function discoverSelectedRepository(hubRoot, repository, machine) {
	const requestedRoot = path.resolve(hubRoot, repository.path);
	const errors = [];
	let resolvedRoot = requestedRoot;
	const hubParent = path.dirname(hubRoot);
	if (path.isAbsolute(repository.path) || requestedRoot === hubParent || !requestedRoot.startsWith(`${hubParent}${path.sep}`)) {
		errors.push(`Registered path escapes the hub workspace: ${repository.path}.`);
	} else {
		try {
			const details = await fs.stat(requestedRoot);
			if (!details.isDirectory()) errors.push(`Registered path is not a directory: ${repository.path}.`);
			else {
				await fs.access(requestedRoot, fsConstants.R_OK | fsConstants.W_OK | fsConstants.X_OK);
				resolvedRoot = await fs.realpath(requestedRoot);
				if (resolvedRoot === hubParent || !resolvedRoot.startsWith(`${hubParent}${path.sep}`)) errors.push(`Registered path resolves outside the hub workspace: ${repository.path}.`);
			}
		} catch (error) {
			errors.push(`Registered path is unavailable or inaccessible: ${repository.path} (${error.code || error.message}).`);
		}
	}
	let discovery = syntheticDiscovery(resolvedRoot, machine);
	if (errors.length === 0) {
		try {
			discovery = await discoverStandaloneRepository(resolvedRoot, machine);
		} catch (error) {
			errors.push(`Repository discovery failed: ${error.message}`);
		}
	}
	let legacy = null;
	if (errors.length === 0) {
		try {
			legacy = await discoverLegacySetup(discovery.root, machine);
		} catch (error) {
			errors.push(`Legacy setup discovery failed: ${error.message}`);
		}
	}
	if (!discovery.git.isRepository || discovery.git.root !== discovery.root) errors.push("Target is not an independent Git worktree.");
	const origin = normalizeOrigin(discovery.git.origin);
	if (!origin) errors.push("Target does not have a valid required origin.");
	const registryOrigin = repository.url ? normalizeOrigin(repository.url) : null;
	if (repository.url && !registryOrigin) errors.push("Registry URL is invalid.");
	if (registryOrigin && origin && registryOrigin !== origin) errors.push(`Registry URL does not match origin (${registryOrigin} != ${origin}).`);
	if (path.basename(discovery.root) !== repository.name) errors.push(`Registry name ${repository.name} does not match directory ${path.basename(discovery.root)}.`);
	errors.push(...canonicalStateErrors(discovery));
	return {
		...discovery,
		name: repository.name,
		registry: { ...repository, normalizedPath: path.relative(hubRoot, requestedRoot) || "." },
		identity: { name: repository.name, root: discovery.root, origin },
		legacy,
		preflightErrors: [...new Set(errors)],
	};
}

function validateHubDiscovery(discovery) {
	const errors = [];
	if (!discovery.git.isRepository || discovery.git.root !== discovery.root) errors.push("Hub root is not an independent Git worktree.");
	if (discovery.projectShape !== "hub_root") errors.push("Selected hub root is not a hub repository.");
	const origin = normalizeOrigin(discovery.git.origin);
	if (!origin) errors.push("Hub root does not have a valid required origin.");
	errors.push(...canonicalStateErrors(discovery));
	return { ...discovery, name: "hub", identity: { name: "hub", root: discovery.root, origin }, preflightErrors: errors };
}

export async function discoverHubTransaction(root, machine) {
	const absoluteRoot = await fs.realpath(path.resolve(root));
	const hub = validateHubDiscovery(await discoverStandaloneRepository(absoluteRoot, machine));
	try {
		hub.legacy = await discoverLegacySetup(hub.root, machine);
	} catch (error) {
		hub.legacy = null;
		hub.preflightErrors.push(`Legacy setup discovery failed: ${error.message}`);
	}
	let projectYaml = null;
	let repositories = [];
	let registryError = null;
	try {
		projectYaml = await fs.readFile(path.join(absoluteRoot, "project.yaml"), "utf8");
		repositories = parseProjectYaml(projectYaml);
	} catch (error) {
		registryError = `Invalid hub registry: ${error.message}`;
	}
	const working = [];
	const excluded = [];
	for (const repository of repositories) {
		if (repository.type !== "working") {
			excluded.push({ name: repository.name, type: repository.type, purpose: repository.purpose, reason: `Explicitly excluded ${repository.type} repository.` });
			continue;
		}
		working.push(await discoverSelectedRepository(absoluteRoot, repository, machine));
	}
	const roots = new Map([[hub.identity.root, "hub"]]);
	const origins = new Map();
	if (hub.identity.origin) origins.set(hub.identity.origin, "hub");
	for (const repository of working) {
		if (roots.has(repository.identity.root)) {
			repository.preflightErrors.push(`Normalized registry root duplicates ${roots.get(repository.identity.root)}.`);
		} else roots.set(repository.identity.root, repository.name);
		if (repository.identity.origin && origins.has(repository.identity.origin)) {
			repository.preflightErrors.push(`Normalized registry origin duplicates ${origins.get(repository.identity.origin)}.`);
		} else if (repository.identity.origin) origins.set(repository.identity.origin, repository.name);
	}
	return {
		root: absoluteRoot,
		machine,
		hub,
		working,
		excluded,
		registryError,
		registryFingerprint: projectYaml === null ? null : sha256(projectYaml),
	};
}

function isWriteEffect(effect) {
	return effect.classification === "CREATE" || effect.classification === "UPDATE";
}

function pathsOverlap(left, right) {
	return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function transactionBlockers(repository, transaction, docsPlan) {
	const blockers = [...repository.preflightErrors.map(reason => ({
		repository: repository.name,
		root: repository.root,
		...(/^Canonical configuration path/.test(reason) ? { target: ".wsagency/config.yaml" } : {}),
		reason,
	}))];
	for (const effect of [...(transaction.plan?.effects ?? []), ...(docsPlan?.effects ?? [])]) {
		if (effect.classification === "BLOCKING_CONFLICT") blockers.push({ repository: repository.name, root: repository.root, target: effect.target, reason: effect.reason });
	}
	if (docsPlan) {
		for (const dirtyPath of repository.git.dirty) {
			const overlap = docsPlan.effects.find(effect => isWriteEffect(effect) && pathsOverlap(effect.target, dirtyPath));
			if (overlap) blockers.push({ repository: repository.name, root: repository.root, target: overlap.target, reason: `Dirty overlap: ${dirtyPath} intersects the documentation plan.` });
		}
	}
	return blockers;
}

function targetFingerprint(repository, corePlan, docsPlan, legacyPlan) {
	return sha256(JSON.stringify({
		identity: repository.identity,
		head: repository.git.head,
		dirty: repository.git.dirty,
		core: corePlan?.hash ?? null,
		docs: docsPlan?.hash ?? null,
		legacy: legacyPlan?.hash ?? null,
	}));
}

function configWithFragment(source, fragment) {
	return serializeCanonicalConfig(deepMerge(parseCanonicalConfigYaml(source), fragment));
}

function normalizeMigrationConfig(source) {
	const validation = validateCanonicalConfig(source);
	if (validation.status !== "older") return source;
	const config = parseCanonicalConfigYaml(source);
	config.schema_version = 1;
	return serializeCanonicalConfig(config);
}

function materializeReviewedMigrationPlan(corePlan, legacyPlan) {
	const reviewedReplacements = new Map(
		(legacyPlan?.effects ?? [])
			.filter(effect => effect.classification === "UPDATE" && typeof effect.after === "string")
			.map(effect => [effect.target, effect]),
	);
	let changed = false;
	const effects = corePlan.effects.map(effect => {
		const replacement = reviewedReplacements.get(effect.target);
		if (!replacement || effect.classification !== "BLOCKING_CONFLICT") return effect;
		changed = true;
		return {
			...effect,
			classification: "UPDATE",
			reason: "Apply the reviewed semantic legacy migration while preserving authored content.",
			after: replacement.after,
			diff: replacement.diff,
		};
	});
	return changed ? { ...corePlan, effects, hash: sha256(JSON.stringify({ delegated: corePlan.hash, effects })) } : corePlan;
}

function hasSemanticRepositoryState(legacy) {
	if (!legacy) return false;
	if (legacy.entries[".wsagency/config.yaml"]?.kind !== "missing") return true;
	return Object.entries(legacy.entries).some(([target, entry]) =>
		target !== ".wsagency/config.yaml" && entry.kind !== "missing",
	);
}

function targetSpecificChoices(choices, repository, hub) {
	return repository === hub ? choices.hub ?? {} : choices.working?.[repository.name] ?? {};
}

function migrationOptions(choices, repository, hub) {
	const targetChoices = targetSpecificChoices(choices, repository, hub);
	return targetChoices.migration ?? choices.migration?.[repository.name] ?? {};
}

function projectDocumentationDiscovery(discovery, corePlan) {
	const entries = Object.fromEntries(Object.entries(discovery.entries).map(([target, entry]) => [target, { ...entry }]));
	for (const effect of corePlan?.effects ?? []) {
		if (!isWriteEffect(effect) || effect.kind === "state") continue;
		if (entries[effect.target]) {
			entries[effect.target] = effect.kind === "directory"
				? { kind: "directory", fingerprint: "directory" }
				: { kind: "file", content: effect.after, fingerprint: sha256(effect.after) };
		}
		for (const [target, entry] of Object.entries(entries)) {
			if (entry.kind === "missing" && effect.target.startsWith(`${target}/`)) entries[target] = { kind: "directory", fingerprint: "directory" };
		}
	}
	return { ...discovery, entries };
}

function plannedPaths(corePlan, docsPlan, legacyPlan) {
	const managedRanges = {
		"dev-docs/agents/issue-tracker.md": "managed:WS-MANAGED:issue-tracker",
		"dev-docs/agents/triage-labels.md": "managed:WS-MANAGED:triage-labels",
		"dev-docs/agents/domain.md": "managed:WS-MANAGED:domain",
		"AGENTS.md": "managed:WS-AGENT-SKILLS",
	};
	const effects = [
		...(corePlan?.effects ?? []).map(effect => ({ ...effect, phase: "core" })),
		...(docsPlan?.effects ?? []).map(effect => ({ ...effect, phase: "docs" })),
		...(legacyPlan?.effects ?? [])
			.filter(effect => effect.order >= 900)
			.map(effect => ({ ...effect, phase: "cleanup" })),
	].filter(effect => effect.kind !== "state" && effect.classification !== "SKIP");
	const seen = new Set();
	for (const effect of effects.filter(isWriteEffect)) {
		if (seen.has(effect.target)) throw new Error(`Duplicate planned target across composite phases: ${effect.target}.`);
		seen.add(effect.target);
	}
	return effects.map(effect => ({
		phase: effect.phase,
		target: effect.target,
		classification: effect.classification,
		range: managedRanges[effect.target] ?? (effect.kind === "file" ? "full-file" : "directory"),
		diff: effect.diff,
	}));
}

async function buildComposite(request) {
	const discovery = request.discovery;
	const choices = request.choices ?? {};
	const backfillFactory = request.backfill;
	const removed = new Set(choices.removedRepositories ?? []);
	const selected = [discovery.hub, ...discovery.working.filter(repository => !removed.has(repository.name))];
	const excluded = [
		...discovery.excluded,
		...discovery.working.filter(repository => removed.has(repository.name)).map(repository => ({ name: repository.name, type: "working", reason: "Explicitly excluded from this setup run." })),
	];
	const requestedDocumentation = choices.documentation === true;
	const legacyPlans = new Map();
	for (const repository of selected) {
		if (repository.legacy) {
			legacyPlans.set(repository.name, planLegacyMigration(
				repository.legacy,
				migrationOptions(choices, repository, discovery.hub),
			));
		}
	}

	const hubLegacy = legacyPlans.get(discovery.hub.name);
	let hubConfig = CANONICAL_CONFIG_YAML;
	let hubConfigError = null;
	try {
		if (hubLegacy?.config) hubConfig = serializeCanonicalConfig(hubLegacy.config);
		else {
			const existingHubConfig = discovery.hub.entries[".wsagency/config.yaml"]?.kind === "file"
				? discovery.hub.entries[".wsagency/config.yaml"].content
				: undefined;
			hubConfig = mergeConfig(CANONICAL_CONFIG_YAML, existingHubConfig ? normalizeMigrationConfig(existingHubConfig) : undefined);
		}
		if ((requestedDocumentation || hubLegacy?.config?.docs) && discovery.hub.preflightErrors.length === 0) {
			const docsDiscovery = await discoverDocumentation(discovery.hub.root, discovery.hub.projectShape, parseCanonicalConfigYaml(hubConfig));
			hubConfig = configWithFragment(hubConfig, planDocumentation(docsDiscovery).configFragment);
		}
	} catch (error) {
		hubConfigError = `Cannot materialize hub canonical configuration: ${error.message}`;
	}

	const targets = [];
	const blockers = [];
	for (const repository of selected) {
		const legacyPlan = legacyPlans.get(repository.name);
		const localErrors = [
			...repository.preflightErrors,
			...(legacyPlan?.blockers ?? []),
		];
		if (repository === discovery.hub && hubConfigError) localErrors.push(hubConfigError);
		let targetConfig = hubConfig;
		if (repository !== discovery.hub && legacyPlan?.config && hasSemanticRepositoryState(repository.legacy)) {
			try {
				targetConfig = mergeConfig(hubConfig, serializeCanonicalConfig(legacyPlan.config));
			} catch (error) {
				localErrors.push(`Cannot materialize canonical configuration: ${error.message}`);
			}
		}
		const targetChoices = targetSpecificChoices(choices, repository, discovery.hub);
		const coreChoices = { ...RECOMMENDED_LOCAL_CHOICES, ...targetChoices, targetConfig };
		let corePlan;
		if (localErrors.length === 0) {
			corePlan = materializeReviewedMigrationPlan(buildPlan(repository, coreChoices), legacyPlan);
		}
		const transaction = {
			plan: corePlan,
			operations: [],
			requiresConfirmation: Boolean(corePlan?.effects.some(isWriteEffect)),
			report: localErrors.length === 0 ? "Composite core plan ready." : "Preflight blocked.",
		};
		let docsPlan;
		const documentation = requestedDocumentation || Boolean(parseCanonicalConfigYaml(targetConfig).docs);
		if (documentation && corePlan) {
			const docsDiscovery = await discoverDocumentation(repository.root, repository.projectShape, parseCanonicalConfigYaml(targetConfig));
			docsPlan = planDocumentation(projectDocumentationDiscovery(docsDiscovery, corePlan));
		}
		const plannedRepository = { ...repository, preflightErrors: localErrors };
		const repositoryBlockers = transactionBlockers(plannedRepository, transaction, docsPlan);

		let backfill = null;
		if (backfillFactory && backfillFactory.usesLocalJiraBackfill(parseCanonicalConfigYaml(targetConfig))) {
			backfill = await backfillFactory.plan(parseCanonicalConfigYaml(targetConfig), { repository: repository.name, root: repository.root });
			if (backfill?.blockers?.length > 0) repositoryBlockers.push(...backfill.blockers.map(reason => ({ repository: repository.name, root: repository.root, reason })));
		}

		blockers.push(...repositoryBlockers);
		let paths = [];
		try {
			paths = plannedPaths(corePlan, docsPlan, legacyPlan);
		} catch (error) {
			const blocker = { repository: repository.name, root: repository.root, reason: error.message };
			repositoryBlockers.push(blocker);
			blockers.push(blocker);
		}
		targets.push({
			name: repository.name,
			root: repository.root,
			role: repository === discovery.hub ? "hub" : "working",
			identity: repository.identity,
			fingerprint: targetFingerprint(repository, corePlan, docsPlan, legacyPlan),
			coreChoices,
			core: corePlan,
			docs: docsPlan,
			legacy: legacyPlan,
			backfill,
			publicBackfill: backfillFactory?.publicPlan(backfill) ?? null,
			plannedPaths: paths,
			dirtyPaths: [...repository.git.dirty],
			blockers: repositoryBlockers,
			transaction,
		});
	}
	if (discovery.registryError) blockers.unshift({ repository: "hub", root: discovery.root, target: "project.yaml", reason: discovery.registryError });
	const hashPayload = {
		registryFingerprint: discovery.registryFingerprint,
		removed: [...removed],
		documentation: requestedDocumentation,
		targets: targets.map(target => ({
			name: target.name,
			identity: target.identity,
			fingerprint: target.fingerprint,
			core: target.core?.hash ?? null,
			docs: target.docs?.hash ?? null,
			legacy: target.legacy?.hash ?? null,
			backfill: target.publicBackfill ? sha256(JSON.stringify(target.publicBackfill)) : null,
		})),
		excluded: excluded.map(repository => ({ name: repository.name, type: repository.type, purpose: repository.purpose })),
	};
	const hash = sha256(JSON.stringify(hashPayload));
	return {
		plan: {
			hash,
			scope: { root: discovery.root, projectShape: "hub_root" },
			registryFingerprint: discovery.registryFingerprint,
			hub: targets[0]?.core,
			working: targets.slice(1).map(target => ({ name: target.name, plan: target.core, docs: target.docs, legacy: target.legacy, backfill: target.publicBackfill })),
			targets: targets.map(({ transaction, coreChoices, backfill, publicBackfill, ...target }) => ({ ...target, backfill: publicBackfill })),
			excluded,
		},
		targets,
		blockers,
	};
}

function staticOutcomes(plan) {
	const outcomes = plan.excluded.map(repository => ({ repository: repository.name, phase: "preflight", status: "excluded", detail: repository.reason }));
	for (const target of plan.targets) {
		const cleanupEffects = (target.legacy?.effects ?? []).filter(effect => effect.order >= 900);
		for (const [phase, effects] of [["core", target.core?.effects ?? []], ["docs", target.docs?.effects ?? []], ["cleanup", cleanupEffects]]) {
			for (const effect of effects) {
				if (effect.classification === "PRESERVE") outcomes.push({ repository: target.name, phase, status: "preserved", target: effect.target });
				else if (effect.classification === "SKIP") outcomes.push({ repository: target.name, phase, status: "skipped", target: effect.target });
				else if (effect.classification === "NO-OP") outcomes.push({ repository: target.name, phase, status: "no-op", target: effect.target });
			}
		}
	}
	return outcomes;
}

function renderReport(outcomes, rerunInstruction = SAFE_RERUN) {
	const labels = ["completed", "failed", "pending", "preserved", "skipped", "excluded", "no-op"];
	const lines = [];
	for (const status of labels) {
		const entries = outcomes.filter(outcome => outcome.status === status);
		lines.push(`${status[0].toUpperCase()}${status.slice(1)}: ${entries.length === 0 ? "none" : entries.map(entry => `${entry.repository}${entry.target ? `:${entry.target}` : ""}`).join(", ")}`);
	}
	lines.push("Safe rerun:", `  ${rerunInstruction}`);
	return lines.join("\n");
}

function transactionFailed(transaction) {
	return transaction.report.startsWith("Transaction stopped") || transaction.report.includes("verification failed") || transaction.report.includes("Authorization is stale");
}

function result(discovery, plan, operations, blockers, outcomes, reportPrefix, readiness) {
	return {
		discovery,
		questions: [],
		plan,
		requiresConfirmation: false,
		operations,
		blockers,
		outcomes,
		rerunInstruction: SAFE_RERUN,
		...(readiness ? { readiness } : {}),
		report: `${reportPrefix ? `${reportPrefix}\n` : ""}${renderReport(outcomes)}`,
	};
}

function compositeReadiness(composite) {
	const readiness = { hub: undefined, working: {} };
	for (const target of composite.targets) {
		const targetReadiness = target.transaction.readiness;
		if (!targetReadiness) continue;
		if (target.role === "hub") readiness.hub = targetReadiness;
		else readiness.working[target.name] = targetReadiness;
	}
	return readiness;
}

function recordReadiness(readiness, target, targetReadiness) {
	if (!targetReadiness) return;
	if (target.role === "hub") readiness.hub = targetReadiness;
	else readiness.working[target.name] = targetReadiness;
}

function writeEffects(target, phase) {
	if (phase === "core") return target.core?.effects.filter(isWriteEffect) ?? [];
	if (phase === "docs") return target.docs?.effects.filter(isWriteEffect) ?? [];
	if (phase === "backfill") return target.backfill?.effects?.filter(isWriteEffect) ?? [];
	return target.legacy?.effects.filter(effect => effect.order >= 900 && isWriteEffect(effect)) ?? [];
}

function addEffectOutcomes(outcomes, repository, phase, status, effects) {
	for (const effect of effects) outcomes.push({ repository, phase, status, target: typeof effect === "string" ? effect : effect.target });
}

function addPending(outcomes, targets, startIndex, phase) {
	for (let index = startIndex; index < targets.length; index += 1) {
		const target = targets[index];
		outcomes.push({ repository: target.name, phase, status: "pending" });
		addEffectOutcomes(outcomes, target.name, phase, "pending", writeEffects(target, phase));
	}
}

function coreFailureInjection(request, target, injectedFailureRoot) {
	if (injectedFailureRoot !== target.root) return undefined;
	const phase = request.injectedFailure.phase;
	if (phase === "write" || phase === "verify") return { phase, target: request.injectedFailure.target };
	if (phase === "core_write") return { phase: "write", target: request.injectedFailure.target };
	if (phase === "core_verify") return { phase: "verify", target: request.injectedFailure.target };
	return undefined;
}

export async function runHubTransaction(request) {
	const choices = request.choices ?? {};
	const composite = await buildComposite(request);
	const injectedFailureRoot = request.injectedFailure?.targetRoot
		? await fs.realpath(path.resolve(request.injectedFailure.targetRoot)).catch(() => path.resolve(request.injectedFailure.targetRoot))
		: null;
	let outcomes = staticOutcomes(composite.plan);
	if (composite.blockers.length > 0) {
		for (const blocker of composite.blockers) outcomes.push({ repository: blocker.repository, phase: "preflight", status: "failed", target: blocker.target, detail: blocker.reason });
		return result(request.discovery, composite.plan, [], composite.blockers, outcomes, "Hub setup is blocked before authorization.");
	}
	const requiresConfirmation = composite.targets.some(target =>
		["core", "backfill", "docs", "cleanup"].some(phase => writeEffects(target, phase).length > 0),
	);
	if (!requiresConfirmation) {
		return result(request.discovery, composite.plan, [], [], outcomes, "No changes required", compositeReadiness(composite));
	}
	if (!request.authorization) {
		return {
			...result(request.discovery, composite.plan, [], [], outcomes, "Hub transaction planned. Awaiting authorization.", compositeReadiness(composite)),
			requiresConfirmation: true,
		};
	}
	if (request.authorization !== composite.plan.hash) throw new Error("Authorization hash does not match the planned cross-repository manifest.");

	const freshDiscovery = await discoverHubTransaction(request.root, request.discovery.machine);
	const freshComposite = await buildComposite({ ...request, discovery: freshDiscovery });
	const backfillTargets = freshComposite.targets.filter(target => target.backfill);
	const documentationTargets = [
		...freshComposite.targets.filter(target => target.role === "working" && target.docs),
		...freshComposite.targets.filter(target => target.role === "hub" && target.docs),
	];
	const cleanupTargets = [
		...freshComposite.targets.filter(target => target.role === "working" && writeEffects(target, "cleanup").length > 0),
		...freshComposite.targets.filter(target => target.role === "hub" && writeEffects(target, "cleanup").length > 0),
	];
	if (request.authorization !== freshComposite.plan.hash) {
		outcomes = staticOutcomes(freshComposite.plan);
		outcomes.push({ repository: "hub", phase: "authorization", status: "failed", detail: "Composite manifest drifted before apply." });
		addPending(outcomes, freshComposite.targets, 0, "core");
		addPending(outcomes, backfillTargets, 0, "backfill");
		addPending(outcomes, documentationTargets, 0, "docs");
		addPending(outcomes, cleanupTargets, 0, "cleanup");
		return result(freshDiscovery, freshComposite.plan, [], [], outcomes, "Authorization is stale; no cross-repository writes were performed.", compositeReadiness(freshComposite));
	}

	try {
		for (const target of freshComposite.targets) await preflightPlan(target.root, target.core);
		for (const target of backfillTargets) await request.backfill.refresh(target.backfill);
		for (const target of documentationTargets) await preflightDocumentation(target.root, target.docs);
	} catch (error) {
		outcomes = staticOutcomes(freshComposite.plan);
		outcomes.push({ repository: "hub", phase: "preflight", status: "failed", detail: error.message });
		addPending(outcomes, freshComposite.targets, 0, "core");
		addPending(outcomes, backfillTargets, 0, "backfill");
		addPending(outcomes, documentationTargets, 0, "docs");
		addPending(outcomes, cleanupTargets, 0, "cleanup");
		return result(freshDiscovery, freshComposite.plan, [], [], outcomes, "Global composite preflight failed; no mutations were performed.", compositeReadiness(freshComposite));
	}

	outcomes = staticOutcomes(freshComposite.plan);
	const operations = [];
	const readiness = { hub: undefined, working: {} };
	try {
		if (request.machinePrerequisite) await request.machinePrerequisite();
		operations.push({ action: "verify", target: "machine:prerequisites", repository: "machine", root: null, phase: "machine" });
	} catch (error) {
		outcomes.push({ repository: "machine", phase: "machine", status: "failed", detail: error.message });
		addPending(outcomes, freshComposite.targets, 0, "core");
		addPending(outcomes, backfillTargets, 0, "backfill");
		addPending(outcomes, documentationTargets, 0, "docs");
		addPending(outcomes, cleanupTargets, 0, "cleanup");
		return result(freshDiscovery, freshComposite.plan, operations, [], outcomes, "Machine prerequisites failed; repositories were not touched.", readiness);
	}

	for (let index = 0; index < freshComposite.targets.length; index += 1) {
		const target = freshComposite.targets[index];
		let applyResult;
		try {
			if (request.beforePhase) await request.beforePhase({ repository: target.name, root: target.root, phase: "core" });
			const boundaryDiscovery = await discoverStandaloneRepository(target.root, freshDiscovery.machine);
			const boundaryCore = materializeReviewedMigrationPlan(buildPlan(boundaryDiscovery, target.coreChoices), target.legacy);
			if (boundaryCore.hash !== target.core.hash) throw new Error("Root fingerprint drifted immediately before its first write.");
			applyResult = await applyPlan(
				target.root,
				target.core,
				coreFailureInjection(request, target, injectedFailureRoot),
			);
			operations.push(...applyResult.operations.map(operation => ({ ...operation, repository: target.name, root: target.root, phase: "core" })));
			const verifiedDiscovery = await discoverStandaloneRepository(target.root, freshDiscovery.machine);
			recordReadiness(readiness, target, deriveReadiness(verifiedDiscovery, target.coreChoices));
			if (applyResult.failure) throw applyResult.failure.error;
			outcomes.push({ repository: target.name, phase: "core", status: target.core.effects.some(isWriteEffect) ? "completed" : "no-op" });
			addEffectOutcomes(outcomes, target.name, "core", "completed", writeEffects(target, "core"));
		} catch (error) {
			outcomes.push({ repository: target.name, phase: "core", status: "failed", detail: error.message });
			if (applyResult?.failure) {
				addEffectOutcomes(outcomes, target.name, "core", "completed", applyResult.failure.completed);
				outcomes.push({ repository: target.name, phase: "core", status: "failed", target: applyResult.failure.target, detail: error.message });
				addEffectOutcomes(outcomes, target.name, "core", "pending", applyResult.failure.pending.filter(pendingTarget => pendingTarget !== applyResult.failure.target));
			} else addEffectOutcomes(outcomes, target.name, "core", "pending", writeEffects(target, "core"));
			addPending(outcomes, freshComposite.targets, index + 1, "core");
			addPending(outcomes, backfillTargets, 0, "backfill");
			addPending(outcomes, documentationTargets, 0, "docs");
			addPending(outcomes, cleanupTargets, 0, "cleanup");
			return result(freshDiscovery, freshComposite.plan, operations, [], outcomes, "Core setup stopped at the first failure; no rollback was performed.", readiness);
		}
	}

	for (let index = 0; index < backfillTargets.length; index += 1) {
		const target = backfillTargets[index];
		let execution;
		try {
			if (request.beforePhase) await request.beforePhase({ repository: target.name, root: target.root, phase: "backfill" });
			const refreshedBackfill = await request.backfill.refresh(target.backfill);
			execution = await request.backfill.execute(refreshedBackfill);
			operations.push(...request.backfill.operations(execution).map(operation => ({ ...operation, repository: target.name, root: target.root, phase: "backfill" })));
			if (execution.errors?.length > 0) throw new Error(execution.errors[0].error);
			
			const currentReadiness = target === freshComposite.targets[0] ? readiness.hub : readiness.working[target.name];
			const updatedReadiness = request.backfill.withReadiness(currentReadiness, target.backfill, execution);
			recordReadiness(readiness, target, updatedReadiness);

			outcomes.push({ repository: target.name, phase: "backfill", status: execution.completed.length > 0 ? "completed" : "no-op" });
			addEffectOutcomes(outcomes, target.name, "backfill", "completed", execution.completed.map(id => `jira:backfill:${id}`));
		} catch (error) {
			const failure = request.backfill.failure(execution, error);
			outcomes.push({ repository: target.name, phase: "backfill", status: "failed", detail: error.message });
			addEffectOutcomes(outcomes, target.name, "backfill", "completed", failure.completed.map(id => `jira:backfill:${id}`));
			outcomes.push({ repository: target.name, phase: "backfill", status: "failed", target: failure.target, detail: error.message });
			addEffectOutcomes(outcomes, target.name, "backfill", "pending", failure.pending.filter(id => `jira:backfill:${id}` !== failure.target).map(id => `jira:backfill:${id}`));
			addPending(outcomes, backfillTargets, index + 1, "backfill");
			addPending(outcomes, documentationTargets, 0, "docs");
			addPending(outcomes, cleanupTargets, 0, "cleanup");
			return result(freshDiscovery, freshComposite.plan, operations, [], outcomes, "Local/Jira backfill stopped at the first failure.", readiness);
		}
	}
	for (let index = 0; index < documentationTargets.length; index += 1) {
		const target = documentationTargets[index];
		try {
			if (request.beforePhase) await request.beforePhase({ repository: target.name, root: target.root, phase: "docs" });
			const docsDiscovery = await discoverDocumentation(target.root, target.core.scope.projectShape, parseCanonicalConfigYaml(target.coreChoices.targetConfig));
			const docsPlan = planDocumentation(docsDiscovery);
			if (docsPlan.hash !== target.docs.hash) throw new Error("Documentation fingerprint drifted immediately before its first write.");
			const docsFailure = injectedFailureRoot === target.root && request.injectedFailure.phase === "docs_write"
				? request.injectedFailure.target
				: undefined;
			const docsOperations = await applyDocumentation(target.root, docsPlan, docsPlan.hash, docsFailure);
			operations.push(...docsOperations.map(operation => ({ ...operation, repository: target.name, root: target.root, phase: "docs" })));
			outcomes.push({ repository: target.name, phase: "docs", status: docsPlan.effects.some(isWriteEffect) ? "completed" : "no-op" });
			addEffectOutcomes(outcomes, target.name, "docs", "completed", writeEffects(target, "docs"));
		} catch (error) {
			operations.push(...(error.operations ?? []).map(operation => ({ ...operation, repository: target.name, root: target.root, phase: "docs" })));
			outcomes.push({ repository: target.name, phase: "docs", status: "failed", detail: error.message });
			const completed = error.completed ?? [];
			const pending = error.pending ?? writeEffects(target, "docs");
			addEffectOutcomes(outcomes, target.name, "docs", "completed", completed);
			if (pending.length > 0) {
				outcomes.push({ repository: target.name, phase: "docs", status: "failed", target: pending[0].target, detail: error.message });
				addEffectOutcomes(outcomes, target.name, "docs", "pending", pending.slice(1));
			}
			addPending(outcomes, documentationTargets, index + 1, "docs");
			addPending(outcomes, cleanupTargets, 0, "cleanup");
			return result(freshDiscovery, freshComposite.plan, operations, [], outcomes, "Documentation setup stopped at the first failure; no rollback was performed.", readiness);
		}
	}

	for (let index = 0; index < cleanupTargets.length; index += 1) {
		const target = cleanupTargets[index];
		try {
			const cleanup = await applyLegacyCleanup(target.root, target.legacy, target.legacy.hash, {
				sessionDiscipline: freshDiscovery.machine.sessionDiscipline === true,
				dangerousGitGuard: freshDiscovery.machine.dangerousGitGuard === true,
			});
			operations.push(...cleanup.map(operation => ({ ...operation, repository: target.name, root: target.root, phase: "cleanup" })));
			outcomes.push({ repository: target.name, phase: "cleanup", status: "completed" });
			addEffectOutcomes(outcomes, target.name, "cleanup", "completed", writeEffects(target, "cleanup"));
		} catch (error) {
			const progress = error.cleanupProgress;
			operations.push(...(progress?.completed ?? []).map(operation => ({ ...operation, repository: target.name, root: target.root, phase: "cleanup" })));
			outcomes.push({ repository: target.name, phase: "cleanup", status: "failed", target: progress?.failed?.target, detail: error.message });
			addEffectOutcomes(outcomes, target.name, "cleanup", "pending", progress?.pending ?? writeEffects(target, "cleanup"));
			addPending(outcomes, cleanupTargets, index + 1, "cleanup");
			return result(freshDiscovery, freshComposite.plan, operations, [], outcomes, "Legacy cleanup stopped at the first failure; no rollback was performed.", readiness);
		}
	}

	return result(freshDiscovery, freshComposite.plan, operations, [], outcomes, "Hub setup verified.", readiness);
}
