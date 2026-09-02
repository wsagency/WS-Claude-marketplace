import { createHash } from "node:crypto";
import { validateCanonicalConfigObject } from "./config.mjs";
import { planDomain, planTriage } from "./routing.mjs";

const PHASES = Object.freeze(["prepare", "cutover", "cleanup"]);
const MUTATION_CLASSIFICATIONS = new Set(["CREATE", "UPDATE", "DELETE"]);
const CANONICAL_DOMAINS = Object.freeze(["tracker", "documentation", "runtime"]);
const DOMAIN_VALUES = new Set([...CANONICAL_DOMAINS, "all"]);
const TRACKER_FIELD_PREFIXES = Object.freeze(["tracker.", "jira.", "triage.", "domain.", "commit.jira.", "ui.session_start_dashboard"]);
const ENABLEABLE_SECTION_REQUIRED_FIELDS = Object.freeze({
	docs: Object.freeze(["user_track", "dev_track", "default_audience", "default_scope", "adr_for_arch_changes"]),
	jira: Object.freeze(["project", "default_issue_type", "sync"]),
});

export class ReconfigureError extends Error {
	constructor(message, code) {
		super(message);
		this.code = code;
	}
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function leafPaths(value, prefix = "") {
	const paths = [];
	for (const key of Object.keys(value).sort()) {
		if (key === "schema_version" && prefix === "") continue;
		const fieldPath = prefix ? `${prefix}.${key}` : key;
		const child = value[key];
		if (child && typeof child === "object" && !Array.isArray(child)) paths.push(...leafPaths(child, fieldPath));
		else paths.push(fieldPath);
	}
	return paths;
}

function valueAtPath(value, fieldPath) {
	return fieldPath.split(".").reduce((current, key) => current?.[key], value);
}

function setValueAtPath(value, fieldPath, proposed) {
	const keys = fieldPath.split(".");
	const leaf = keys.pop();
	const parent = keys.reduce((current, key) => {
		if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) current[key] = {};
		return current[key];
	}, value);
	parent[leaf] = structuredClone(proposed);
}

function materializeProposedConfig(config, selectedFields, values) {
	const proposed = structuredClone(config);
	for (const field of selectedFields) setValueAtPath(proposed, field, values[field]);
	return proposed;
}

function sameValue(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function validationError(config) {
	if (config == null) return new ReconfigureError("Canonical configuration is missing. Run ordinary /ws-setup first.", "ERR_MISSING_CONFIG");
	if (typeof config === "object" && config !== null && !Object.hasOwn(config, "schema_version") && (Object.hasOwn(config, "schema") || Object.hasOwn(config, "version"))) {
		return new ReconfigureError("Legacy configuration detected. Run ordinary /ws-setup migration first.", "ERR_LEGACY_CONFIG");
	}
	const validation = validateCanonicalConfigObject(config);
	if (validation.status === "older") return new ReconfigureError("Older schema detected. Run ordinary /ws-setup migration first.", "ERR_OLDER_SCHEMA");
	if (validation.status === "future") return new ReconfigureError("Future schema detected. Update the WS package before reconfiguring.", "ERR_FUTURE_SCHEMA");
	if (validation.status !== "valid") return new ReconfigureError("Canonical configuration is malformed or incomplete. Run ordinary /ws-setup repair first.", "ERR_MALFORMED_CONFIG");
	return null;
}

function fieldBelongsToDomain(field, domain) {
	if (domain === "tracker") return TRACKER_FIELD_PREFIXES.some(prefix => field === prefix || field.startsWith(prefix));
	if (domain === "documentation") return field.startsWith("docs.") || field.startsWith("changelog.");
	return field.startsWith("runtime.");
}

function normalizeDomains(choices) {
	if (!choices || Object.hasOwn(choices, "domain") || !Array.isArray(choices.domains) || choices.domains.length === 0) {
		throw new ReconfigureError("One or more reconfiguration domains are required through choices.domains.", "ERR_INVALID_DOMAINS");
	}
	if (choices.domains.some(domain => !DOMAIN_VALUES.has(domain))) {
		throw new ReconfigureError("Reconfiguration domains must be tracker, documentation, runtime, or all.", "ERR_INVALID_DOMAINS");
	}
	const selected = choices.domains.includes("all") ? new Set(CANONICAL_DOMAINS) : new Set(choices.domains);
	return CANONICAL_DOMAINS.filter(domain => selected.has(domain));
}

function selectedRepositories(snapshot, choices) {
	if (snapshot.shape !== "hub_root") return [snapshot.repositoryId || "current"];
	if (!Array.isArray(snapshot.repositories)) {
		throw new ReconfigureError("Hub-root reconfiguration requires a discovered repository eligibility inventory.", "ERR_INVALID_HUB_SCOPE");
	}
	const inventory = new Map();
	for (const repository of snapshot.repositories) {
		if (!repository || typeof repository.id !== "string" || inventory.has(repository.id)) {
			throw new ReconfigureError("Hub repository eligibility inventory is malformed or ambiguous.", "ERR_INVALID_HUB_SCOPE");
		}
		inventory.set(repository.id, repository);
	}
	const hubs = [...inventory.values()].filter(repository => repository.type === "hub" && repository.present === true);
	if (hubs.length !== 1) {
		throw new ReconfigureError("The discovered hub target is missing or ambiguous.", "ERR_INVALID_HUB_SCOPE");
	}
	const hub = hubs[0];
	const requested = Array.isArray(choices.repositories) && choices.repositories.length > 0 ? [...new Set(choices.repositories)] : [hub.id];
	for (const id of requested) {
		const repository = inventory.get(id);
		const eligible = repository?.present === true && (repository === hub || repository.type === "working");
		if (!eligible) {
			throw new ReconfigureError(`Requested repository ${id} is unknown, excluded, or not locally present.`, "ERR_INELIGIBLE_REPOSITORY_SCOPE");
		}
	}
	return requested;
}

function phaseOrder(phase) {
	return phase === "prepare" ? 10 : phase === "cutover" ? 20 : 30;
}

function inferPhase(effect) {
	if (PHASES.includes(effect.phase)) return effect.phase;
	if (effect.order < 10) return "prepare";
	if (effect.order >= 30) return "cleanup";
	return "cutover";
}

function normalizeEffect(effect, sequence) {
	const phase = inferPhase(effect);
	const operation = effect.operation || effect.payload?.operation || effect.classification.toLowerCase();
	return {
		...effect,
		id: effect.id || `${phase}:${effect.target}:${operation}`,
		phase,
		order: effect.order ?? phaseOrder(phase) + sequence,
	};
}

function runtimeEffects(snapshot, machine, choices, selectedRepos) {
	const effects = [];
	const selected = new Set(choices.fields || []);
	if (!selected.has("runtime.session_discipline") && !selected.has("runtime.dangerous_git_guard")) return effects;

	if (selected.has("runtime.session_discipline") && machine?.sessionDisciplineDelivered === false) {
		effects.push({
			id: "prepare:machine:session-discipline:deliver",
			order: 1,
			phase: "prepare",
			target: "machine:session_discipline_delivery",
			kind: "state",
			classification: "CREATE",
			reason: "Deliver required session discipline in the active harness before cutover.",
			diff: "missing -> delivered",
			fingerprint: machine.sessionDisciplineFingerprint ?? null,
			payload: { operation: "deliver_runtime_policy" },
		});
	}

	const proposedGuard = choices.values?.["runtime.dangerous_git_guard"];
	if (proposedGuard === "enabled" && machine?.dangerousGitGuardDelivered === false) {
		effects.push({
			id: "prepare:machine:dangerous-git-guard:deliver",
			order: 2,
			phase: "prepare",
			target: "machine:dangerous_git_guard_delivery",
			kind: "state",
			classification: "CREATE",
			reason: "Deliver the required dangerous-git guard in the active harness before cutover.",
			diff: "missing -> delivered",
			fingerprint: machine.dangerousGitGuardFingerprint ?? null,
			payload: { operation: "deliver_runtime_policy" },
		});
	}

	if (proposedGuard !== "disabled") return effects;
	const owners = machine?.sharedGuardsOwnedBy ?? [];
	const foreignOwners = owners.filter(owner => !selectedRepos.includes(owner));
	const exactOwnedDuplicate = machine?.sharedGuardExactGenerated === true && owners.length > 0 && foreignOwners.length === 0;
	const authorized = choices.authorizeOwnedCleanup === true;
	if (!exactOwnedDuplicate || !authorized) {
		effects.push({
			id: "cleanup:machine:shared-guard:preserve",
			order: 30,
			phase: "cleanup",
			target: "machine:sharedGuard",
			kind: "state",
			classification: "PRESERVE",
			reason: foreignOwners.length > 0
				? "Shared protection is used by another repository."
				: "Runtime cleanup is not an exact authorized repository-owned duplicate.",
			diff: "unchanged",
			fingerprint: machine?.sharedGuardFingerprint ?? null,
		});
		return effects;
	}
	effects.push({
		id: "cleanup:machine:shared-guard:delete",
		order: 30,
		phase: "cleanup",
		target: "machine:sharedGuard",
		kind: "state",
		classification: "DELETE",
		reason: "Remove the exact authorized repository-owned generated duplicate after cutover.",
		diff: "removed",
		fingerprint: machine?.sharedGuardFingerprint ?? null,
		destructive: true,
		payload: { operation: "remove_exact_generated_duplicate" },
	});
	return effects;
}

function normalizedDependencyClosure(config, choices, contribution) {
	const closure = [...(contribution.dependencyClosure || [])];
	if ((choices.fields || []).includes("runtime.dangerous_git_guard")) {
		closure.push({
			field: "runtime.session_discipline",
			reason: "Dangerous-git guard delivery depends on active session discipline.",
			resolution: (choices.fields || []).includes("runtime.session_discipline") ? "selected" : "retained-compatible",
			current: valueAtPath(config, "runtime.session_discipline"),
		});
	}
	const unique = new Map();
	for (const item of closure) {
		const normalized = typeof item === "string" ? { field: item, reason: "Required dependency.", resolution: "retained-compatible" } : item;
		unique.set(normalized.field, normalized);
	}
	if (choices.cancelDependent && unique.size > 0) {
		throw new ReconfigureError("Required dependent choice cancelled. The proposed change was cancelled without resetting state.", "ERR_DEPENDENT_CANCELLED");
	}
	return [...unique.values()].sort((left, right) => left.field.localeCompare(right.field));
}

function effectAuthorizationView(effect) {
	return {
		id: effect.id,
		repositoryId: effect.repositoryId ?? null,
		target: effect.target,
		kind: effect.kind,
		classification: effect.classification,
		phase: effect.phase,
		operation: effect.operation || effect.payload?.operation || null,
		dependencies: effect.dependencies || [],
		correlationToken: effect.payload?.correlationToken || effect.correlationToken || null,
		afterDigest: effect.after === undefined ? null : sha256(String(effect.after)),
		payloadDigest: effect.payload === undefined ? null : sha256(JSON.stringify(effect.payload)),
		fingerprint: effect.fingerprint ?? null,
		remoteFingerprint: effect.remoteFingerprint ?? null,
	};
}

function collectFingerprints(effects) {
	const fingerprints = { local: {}, machine: {}, remote: {} };
	for (const effect of effects) {
		if (!isMutation(effect) && effect.classification !== "PRESERVE") continue;
		if (effect.target.startsWith("machine:")) fingerprints.machine[effect.id] = effect.fingerprint ?? null;
		else if (isRemoteEffect(effect)) fingerprints.remote[effect.id] = effect.remoteFingerprint ?? effect.fingerprint ?? null;
		else fingerprints.local[effect.id] = effect.fingerprint ?? null;
	}
	return fingerprints;
}

function isMutation(effect) {
	return MUTATION_CLASSIFICATIONS.has(effect.classification);
}

function isRemoteEffect(effect) {
	return effect.remoteFingerprint !== undefined || effect.target.startsWith("remote:") || effect.payload?.external === true;
}

function createSingleReconfigurePlan(config, snapshot, machine, choices, contribution = {}) {
	const error = validationError(config);
	if (error) throw error;
	if (!snapshot || !["standalone", "hub_root", "hub_subrepository"].includes(snapshot.shape)) {
		throw new ReconfigureError("A validated repository scope is required.", "ERR_INVALID_SCOPE");
	}
	if (!choices || !Array.isArray(choices.fields)) {
		throw new ReconfigureError("Concrete field selection is required.", "ERR_MISSING_FIELD_SELECTION");
	}
	const domains = normalizeDomains(choices);
	const scope = selectedRepositories(snapshot, choices);
	const selectedFields = [...new Set(choices.fields)].sort();
	for (const [section, requiredLeaves] of Object.entries(ENABLEABLE_SECTION_REQUIRED_FIELDS)) {
		const selectedSectionFields = selectedFields.filter(field => field.startsWith(`${section}.`));
		if (Object.hasOwn(config, section) || selectedSectionFields.length === 0) continue;
		const missing = requiredLeaves
			.map(leaf => `${section}.${leaf}`)
			.filter(field => !selectedFields.includes(field));
		if (missing.length > 0) {
			throw new ReconfigureError(
				`Enabling absent ${section} policy requires every required leaf in one validated change: ${missing.join(", ")}.`,
				"ERR_INCOMPLETE_SECTION_ENABLEMENT",
			);
		}
	}
	const configSectionRemovals = new Map();
	for (const removal of contribution.configSectionRemovals || []) {
		if (!removal || typeof removal.section !== "string" || !/^[a-z][a-z0-9_]*$/.test(removal.section) || removal.section === "schema_version") {
			throw new ReconfigureError("Structural configuration removal requires a canonical top-level section.", "ERR_INVALID_SECTION_REMOVAL");
		}
		configSectionRemovals.set(removal.section, removal);
	}
	if (selectedFields.some(field => configSectionRemovals.has(field.split(".")[0]))) {
		throw new ReconfigureError("A canonical section cannot be removed while one of its fields is selected.", "ERR_CONFLICTING_SECTION_CHANGE");
	}
	if (selectedFields.some(field => !domains.some(domain => fieldBelongsToDomain(field, domain)))) {
		throw new ReconfigureError("Every selected field must belong to at least one selected domain.", "ERR_FIELD_OUTSIDE_DOMAINS");
	}
	const knownFields = new Set(leafPaths(config));
	for (const field of selectedFields) {
		if (!Object.hasOwn(choices.values ?? {}, field)) {
			throw new ReconfigureError(`A proposed value is required for ${field}.`, "ERR_MISSING_PROPOSED_VALUE");
		}
	}
	const selectedValues = Object.fromEntries(selectedFields.map(field => [field, choices.values[field]]));
	const proposedConfig = materializeProposedConfig(config, selectedFields, selectedValues);
	for (const section of configSectionRemovals.keys()) delete proposedConfig[section];
	const proposedValidation = validateCanonicalConfigObject(proposedConfig);
	if (proposedValidation.status !== "valid") {
		const details = (proposedValidation.errors || []).map(issue => issue.message).filter(Boolean).join(" ");
		const selectedUnknown = (proposedValidation.errors || []).some(issue => issue.code === "unknown_key" && selectedFields.some(field => issue.path === `$.${field}` || field.startsWith(`${issue.path.slice(2)}.`)));
		throw new ReconfigureError(
			`Proposed canonical configuration is invalid.${details ? ` ${details}` : ""}`,
			selectedUnknown ? "ERR_UNKNOWN_FIELD" : "ERR_INVALID_PROPOSED_CONFIG",
		);
	}

	const effects = [];
	for (const [section, removal] of configSectionRemovals) {
		const target = `config:${section}`;
		const aligned = !Object.hasOwn(config, section);
		effects.push({
			id: `cutover:${target}:remove`,
			order: 20,
			phase: "cutover",
			target,
			kind: "state",
			classification: aligned ? "NO-OP" : "UPDATE",
			reason: aligned ? `Canonical ${section} policy is already absent.` : removal.reason,
			before: config[section],
			diff: aligned ? "unchanged" : "selected section removed; surrounding bytes unchanged",
			fingerprint: snapshot.entries?.[target]?.fingerprint ?? null,
			dependencies: [...(removal.dependencies || [])],
			payload: {
				operation: "remove_config_section",
				section,
				preserveUnselected: true,
				preserveCommentsAndOrder: true,
			},
		});
	}
	for (const field of [...new Set([...knownFields, ...selectedFields])].sort()) {
		if (configSectionRemovals.has(field.split(".")[0])) continue;
		const target = `config:${field}`;
		const current = valueAtPath(config, field);
		if (!selectedFields.includes(field)) {
			effects.push({
				id: `preserve:${target}`,
				order: 5,
				phase: "prepare",
				target,
				kind: "state",
				classification: "PRESERVE",
				reason: "Unselected canonical field.",
				diff: "unchanged",
				fingerprint: snapshot.entries?.[target]?.fingerprint ?? null,
			});
			continue;
		}
		const proposed = selectedValues[field];
		const aligned = sameValue(current, proposed);
		effects.push({
			id: `cutover:${target}:set`,
			order: 20,
			phase: "cutover",
			target,
			kind: "state",
			classification: aligned ? "NO-OP" : "UPDATE",
			reason: aligned ? "Selected field is already aligned." : "Apply only the selected canonical field while preserving the surrounding structure.",
			diff: aligned ? "unchanged" : `${JSON.stringify(current)} -> ${JSON.stringify(proposed)}`,
			fingerprint: snapshot.entries?.[target]?.fingerprint ?? null,
			dependencies: [...(contribution.fieldDependencies?.[field] || [])],
			payload: { operation: "set_config_field", field, value: proposed, preserveUnselected: true },
		});
	}

	const contributedEffects = [
		...(contribution.effects || []),
		...runtimeEffects(snapshot, machine, choices, scope),
	];
	const contributedTargets = new Set(contributedEffects.map(effect => effect.target));
	for (const target of Object.keys(snapshot.entries ?? {}).sort()) {
		if (target.startsWith("config:") || contributedTargets.has(target)) continue;
		effects.push({
			id: `preserve:${target}`,
			order: 5,
			phase: "prepare",
			target,
			kind: "state",
			classification: "PRESERVE",
			reason: "Unselected artifact or managed fragment.",
			diff: "unchanged",
			fingerprint: snapshot.entries[target]?.fingerprint ?? null,
		});
	}
	effects.push(...contributedEffects);

	const normalizedEffects = effects.map(normalizeEffect);
	normalizedEffects.sort((left, right) => phaseOrder(left.phase) - phaseOrder(right.phase) || left.order - right.order || left.id.localeCompare(right.id));
	const blockerMap = new Map();
	for (const blocker of contribution.blockers || []) blockerMap.set(blocker.id, blocker);
	for (const effect of normalizedEffects.filter(effect => effect.classification === "BLOCKING_CONFLICT")) {
		blockerMap.set(effect.id, { id: effect.id, target: effect.target, reason: effect.reason });
	}
	const blockers = [...blockerMap.values()];
	const dependencyClosure = normalizedDependencyClosure(config, choices, contribution);
	const authorizationPayload = {
		scope,
		domains,
		selectedFields,
		valuesDigest: sha256(JSON.stringify(selectedValues)),
		dependencyClosure,
		effects: normalizedEffects.map(effectAuthorizationView),
	};
	const hash = sha256(JSON.stringify(authorizationPayload));
	const changed = normalizedEffects.some(isMutation);
	return {
		effects: normalizedEffects,
		hash,
		authorizationPayload,
		choicesHash: sha256(JSON.stringify({ domains, fields: selectedFields, values: selectedValues, repositories: scope })),
		requiresConfirmation: blockers.length === 0 && changed,
		dependencyClosure,
		scope,
		domains,
		fingerprints: collectFingerprints(normalizedEffects),
		itemIds: normalizedEffects.map(effect => effect.id),
		correlationTokens: normalizedEffects.map(effect => effect.payload?.correlationToken || effect.correlationToken).filter(Boolean),
		blockers,
		configDigest: sha256(JSON.stringify(config)),
		proposedConfigDigest: sha256(JSON.stringify(proposedConfig)),
		report: blockers.length > 0 ? "Reconfiguration is blocked before confirmation." : changed ? "Plan created. Requires confirmation." : "Aligned reconfiguration. No changes required.",
	};
}

function repositoryRecord(snapshot, repositoryId) {
	return snapshot.repositoryStates?.[repositoryId]
		|| snapshot.targets?.[repositoryId]
		|| snapshot.repositories?.find(repository => repository.id === repositoryId)
		|| null;
}

function repositoryConfig(config, snapshot, repositoryId, multiple) {
	if (!multiple) return config;
	return config?.[repositoryId]
		|| config?.repositories?.[repositoryId]
		|| snapshot.configs?.[repositoryId]
		|| repositoryRecord(snapshot, repositoryId)?.config
		|| null;
}

function repositoryMachine(machine, snapshot, repositoryId, multiple) {
	if (!multiple && machine && !machine.repositories && !machine[repositoryId]) return machine;
	return machine?.[repositoryId]
		|| machine?.repositories?.[repositoryId]
		|| repositoryRecord(snapshot, repositoryId)?.machine
		|| {};
}

function repositoryChoices(choices, repositoryId) {
	const specific = choices.repositoryChoices?.[repositoryId] || choices.byRepository?.[repositoryId];
	if (!specific) return choices;
	const { repositoryChoices: _repositoryChoices, byRepository: _byRepository, ...shared } = choices;
	return { ...shared, ...specific, repositories: undefined };
}

function repositorySnapshot(snapshot, repositoryId, multiple) {
	if (!multiple) return snapshot;
	const record = repositoryRecord(snapshot, repositoryId);
	const entries = record && Object.hasOwn(record, "entries") ? record.entries
		: Object.hasOwn(snapshot.repositoryEntries || {}, repositoryId) ? snapshot.repositoryEntries[repositoryId]
			: Object.hasOwn(snapshot.entriesByRepository || {}, repositoryId) ? snapshot.entriesByRepository[repositoryId]
				: null;
	if (!entries) {
		throw new ReconfigureError(
			`Repository ${repositoryId} is missing a repository-qualified discovery snapshot.`,
			"ERR_UNQUALIFIED_REPOSITORY_STATE",
		);
	}
	return { shape: "standalone", repositoryId, entries };
}

function repositoryContexts(config, snapshot, machine, choices) {
	const scope = selectedRepositories(snapshot, choices);
	const hubId = snapshot.repositories?.find(repository => repository.type === "hub" && repository.present === true)?.id;
	const qualified = snapshot.shape === "hub_root" && (
		scope.length > 1
		|| scope[0] !== hubId
		|| config?.schema_version === undefined
	);
	if (!qualified) {
		return [{
			repositoryId: scope[0],
			config,
			snapshot,
			machine: repositoryMachine(machine, snapshot, scope[0], false),
			choices,
		}];
	}
	return scope.map(repositoryId => ({
		repositoryId,
		config: repositoryConfig(config, snapshot, repositoryId, true),
		snapshot: repositorySnapshot(snapshot, repositoryId, true),
		machine: repositoryMachine(machine, snapshot, repositoryId, true),
		choices: repositoryChoices(choices, repositoryId),
	}));
}

function qualifyRepositoryPlan(repositoryId, result) {
	const qualify = id => `${repositoryId}::${id}`;
	const effects = result.effects.map(effect => ({
		...effect,
		id: qualify(effect.id),
		repositoryId,
		dependencies: (effect.dependencies || []).map(qualify),
	}));
	return {
		...result,
		effects,
		dependencyClosure: result.dependencyClosure.map(dependency => ({
			...dependency,
			repositoryId,
			...(dependency.effectId ? { effectId: qualify(dependency.effectId) } : {}),
		})),
		blockers: result.blockers.map(blocker => ({ ...blocker, id: qualify(blocker.id), repositoryId })),
	};
}

export function createReconfigurePlan(config, snapshot, machine, choices, contribution = {}) {
	if (!snapshot || !["standalone", "hub_root", "hub_subrepository"].includes(snapshot.shape)) {
		throw new ReconfigureError("A validated repository scope is required.", "ERR_INVALID_SCOPE");
	}
	const contexts = repositoryContexts(config, snapshot, machine, choices);
	if (contexts.length === 1) {
		return createSingleReconfigurePlan(
			contexts[0].config,
			contexts[0].snapshot,
			contexts[0].machine,
			contexts[0].choices,
			contribution,
		);
	}
	const repositoryPlans = {};
	for (const context of contexts) {
		const repositoryContribution = contribution.repositoryContributions?.[context.repositoryId]
			|| contribution.byRepository?.[context.repositoryId]
			|| {};
		repositoryPlans[context.repositoryId] = qualifyRepositoryPlan(
			context.repositoryId,
			createSingleReconfigurePlan(context.config, context.snapshot, context.machine, context.choices, repositoryContribution),
		);
	}
	const effects = contexts.flatMap(context => repositoryPlans[context.repositoryId].effects);
	effects.sort((left, right) => phaseOrder(left.phase) - phaseOrder(right.phase) || left.order - right.order || left.id.localeCompare(right.id));
	const dependencyClosure = contexts.flatMap(context => repositoryPlans[context.repositoryId].dependencyClosure);
	const blockers = contexts.flatMap(context => repositoryPlans[context.repositoryId].blockers);
	const domains = CANONICAL_DOMAINS.filter(domain => contexts.some(context => repositoryPlans[context.repositoryId].domains.includes(domain)));
	const scope = contexts.map(context => context.repositoryId);
	const authorizationPayload = {
		scope,
		domains,
		repositories: Object.fromEntries(contexts.map(context => {
			const result = repositoryPlans[context.repositoryId];
			return [context.repositoryId, {
				choicesHash: result.choicesHash,
				configDigest: result.configDigest,
				proposedConfigDigest: result.proposedConfigDigest,
			}];
		})),
		dependencyClosure,
		effects: effects.map(effectAuthorizationView),
	};
	const hash = sha256(JSON.stringify(authorizationPayload));
	const choicesHash = sha256(JSON.stringify({
		scope,
		repositories: Object.fromEntries(contexts.map(context => [context.repositoryId, repositoryPlans[context.repositoryId].choicesHash])),
	}));
	const fingerprintsByRepository = Object.fromEntries(contexts.map(context => [
		context.repositoryId,
		collectFingerprints(repositoryPlans[context.repositoryId].effects),
	]));
	const changed = effects.some(isMutation);
	return {
		effects,
		hash,
		authorizationPayload,
		choicesHash,
		requiresConfirmation: blockers.length === 0 && changed,
		dependencyClosure,
		scope,
		domains,
		fingerprints: collectFingerprints(effects),
		fingerprintsByRepository,
		repositoryConfigs: authorizationPayload.repositories,
		repositoryPlans,
		itemIds: effects.map(effect => effect.id),
		correlationTokens: effects.map(effect => effect.payload?.correlationToken || effect.correlationToken).filter(Boolean),
		blockers,
		report: blockers.length > 0 ? "Reconfiguration is blocked before confirmation." : changed ? "Plan created. Requires confirmation." : "Aligned reconfiguration. No changes required.",
	};
}

function mergeContributions(contributions) {
	const fieldDependencies = {};
	for (const contribution of contributions) {
		for (const [field, dependencies] of Object.entries(contribution.fieldDependencies || {})) {
			fieldDependencies[field] = [...new Set([...(fieldDependencies[field] || []), ...dependencies])];
		}
	}
	return {
		effects: contributions.flatMap(contribution => contribution.effects || []),
		blockers: contributions.flatMap(contribution => contribution.blockers || []),
		dependencyClosure: contributions.flatMap(contribution => contribution.dependencyClosure || []),
		fieldDependencies,
		affectedItems: contributions.flatMap(contribution => contribution.affectedItems || []),
		collisions: contributions.flatMap(contribution => contribution.collisions || []),
	};
}

export function plan(config, snapshot, machine, choices) {
	const contexts = repositoryContexts(config, snapshot, machine, choices);
	if (contexts.length > 1) {
		const repositoryContributions = {};
		const affectedItems = [];
		const collisions = [];
		for (const context of contexts) {
			const contributions = [];
			if (context.choices?.triageMappings) contributions.push(planTriage(context.config, context.snapshot, context.machine, context.choices));
			if (context.choices?.contextMap || context.choices?.artifactRoutes) contributions.push(planDomain(context.config, context.snapshot, context.machine, context.choices));
			const merged = mergeContributions(contributions);
			repositoryContributions[context.repositoryId] = merged;
			affectedItems.push(...merged.affectedItems.map(item => ({ ...item, repositoryId: context.repositoryId })));
			collisions.push(...merged.collisions.map(item => ({ ...item, repositoryId: context.repositoryId })));
		}
		return {
			...createReconfigurePlan(config, snapshot, machine, choices, { repositoryContributions }),
			...(affectedItems.length > 0 ? { affectedItems } : {}),
			...(collisions.length > 0 ? { collisions } : {}),
		};
	}
	const context = contexts[0];
	const contributions = [];
	if (context.choices?.triageMappings) contributions.push(planTriage(context.config, context.snapshot, context.machine, context.choices));
	if (context.choices?.contextMap || context.choices?.artifactRoutes) contributions.push(planDomain(context.config, context.snapshot, context.machine, context.choices));
	const contribution = mergeContributions(contributions);
	return {
		...createReconfigurePlan(config, snapshot, machine, choices, contribution),
		...(contribution.affectedItems.length > 0 ? { affectedItems: contribution.affectedItems } : {}),
		...(contribution.collisions.length > 0 ? { collisions: contribution.collisions } : {}),
	};
}

function requiredAdapter(adapters, names, code) {
	const name = names.find(candidate => typeof adapters[candidate] === "function");
	if (!name) throw new ReconfigureError(`Reconfiguration requires adapter ${names.join(" or ")}.`, code);
	return adapters[name].bind(adapters);
}

function journalOperation(effect) {
	return {
		id: effect.id,
		repositoryId: effect.repositoryId ?? null,
		target: effect.target,
		kind: effect.kind,
		classification: effect.classification,
		phase: effect.phase,
		operation: effect.operation || effect.payload?.operation || null,
		dependencies: [...(effect.dependencies || [])],
		correlationToken: effect.payload?.correlationToken || effect.correlationToken || null,
		fingerprint: effect.fingerprint ?? null,
		remoteFingerprint: effect.remoteFingerprint ?? null,
		destructive: effect.destructive === true || effect.classification === "DELETE",
		authorizationDigest: sha256(JSON.stringify(effectAuthorizationView(effect))),
	};
}

function assertSecretFreeJournal(state) {
	const forbiddenKeys = /^(token|password|secret|credential|authorization|before|after|diff|payload|content|value)$/i;
	const visit = value => {
		if (!value || typeof value !== "object") return;
		for (const [key, child] of Object.entries(value)) {
			if (forbiddenKeys.test(key)) throw new ReconfigureError(`Secret-bearing journal field is forbidden: ${key}.`, "ERR_UNSAFE_JOURNAL");
			visit(child);
		}
	};
	visit(state);
}

function initialJournalState(planResult, now) {
	const authorizedPlan = structuredClone(planResult.authorizationPayload);
	const operations = planResult.effects.filter(isMutation).map(journalOperation);
	const state = {
		schemaVersion: 3,
		planHash: planResult.hash,
		choicesHash: planResult.choicesHash,
		scope: [...planResult.scope],
		domains: [...planResult.domains],
		phase: "prepare",
		status: "in_progress",
		authorizedPlan,
		authorizedPlanDigest: sha256(JSON.stringify(authorizedPlan)),
		authorizedRemainder: operations.map(operation => operation.id),
		repositoryConfigs: planResult.repositoryConfigs || {
			[planResult.scope[0]]: {
				configDigest: planResult.configDigest,
				proposedConfigDigest: planResult.proposedConfigDigest,
			},
		},
		operations,
		appliedIds: [],
		verifiedIds: [],
		returnedIdentities: {},
		verifiedResults: {},
		correlationTokens: [...planResult.correlationTokens],
		fingerprints: planResult.fingerprints,
		fingerprintsByRepository: planResult.fingerprintsByRepository || {
			[planResult.scope[0]]: planResult.fingerprints,
		},
		failed: null,
		startedAt: now(),
	};
	assertSecretFreeJournal(state);
	return state;
}

async function persistJournal(adapters, state) {
	state.authorizedRemainder = state.operations
		.filter(operation => !state.verifiedIds.includes(operation.id))
		.map(operation => operation.id);
	assertSecretFreeJournal(state);
	const writeJournal = requiredAdapter(adapters, ["writeJournal"], "ERR_JOURNAL_ADAPTER_REQUIRED");
	await writeJournal(state.planHash, structuredClone(state));
}
function safeReturnedIdentity(identity) {
	if (identity === null || identity === undefined) return identity;
	if (typeof identity !== "object") return identity;
	const allowed = ["id", "key", "url", "version", "updatedAt", "hash", "digest"];
	return Object.fromEntries(allowed.filter(key => Object.hasOwn(identity, key)).map(key => [key, identity[key]]));
}

function verifiedResult(effect, outcome, verification) {
	const reported = verification && typeof verification === "object" ? verification : {};
	const identity = safeReturnedIdentity(reported.identity ?? outcome?.identity);
	const fingerprint = reported.fingerprint ?? outcome?.fingerprint ?? identity ?? null;
	const version = reported.version ?? identity?.version ?? null;
	const hash = reported.hash ?? identity?.hash ?? sha256(JSON.stringify(fingerprint));
	return { repositoryId: effect.repositoryId ?? null, target: effect.target, identity, version, hash, fingerprint };
}

function postMutationFingerprint(effect, state) {
	for (const dependencyId of effect.dependencies || []) {
		const dependency = state.operations.find(operation => operation.id === dependencyId);
		const result = state.verifiedResults[dependencyId];
		if (dependency?.target === effect.target && result) return result.fingerprint ?? result.identity ?? null;
	}
	return undefined;
}

async function revalidateLocalOrMachine(effect, expected, planResult, adapters, dependency = false) {
	const category = effect.target.startsWith("machine:") ? "machine" : "local";
	const validate = category === "machine"
		? adapters.revalidateMachineFingerprints || adapters.revalidateFingerprints
		: adapters.revalidateLocalFingerprints || adapters.revalidateFingerprints;
	if (typeof validate !== "function" || await validate.call(adapters, { [effect.id]: expected }, planResult, effect) !== true) {
		const label = category === "machine" ? "Machine" : "Local";
		throw new ReconfigureError(
			dependency
				? `${label} drift detected for source ${effect.target}; fresh authorization is required.`
				: `${label} fingerprint drift detected for ${effect.target}; fresh authorization is required.`,
			category === "machine" ? "ERR_MACHINE_DRIFT" : "ERR_LOCAL_DRIFT",
		);
	}
}

async function revalidateRemoteEffect(effect, adapters, expectedOverride) {
	if (!isRemoteEffect(effect)) return;
	const refetch = requiredAdapter(adapters, ["refetchRemoteFingerprint"], "ERR_REMOTE_REFETCH_REQUIRED");
	const expected = expectedOverride !== undefined
		? expectedOverride
		: Object.hasOwn(effect, "remoteFingerprint") ? effect.remoteFingerprint : effect.fingerprint ?? null;
	const fresh = await refetch({ ...effect, remoteFingerprint: expected, expectedFingerprint: expected });
	if (!sameValue(fresh, expected)) {
		throw new ReconfigureError(`Remote drift detected for ${effect.target}; fresh authorization is required.`, "ERR_REMOTE_DRIFT");
	}
}

async function revalidateEffect(effect, state, planResult, adapters) {
	const expected = postMutationFingerprint(effect, state)
		?? (isRemoteEffect(effect) && Object.hasOwn(effect, "remoteFingerprint") ? effect.remoteFingerprint : effect.fingerprint ?? null);
	if (isRemoteEffect(effect)) await revalidateRemoteEffect(effect, adapters, expected);
	else await revalidateLocalOrMachine(effect, expected, planResult, adapters);
	for (const dependencyId of effect.dependencies || []) {
		const dependency = planResult.effects.find(candidate => candidate.id === dependencyId);
		if (!dependency || dependency.classification !== "PRESERVE") continue;
		if (isRemoteEffect(dependency)) await revalidateRemoteEffect(dependency, adapters);
		else await revalidateLocalOrMachine(dependency, dependency.fingerprint ?? null, planResult, adapters, true);
	}
}

async function revalidateInitialFingerprints(planResult, state, adapters) {
	if (state.appliedIds.length > 0) return;
	for (const [category, entries] of Object.entries({
		local: planResult.fingerprints.local || {},
		machine: planResult.fingerprints.machine || {},
	})) {
		if (Object.keys(entries).length === 0) continue;
		const validate = category === "machine"
			? adapters.revalidateMachineFingerprints || adapters.revalidateFingerprints
			: adapters.revalidateLocalFingerprints || adapters.revalidateFingerprints;
		if (typeof validate !== "function" || await validate.call(adapters, entries, planResult) !== true) {
			throw new ReconfigureError(
				`${category === "machine" ? "Machine" : "Local"} fingerprint drift requires a fresh authorization.`,
				category === "machine" ? "ERR_MACHINE_DRIFT" : "ERR_LOCAL_DRIFT",
			);
		}
	}
}
function operationReport(planResult, state) {
	const verified = new Set(state.verifiedIds);
	const failedId = state.failed?.effectId || null;
	const authorizedEffects = state.authorizedPlan?.effects || planResult.effects;
	const report = {
		completed: state.operations.filter(operation => verified.has(operation.id)).map(operation => operation.id),
		preserved: authorizedEffects.filter(effect => effect.classification === "PRESERVE").map(effect => effect.id),
		skipped: authorizedEffects.filter(effect => effect.classification === "SKIP").map(effect => effect.id),
		noOp: authorizedEffects.filter(effect => effect.classification === "NO-OP").map(effect => effect.id),
		pending: state.operations.filter(operation => !verified.has(operation.id) && operation.id !== failedId).map(operation => operation.id),
		failed: failedId ? [failedId] : [],
	};
	report.byRepository = Object.fromEntries(state.scope.map(repositoryId => {
		const belongs = id => {
			const operation = state.operations.find(candidate => candidate.id === id);
			if (operation) return (operation.repositoryId ?? state.scope[0]) === repositoryId;
			const effect = authorizedEffects.find(candidate => candidate.id === id);
			return (effect?.repositoryId ?? state.scope[0]) === repositoryId;
		};
		return [repositoryId, Object.fromEntries(
			["completed", "preserved", "skipped", "noOp", "pending", "failed"].map(key => [key, report[key].filter(belongs)]),
		)];
	}));
	return report;
}

async function derivedReadiness(adapters, state, planResult, fallbackReady) {
	if (typeof adapters.deriveReadiness === "function") return await adapters.deriveReadiness(state, planResult);
	return { configValid: fallbackReady, engineeringReady: fallbackReady, trackerReady: fallbackReady, docsReady: fallbackReady, runtimeReady: fallbackReady };
}

function actionableByPhase(planResult, state, phase) {
	const verified = new Set(state.verifiedIds);
	return planResult.effects.filter(effect => isMutation(effect) && effect.phase === phase && !verified.has(effect.id));
}

async function recoverRemoteOutcome(effect, state, planResult, context, adapters, enabled) {
	const correlationToken = effect.payload?.correlationToken || effect.correlationToken;
	if (!enabled || !isRemoteEffect(effect) || !correlationToken) return { recovered: false, outcome: undefined };
	const recover = adapters.recoverRemoteResultByCorrelation
		|| adapters.findRemoteResultByCorrelation
		|| adapters.resolveCorrelationToken;
	if (typeof recover !== "function") return { recovered: false, outcome: undefined };
	const outcome = await recover.call(adapters, correlationToken, effect, {
		state: structuredClone(state),
		plan: planResult,
		context,
	});
	return outcome === null || outcome === undefined
		? { recovered: false, outcome: undefined }
		: { recovered: true, outcome: outcome.outcome ?? outcome };
}

async function executeConfirmedPlan(planResult, context, adapters, injection, state) {
	const applyEffect = requiredAdapter(adapters, ["applyEffect"], "ERR_APPLY_ADAPTER_REQUIRED");
	const verifyEffect = requiredAdapter(adapters, ["verifyEffect"], "ERR_VERIFY_ADAPTER_REQUIRED");
	const now = adapters.now ? adapters.now.bind(adapters) : Date.now;
	let currentEffect = null;
	try {
		const correlationRecoveryEnabled = state.status === "failed" || state.appliedIds.length > 0;
		await revalidateInitialFingerprints(planResult, state, adapters);
		let appliedIndex = state.appliedIds.length;
		for (const phase of PHASES.slice(PHASES.indexOf(state.phase))) {
			state.phase = phase;
			state.status = "in_progress";
			state.failed = null;
			await persistJournal(adapters, state);
			if (injection.failAtPhase === phase) throw new Error(`Injected failure at phase ${phase}`);
			if (phase === "cleanup") {
				if (typeof adapters.verifyCutover === "function" && await adapters.verifyCutover(state, planResult) !== true) {
					throw new ReconfigureError("Cutover ownership, mappings, adapters, or active references did not verify before cleanup.", "ERR_CUTOVER_NOT_VERIFIED");
				}
				for (const effect of actionableByPhase(planResult, state, phase).filter(effect => effect.destructive === true || effect.classification === "DELETE")) {
					await revalidateEffect(effect, state, planResult, adapters);
				}
			}
			for (const effect of actionableByPhase(planResult, state, phase)) {
				currentEffect = effect;
				const verified = new Set(state.verifiedIds);
				if ((effect.dependencies || []).some(id => {
					if (verified.has(id)) return false;
					const source = planResult.effects.find(candidate => candidate.id === id);
					return !source || source.classification !== "PRESERVE";
				})) {
					throw new ReconfigureError(`Effect ${effect.id} has an incomplete dependency.`, "ERR_INCOMPLETE_DEPENDENCY");
				}
				let outcome;
				if (state.appliedIds.includes(effect.id)) {
					outcome = Object.hasOwn(state.returnedIdentities, effect.id)
						? { identity: state.returnedIdentities[effect.id] }
						: undefined;
				} else {
					if (injection.failAtEffectIndex === appliedIndex || injection.failAtEffectId === effect.id) {
						throw new Error(`Injected failure at effect ${effect.id}`);
					}
					const recovery = await recoverRemoteOutcome(effect, state, planResult, context, adapters, correlationRecoveryEnabled);
					if (recovery.recovered) {
						outcome = recovery.outcome;
					} else {
						await revalidateEffect(effect, state, planResult, adapters);
						outcome = await applyEffect(effect, {
							state: structuredClone(state),
							context,
							dependencyResults: Object.fromEntries((effect.dependencies || [])
								.filter(id => Object.hasOwn(state.verifiedResults, id))
								.map(id => [id, state.verifiedResults[id]])),
						});
						if (
							injection.failAfterApplyBeforeJournalAtEffectIndex === appliedIndex
							|| injection.failAfterApplyBeforeJournalAtEffectId === effect.id
						) {
							throw new Error(`Injected crash after applying effect ${effect.id} before journal persistence`);
						}
					}
					state.appliedIds.push(effect.id);
					if (outcome?.identity !== undefined) state.returnedIdentities[effect.id] = safeReturnedIdentity(outcome.identity);
					await persistJournal(adapters, state);
					if (injection.failAfterApplyAtEffectIndex === appliedIndex || injection.failAfterApplyAtEffectId === effect.id) {
						throw new Error(`Injected failure after applying effect ${effect.id}`);
					}
					appliedIndex += 1;
				}
				const verification = await verifyEffect(effect, outcome, {
					state: structuredClone(state),
					context,
					dependencyResults: Object.fromEntries((effect.dependencies || [])
						.filter(id => Object.hasOwn(state.verifiedResults, id))
						.map(id => [id, state.verifiedResults[id]])),
				});
				if (verification !== true && verification?.verified !== true && verification?.valid !== true) {
					throw new ReconfigureError(`Verification failed for ${effect.target}.`, "ERR_EFFECT_VERIFICATION");
				}
				state.verifiedResults[effect.id] = verifiedResult(effect, outcome, verification);
				state.verifiedIds.push(effect.id);
				await persistJournal(adapters, state);
			}
			if (typeof adapters.verifyPhase === "function" && await adapters.verifyPhase(phase, state, planResult) !== true) {
				throw new ReconfigureError(`Verification failed after ${phase}.`, "ERR_PHASE_VERIFICATION");
			}
			const nextIndex = PHASES.indexOf(phase) + 1;
			state.phase = nextIndex < PHASES.length ? PHASES[nextIndex] : "done";
			await persistJournal(adapters, state);
		}
		if (typeof adapters.verifyCompletion === "function" && await adapters.verifyCompletion(state, planResult) !== true) {
			throw new ReconfigureError("Canonical ownership, mappings, adapters, readiness, or source preservation did not verify.", "ERR_COMPLETION_NOT_VERIFIED");
		}
	} catch (error) {
		state.status = "failed";
		const journalMessage = error instanceof ReconfigureError ? error.message : "An adapter operation failed.";
		state.failed = { effectId: currentEffect?.id || null, phase: state.phase, code: error.code || "ERR_RECONFIGURE_FAILED", message: journalMessage };
		await persistJournal(adapters, state);
		const report = operationReport(planResult, state);
		const ownershipReport = Object.fromEntries(state.scope.map(repositoryId => [
			repositoryId,
			state.operations.some(operation => (operation.repositoryId ?? state.scope[0]) === repositoryId) ? "incomplete" : "aligned",
		]));
		return {
			success: false,
			phase: state.phase,
			completedEffects: state.verifiedIds.length,
			hash: state.planHash,
			readiness: await derivedReadiness(adapters, state, planResult, false),
			report: `Failed during ${state.phase}: ${error.message}. No rollback was performed.`,
			operationReport: report,
			ownershipReport,
		};
	}

	state.phase = "done";
	state.status = "completed";
	state.failed = null;
	const report = operationReport(planResult, state);
	const readiness = await derivedReadiness(adapters, state, planResult, true);
	const ownershipReport = Object.fromEntries(state.scope.map(repositoryId => [
		repositoryId,
		state.operations.some(operation => (operation.repositoryId ?? state.scope[0]) === repositoryId) ? "owned" : "aligned",
	]));
	const audit = {
		schemaVersion: 2,
		planHash: state.planHash,
		scope: state.scope,
		domains: state.domains,
		status: "completed",
		acceptedPartial: false,
		completed: report.completed,
		preserved: report.preserved,
		skipped: report.skipped,
		noOp: report.noOp,
		pending: report.pending,
		failed: report.failed,
		repositories: Object.fromEntries(state.scope.map(repositoryId => [repositoryId, {
			...report.byRepository[repositoryId],
			config: state.repositoryConfigs[repositoryId],
			ownership: ownershipReport[repositoryId],
			verifiedResults: Object.fromEntries(Object.entries(state.verifiedResults)
				.filter(([id]) => state.operations.find(operation => operation.id === id)?.repositoryId === repositoryId
					|| (state.scope.length === 1 && state.scope[0] === repositoryId))),
		}])),
		ownershipReport,
		noRollback: true,
		timestamp: now(),
	};
	assertSecretFreeJournal(audit);
	const appendAudit = requiredAdapter(adapters, ["appendAudit", "writeAudit"], "ERR_AUDIT_ADAPTER_REQUIRED");
	await appendAudit(audit);
	const removeJournal = requiredAdapter(adapters, ["removeJournal"], "ERR_JOURNAL_ADAPTER_REQUIRED");
	await removeJournal();
	return {
		success: true,
		phase: "done",
		completedEffects: state.verifiedIds.length,
		hash: state.planHash,
		readiness,
		report: "Prepare, cutover, and cleanup completed. Durable audit recorded before journal cleanup.",
		operationReport: report,
		ownershipReport,
	};
}

function journalState(record) {
	return record?.state || record || null;
}

function immutableEffectView(effect) {
	const view = effectAuthorizationView(effect);
	const { fingerprint: _fingerprint, remoteFingerprint: _remoteFingerprint, ...immutable } = view;
	return {
		...immutable,
		afterDigest: effect.afterDigest ?? immutable.afterDigest,
		payloadDigest: effect.payloadDigest ?? immutable.payloadDigest,
	};
}

function assertPlanMatchesJournal(planResult, state) {
	if (
		state.schemaVersion !== 3
		|| !Array.isArray(state.appliedIds)
		|| !Array.isArray(state.verifiedIds)
		|| !state.authorizedPlan
		|| !Array.isArray(state.authorizedRemainder)
	) {
		throw new ReconfigureError("The interrupted journal uses an unsupported state schema.", "ERR_JOURNAL_SCHEMA");
	}
	const authorizedDigest = sha256(JSON.stringify(state.authorizedPlan));
	if (state.authorizedPlanDigest !== authorizedDigest || state.planHash !== authorizedDigest) {
		throw new ReconfigureError("The persisted authorized plan failed its integrity check.", "ERR_JOURNAL_INTEGRITY");
	}
	if (state.choicesHash !== planResult.choicesHash || !sameValue(state.scope, planResult.scope) || !sameValue(state.domains, planResult.domains)) {
		throw new ReconfigureError("The confirmed journal does not match the requested scope and choices.", "ERR_PLAN_MISMATCH");
	}
	const authorizedById = new Map(state.authorizedPlan.effects.map(effect => [effect.id, effect]));
	const plannedById = new Map(planResult.effects.map(effect => [effect.id, effect]));
	const authorizedMutationIds = new Set(state.operations.map(operation => operation.id));
	const expectedRemainder = state.operations
		.filter(operation => !state.verifiedIds.includes(operation.id))
		.map(operation => operation.id);
	const invalidOperations = state.operations.filter(operation => {
		const authorized = authorizedById.get(operation.id);
		return !authorized || operation.authorizationDigest !== sha256(JSON.stringify(authorized));
	});
	const invalidProgress = new Set(state.appliedIds).size !== state.appliedIds.length
		|| new Set(state.verifiedIds).size !== state.verifiedIds.length
		|| state.verifiedIds.some(id => !state.appliedIds.includes(id))
		|| !sameValue(state.authorizedRemainder, expectedRemainder);
	if (invalidOperations.length > 0 || invalidProgress) {
		throw new ReconfigureError("The persisted authorized remainder failed its integrity check.", "ERR_JOURNAL_INTEGRITY");
	}
	const unknownApplied = state.appliedIds.filter(id => !authorizedMutationIds.has(id));
	const missingPending = state.operations.filter(operation => {
		if (state.verifiedIds.includes(operation.id)) return false;
		const current = plannedById.get(operation.id);
		const authorized = authorizedById.get(operation.id);
		return !current || !authorized || !sameValue(immutableEffectView(current), immutableEffectView(authorized));
	});
	const unexpectedMutations = planResult.effects.filter(effect => isMutation(effect) && !authorizedMutationIds.has(effect.id));
	if (unknownApplied.length > 0 || missingPending.length > 0 || unexpectedMutations.length > 0) {
		throw new ReconfigureError("The confirmed remainder cannot be reconstructed safely.", "ERR_PLAN_MISMATCH");
	}
	const operations = new Map(state.operations.map(operation => [operation.id, operation]));
	return {
		...planResult,
		hash: state.planHash,
		authorizationPayload: state.authorizedPlan,
		effects: planResult.effects.map(effect => {
			const operation = operations.get(effect.id);
			if (!operation || state.verifiedIds.includes(effect.id)) return effect;
			return {
				...effect,
				classification: operation.classification,
				fingerprint: operation.fingerprint,
				...(isRemoteEffect(effect) ? { remoteFingerprint: operation.remoteFingerprint } : {}),
			};
		}),
	};
}

export async function applyConfirmedPlan(planResult, context, adapters, injection = {}) {
	if (planResult.blockers.length > 0) throw new ReconfigureError("Cannot apply a reconfiguration plan with blockers.", "ERR_HAS_BLOCKERS");
	if (!planResult.effects.some(isMutation)) {
		return {
			success: true,
			phase: "done",
			completedEffects: 0,
			hash: planResult.hash,
			readiness: await derivedReadiness(adapters, null, planResult, true),
			report: "Aligned reconfiguration. No changes required.",
			operationReport: {
				completed: [],
				preserved: planResult.effects.filter(effect => effect.classification === "PRESERVE").map(effect => effect.id),
				skipped: planResult.effects.filter(effect => effect.classification === "SKIP").map(effect => effect.id),
				noOp: planResult.effects.filter(effect => effect.classification === "NO-OP").map(effect => effect.id),
				pending: [],
				failed: [],
			},
			ownershipReport: Object.fromEntries(planResult.scope.map(repository => [repository, "aligned"])),
		};
	}
	const readJournal = requiredAdapter(adapters, ["readJournal"], "ERR_JOURNAL_ADAPTER_REQUIRED");
	if (await readJournal()) throw new ReconfigureError("An interrupted reconfiguration must be resumed or accepted before starting another.", "ERR_JOURNAL_EXISTS");
	const now = adapters.now ? adapters.now.bind(adapters) : Date.now;
	const state = initialJournalState(planResult, now);
	await persistJournal(adapters, state);
	return executeConfirmedPlan(planResult, context, adapters, injection, state);
}

export async function resumeConfirmedPlan(planResult, context, adapters, injection = {}) {
	const readJournal = requiredAdapter(adapters, ["readJournal"], "ERR_JOURNAL_ADAPTER_REQUIRED");
	const state = journalState(await readJournal());
	if (!state) throw new ReconfigureError("No interrupted work found to resume.", "ERR_NO_JOURNAL");
	assertSecretFreeJournal(state);
	const confirmedRemainder = assertPlanMatchesJournal(planResult, state);
	return executeConfirmedPlan(confirmedRemainder, context, adapters, injection, state);
}

export async function acceptConfirmedPartial(config, planResult, context, adapters) {
	if (config?.schema_version !== undefined) {
		const error = validationError(config);
		if (error) throw error;
	}
	const readJournal = requiredAdapter(adapters, ["readJournal"], "ERR_JOURNAL_ADAPTER_REQUIRED");
	const state = journalState(await readJournal());
	if (!state) throw new ReconfigureError("No interrupted work found to accept.", "ERR_NO_JOURNAL");
	assertSecretFreeJournal(state);
	const confirmedRemainder = assertPlanMatchesJournal(planResult, state);
	planResult = confirmedRemainder;
	const cutoverCompleted = state.operations.some(operation => operation.phase === "cutover" && state.verifiedIds.includes(operation.id));
	const destructiveCompleted = state.operations.some(operation => operation.destructive && state.appliedIds.includes(operation.id));
	if (!cutoverCompleted || destructiveCompleted) {
		throw new ReconfigureError("Partial acceptance requires a verified cutover and cannot accept completed source or remote deletion.", "ERR_NOT_ELIGIBLE_PARTIAL");
	}
	const validatePartial = requiredAdapter(adapters, ["validatePartialState"], "ERR_PARTIAL_VALIDATION_REQUIRED");
	const validation = await validatePartial({ state: structuredClone(state), plan: planResult, context });
	if (!validation || validation.valid !== true) {
		throw new ReconfigureError("Retained canonical configuration and adapters are not valid for partial acceptance.", "ERR_INVALID_PARTIAL_STATE");
	}
	const now = adapters.now ? adapters.now.bind(adapters) : Date.now;
	const report = operationReport(planResult, state);
	const ownershipReport = validation.ownershipReport || Object.fromEntries(state.scope.map(repository => [repository, "partial"]));
	const audit = {
		schemaVersion: 2,
		planHash: state.planHash,
		scope: state.scope,
		domains: state.domains,
		status: "accepted_partial",
		acceptedPartial: true,
		completed: report.completed,
		preserved: report.preserved,
		skipped: report.skipped,
		noOp: report.noOp,
		pending: report.pending,
		failed: report.failed,
		repositories: Object.fromEntries(state.scope.map(repositoryId => [repositoryId, {
			...report.byRepository[repositoryId],
			config: state.repositoryConfigs[repositoryId],
			ownership: ownershipReport[repositoryId],
			verifiedResults: Object.fromEntries(Object.entries(state.verifiedResults)
				.filter(([id]) => state.operations.find(operation => operation.id === id)?.repositoryId === repositoryId
					|| (state.scope.length === 1 && state.scope[0] === repositoryId))),
		}])),
		ownershipReport,
		noRollback: true,
		timestamp: now(),
	};
	assertSecretFreeJournal(audit);
	const appendAudit = requiredAdapter(adapters, ["appendAudit", "writeAudit"], "ERR_AUDIT_ADAPTER_REQUIRED");
	await appendAudit(audit);
	const removeJournal = requiredAdapter(adapters, ["removeJournal"], "ERR_JOURNAL_ADAPTER_REQUIRED");
	await removeJournal();
	return {
		success: true,
		phase: state.phase,
		completedEffects: state.verifiedIds.length,
		hash: state.planHash,
		readiness: validation.readiness || await derivedReadiness(adapters, state, planResult, true),
		report: "Reviewed valid partial state accepted. Durable audit recorded; no rollback or deletion was performed.",
		operationReport: report,
		ownershipReport,
	};
}

export async function apply(config, snapshot, machine, choices, planHash, effects, adapters, injection = {}) {
	const expected = plan(config, snapshot, machine, choices);
	if (expected.hash !== planHash || !sameValue(expected.effects, effects)) {
		throw new ReconfigureError("The confirmed plan no longer matches current inputs.", "ERR_PLAN_MISMATCH");
	}
	return applyConfirmedPlan(expected, { config, snapshot, machine, choices }, adapters, injection);
}

export async function resume(config, snapshot, machine, choices, adapters, injection = {}) {
	const expected = plan(config, snapshot, machine, choices);
	return resumeConfirmedPlan(expected, { config, snapshot, machine, choices }, adapters, injection);
}

export async function acceptPartial(config, snapshot, machine, choices, adapters) {
	const expected = plan(config, snapshot, machine, choices);
	return acceptConfirmedPartial(config, expected, { config, snapshot, machine, choices }, adapters);
}
