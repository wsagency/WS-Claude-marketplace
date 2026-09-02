import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
	CANONICAL_CONFIG_YAML,
	RECOMMENDED_LOCAL_CHOICES,
	discoverStandaloneRepository,
	runSetupTransaction,
} from "./transaction.mjs";
import {
	parseCanonicalConfigYaml,
	serializeCanonicalConfig,
	validateCanonicalConfig,
} from "./config.mjs";
import { applyDocumentation, discoverDocumentation, planDocumentation } from "../ws-docs-bootstrap/transaction.mjs";

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
	if (path.isAbsolute(repository.path) || (requestedRoot !== hubRoot && !requestedRoot.startsWith(`${hubRoot}${path.sep}`))) {
		errors.push(`Registered path escapes the hub root: ${repository.path}.`);
	} else {
		try {
			const details = await fs.stat(requestedRoot);
			if (!details.isDirectory()) errors.push(`Registered path is not a directory: ${repository.path}.`);
			else {
				await fs.access(requestedRoot, fsConstants.R_OK | fsConstants.W_OK | fsConstants.X_OK);
				resolvedRoot = await fs.realpath(requestedRoot);
				if (resolvedRoot !== hubRoot && !resolvedRoot.startsWith(`${hubRoot}${path.sep}`)) errors.push(`Registered path resolves outside the hub root: ${repository.path}.`);
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
	const roots = new Map();
	const origins = new Map();
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
	const blockers = [...repository.preflightErrors.map(reason => ({ repository: repository.name, root: repository.root, reason }))];
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

function targetFingerprint(repository, corePlan, docsPlan) {
	return sha256(JSON.stringify({
		identity: repository.identity,
		head: repository.git.head,
		dirty: repository.git.dirty,
		core: corePlan?.hash ?? null,
		docs: docsPlan?.hash ?? null,
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

function plannedPaths(corePlan, docsPlan) {
	const managedRanges = {
		"dev-docs/agents/issue-tracker.md": "managed:WS-MANAGED:issue-tracker",
		"dev-docs/agents/triage-labels.md": "managed:WS-MANAGED:triage-labels",
		"dev-docs/agents/domain.md": "managed:WS-MANAGED:domain",
		"AGENTS.md": "managed:WS-AGENT-SKILLS",
	};
	return [
		...(corePlan?.effects ?? []).map(effect => ({ ...effect, phase: "core" })),
		...(docsPlan?.effects ?? []).map(effect => ({ ...effect, phase: "docs" })),
	]
		.filter(effect => effect.kind !== "state" && effect.classification !== "SKIP")
		.map(effect => ({
			phase: effect.phase,
			target: effect.target,
			classification: effect.classification,
			range: managedRanges[effect.target] ?? (effect.kind === "file" ? "full-file" : "directory"),
			diff: effect.diff,
		}));
}

async function buildComposite(discovery, choices) {
	const removed = new Set(choices.removedRepositories ?? []);
	const selected = [discovery.hub, ...discovery.working.filter(repository => !removed.has(repository.name))];
	const excluded = [
		...discovery.excluded,
		...discovery.working.filter(repository => removed.has(repository.name)).map(repository => ({ name: repository.name, type: "working", reason: "Explicitly excluded from this setup run." })),
	];
	const documentation = choices.documentation === true;
	const existingHubConfig = discovery.hub.entries[".wsagency/config.yaml"]?.kind === "file"
		? discovery.hub.entries[".wsagency/config.yaml"].content
		: undefined;
	let hubConfig = CANONICAL_CONFIG_YAML;
	let hubConfigError = null;
	try {
		hubConfig = mergeConfig(CANONICAL_CONFIG_YAML, existingHubConfig ? normalizeMigrationConfig(existingHubConfig) : undefined);
		if (documentation && discovery.hub.preflightErrors.length === 0) {
			const docsDiscovery = await discoverDocumentation(discovery.hub.root, discovery.hub.projectShape);
			hubConfig = configWithFragment(hubConfig, planDocumentation(docsDiscovery).configFragment);
		}
	} catch (error) {
		hubConfigError = `Cannot materialize hub canonical configuration: ${error.message}`;
	}
	const targets = [];
	const blockers = [];
	for (const repository of selected) {
		const localErrors = [...repository.preflightErrors];
		if (repository === discovery.hub && hubConfigError) localErrors.push(hubConfigError);
		let targetConfig = hubConfig;
		if (repository !== discovery.hub) {
			const explicit = repository.entries[".wsagency/config.yaml"]?.kind === "file" ? repository.entries[".wsagency/config.yaml"].content : undefined;
			try {
				targetConfig = mergeConfig(hubConfig, explicit ? normalizeMigrationConfig(explicit) : undefined);
			} catch (error) {
				localErrors.push(`Cannot materialize canonical configuration: ${error.message}`);
			}
		}
		const plannedRepository = { ...repository, preflightErrors: localErrors };
		const coreChoices = { ...RECOMMENDED_LOCAL_CHOICES, ...(repository === discovery.hub ? choices.hub : choices.working?.[repository.name]), targetConfig };
		const transaction = localErrors.length === 0
			? await runSetupTransaction({ root: repository.root, discovery: repository, choices: coreChoices })
			: { plan: undefined, operations: [], requiresConfirmation: false, report: "Preflight blocked." };
		let docsPlan;
		if (documentation && transaction.plan) {
			const docsDiscovery = await discoverDocumentation(repository.root, repository.projectShape);
			docsPlan = planDocumentation(projectDocumentationDiscovery(docsDiscovery, transaction.plan));
		}
		const repositoryBlockers = transactionBlockers(plannedRepository, transaction, docsPlan);
		blockers.push(...repositoryBlockers);
		targets.push({
			name: repository.name,
			root: repository.root,
			role: repository === discovery.hub ? "hub" : "working",
			identity: repository.identity,
			fingerprint: targetFingerprint(repository, transaction.plan, docsPlan),
			coreChoices,
			core: transaction.plan,
			docs: docsPlan,
			plannedPaths: plannedPaths(transaction.plan, docsPlan),
			dirtyPaths: [...repository.git.dirty],
			blockers: repositoryBlockers,
			transaction,
		});
	}
	if (discovery.registryError) blockers.unshift({ repository: "hub", root: discovery.root, target: "project.yaml", reason: discovery.registryError });
	const hashPayload = {
		registryFingerprint: discovery.registryFingerprint,
		removed: [...removed],
		documentation,
		targets: targets.map(target => ({
			name: target.name,
			identity: target.identity,
			fingerprint: target.fingerprint,
			core: target.core?.hash ?? null,
			docs: target.docs?.hash ?? null,
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
			working: targets.slice(1).map(target => ({ name: target.name, plan: target.core, docs: target.docs })),
			targets: targets.map(({ transaction, coreChoices, ...target }) => target),
			excluded,
		},
		targets,
		blockers,
	};
}

function staticOutcomes(plan) {
	const outcomes = plan.excluded.map(repository => ({ repository: repository.name, phase: "preflight", status: "excluded", detail: repository.reason }));
	for (const target of plan.targets) {
		for (const [phase, effects] of [["core", target.core?.effects ?? []], ["docs", target.docs?.effects ?? []]]) {
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
	return (phase === "core" ? target.core?.effects : target.docs?.effects)?.filter(isWriteEffect) ?? [];
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
	const composite = await buildComposite(request.discovery, choices);
	const injectedFailureRoot = request.injectedFailure?.targetRoot
		? await fs.realpath(path.resolve(request.injectedFailure.targetRoot)).catch(() => path.resolve(request.injectedFailure.targetRoot))
		: null;
	let outcomes = staticOutcomes(composite.plan);
	if (composite.blockers.length > 0) {
		for (const blocker of composite.blockers) outcomes.push({ repository: blocker.repository, phase: "preflight", status: "failed", target: blocker.target, detail: blocker.reason });
		return result(request.discovery, composite.plan, [], composite.blockers, outcomes, "Hub setup is blocked before authorization.");
	}
	const requiresConfirmation = composite.targets.some(target =>
		[...(target.core?.effects ?? []), ...(target.docs?.effects ?? [])].some(isWriteEffect),
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
	const freshComposite = await buildComposite(freshDiscovery, choices);
	if (request.authorization !== freshComposite.plan.hash) {
		outcomes = staticOutcomes(freshComposite.plan);
		outcomes.push({ repository: "hub", phase: "authorization", status: "failed", detail: "Composite manifest drifted before apply." });
		addPending(outcomes, freshComposite.targets, 0, "core");
		if (choices.documentation === true) addPending(outcomes, freshComposite.targets, 0, "docs");
		return result(freshDiscovery, freshComposite.plan, [], [], outcomes, "Authorization is stale; no cross-repository writes were performed.", compositeReadiness(freshComposite));
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
		if (choices.documentation === true) addPending(outcomes, freshComposite.targets, 0, "docs");
		return result(freshDiscovery, freshComposite.plan, operations, [], outcomes, "Machine prerequisites failed; repositories were not touched.", readiness);
	}

	for (let index = 0; index < freshComposite.targets.length; index += 1) {
		const target = freshComposite.targets[index];
		let transaction;
		try {
			if (request.beforePhase) await request.beforePhase({ repository: target.name, root: target.root, phase: "core" });
			const boundaryDiscovery = await discoverStandaloneRepository(target.root, freshDiscovery.machine);
			const boundaryPlan = await runSetupTransaction({ root: target.root, discovery: boundaryDiscovery, choices: target.coreChoices });
			if (boundaryPlan.plan?.hash !== target.core?.hash) throw new Error("Root fingerprint drifted immediately before its first write.");
			transaction = await runSetupTransaction({
				root: target.root,
				discovery: boundaryDiscovery,
				choices: target.coreChoices,
				authorization: target.core.hash,
				injectedFailure: coreFailureInjection(request, target, injectedFailureRoot),
			});
			operations.push(...transaction.operations.map(operation => ({ ...operation, repository: target.name, root: target.root, phase: "core" })));
			recordReadiness(readiness, target, transaction.readiness);
			if (transactionFailed(transaction)) throw new Error(transaction.report);
			outcomes.push({ repository: target.name, phase: "core", status: target.core.effects.some(isWriteEffect) ? "completed" : "no-op" });
			addEffectOutcomes(outcomes, target.name, "core", "completed", writeEffects(target, "core"));
		} catch (error) {
			outcomes.push({ repository: target.name, phase: "core", status: "failed", detail: error.message });
			if (transaction?.failure) {
				addEffectOutcomes(outcomes, target.name, "core", "completed", transaction.failure.completed);
				outcomes.push({ repository: target.name, phase: "core", status: "failed", target: transaction.failure.target, detail: transaction.failure.error });
				addEffectOutcomes(
					outcomes,
					target.name,
					"core",
					"pending",
					transaction.failure.pending.filter(pendingTarget => pendingTarget !== transaction.failure.target),
				);
			} else addEffectOutcomes(outcomes, target.name, "core", "pending", writeEffects(target, "core"));
			addPending(outcomes, freshComposite.targets, index + 1, "core");
			if (choices.documentation === true) addPending(outcomes, freshComposite.targets, 0, "docs");
			return result(freshDiscovery, freshComposite.plan, operations, [], outcomes, "Core setup stopped at the first failure; no rollback was performed.", readiness);
		}
	}

	if (choices.documentation === true) {
		for (let index = 0; index < freshComposite.targets.length; index += 1) {
			const target = freshComposite.targets[index];
			try {
				if (request.beforePhase) await request.beforePhase({ repository: target.name, root: target.root, phase: "docs" });
				if (!target.core.effects.some(isWriteEffect)) {
					const boundaryDiscovery = await discoverStandaloneRepository(target.root, freshDiscovery.machine);
					const boundaryPlan = await runSetupTransaction({ root: target.root, discovery: boundaryDiscovery, choices: target.coreChoices });
					if (boundaryPlan.plan?.hash !== target.core.hash) throw new Error("Root fingerprint drifted immediately before documentation performed the first write.");
				}
				const docsDiscovery = await discoverDocumentation(target.root, target.core.scope.projectShape);
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
				} else addEffectOutcomes(outcomes, target.name, "docs", "pending", writeEffects(target, "docs"));
				addPending(outcomes, freshComposite.targets, index + 1, "docs");
				return result(freshDiscovery, freshComposite.plan, operations, [], outcomes, "Documentation setup stopped at the first failure; no rollback was performed.", readiness);
			}
		}
	}

	return result(freshDiscovery, freshComposite.plan, operations, [], outcomes, "Hub setup verified.", readiness);
}
