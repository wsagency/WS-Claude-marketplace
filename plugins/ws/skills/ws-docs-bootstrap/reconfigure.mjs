import * as path from "node:path";
import {
	acceptConfirmedPartial,
	applyConfirmedPlan,
	createReconfigurePlan,
	resumeConfirmedPlan,
} from "../ws-project-bootstrap/reconfigure.mjs";
import { planDocumentation } from "./transaction.mjs";

export { ReconfigureError } from "../ws-project-bootstrap/reconfigure.mjs";

function safeRelativePath(value) {
	if (typeof value !== "string" || value.trim() === "" || path.isAbsolute(value)) return false;
	const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
	return normalized !== ".." && !normalized.startsWith("../") && normalized === value.replaceAll("\\", "/");
}

function docsSnapshot(discovery) {
	const repositoryStates = Object.fromEntries((discovery.repositories || []).map(repository => {
		const repositoryDiscovery = discovery.repositoryDiscoveries?.[repository.id] || repository.discovery || repository;
		return [repository.id, {
			config: repository.config,
			entries: repositoryDiscovery.entries || repository.entries || {},
			machine: repository.machine || {},
		}];
	}));
	return {
		shape: discovery.projectShape,
		repositoryId: discovery.root || "current",
		entries: discovery.entries || {},
		repositories: discovery.repositories,
		repositoryStates,
	};
}

function transitionField(config, choices, transition) {
	const pathFields = new Set(["docs.user_track", "docs.dev_track", "changelog.path"]);
	for (const field of choices.fields || []) {
		if (!pathFields.has(field)) continue;
		const before = field.split(".").reduce((current, key) => current?.[key], config);
		if (before === transition.source && choices.values?.[field] === transition.destination) return field;
	}
	return null;
}
function repositoryDocsContexts(config, discovery, choices) {
	if (discovery.projectShape !== "hub_root") return [{ repositoryId: discovery.root || "current", config, discovery, choices }];
	const inventory = discovery.repositories || [];
	const hub = inventory.find(repository => repository.type === "hub" && repository.present === true);
	const scope = Array.isArray(choices.repositories) && choices.repositories.length > 0 ? [...new Set(choices.repositories)] : [hub?.id];
	return scope.map(repositoryId => {
		const repository = inventory.find(candidate => candidate.id === repositoryId);
		const explicitDiscovery = discovery.repositoryDiscoveries?.[repositoryId]
			|| repository?.discovery
			|| (repository && Object.hasOwn(repository, "entries") ? {
				projectShape: "standalone",
				root: repositoryId,
				entries: repository.entries,
			} : null);
		if (scope.length > 1 && !explicitDiscovery) {
			throw Object.assign(
				new Error(`Repository ${repositoryId} is missing repository-qualified documentation discovery.`),
				{ code: "ERR_UNQUALIFIED_REPOSITORY_STATE" },
			);
		}
		const repositoryDiscovery = explicitDiscovery || discovery;
		const repositoryConfig = scope.length > 1
			? config?.[repositoryId] || repository?.config
			: config?.schema_version !== undefined ? config : config?.[repositoryId] || repository?.config;
		if (!repositoryConfig) {
			throw Object.assign(
				new Error(`Repository ${repositoryId} is missing repository-qualified canonical configuration.`),
				{ code: "ERR_MISSING_CONFIG" },
			);
		}
		const specificChoices = choices.repositoryChoices?.[repositoryId] || choices.byRepository?.[repositoryId];
		return {
			repositoryId,
			config: repositoryConfig,
			discovery: repositoryDiscovery,
			choices: specificChoices ? { ...choices, ...specificChoices, repositories: undefined } : choices,
		};
	});
}

function authorizedPreparedDestination(choices, destinationId, destinationPath, source, destination) {
	const state = choices.__resumeState;
	if (!state || destination.kind === "missing" || JSON.stringify(source.content) !== JSON.stringify(destination.content)) return false;
	const qualifiedId = choices.__repositoryId ? `${choices.__repositoryId}::${destinationId}` : destinationId;
	return state.verifiedIds?.includes(qualifiedId) && state.verifiedResults?.[qualifiedId]?.target === destinationPath;
}

function buildDocsContribution(config, discovery, choices) {
	const effects = [];
	const blockers = [];
	const dependencyClosure = [];
	const fieldDependencies = {};
	const contentManifest = [];
	const configSectionRemovals = [];

	if (choices.enableDocs) {
		if (!config.docs) {
			const required = ["user_track", "dev_track", "default_audience", "default_scope", "adr_for_arch_changes"].map(leaf => `docs.${leaf}`);
			const missing = required.filter(field => !(choices.fields || []).includes(field) || !Object.hasOwn(choices.values || {}, field));
			if (missing.length > 0) {
				throw Object.assign(
					new Error(`Enabling absent docs policy requires explicit values for: ${missing.join(", ")}.`),
					{ code: "ERR_INCOMPLETE_SECTION_ENABLEMENT" },
				);
			}
		}
		const bootstrap = planDocumentation(discovery);
		const prepareIds = [];
		for (const effect of bootstrap.effects) {
			const classification = effect.classification === "CREATE" ? "CREATE"
				: effect.classification === "BLOCKING_CONFLICT" ? "BLOCKING_CONFLICT" : "PRESERVE";
			const planned = {
				...effect,
				id: `${classification === "CREATE" ? "prepare" : "preserve"}:docs-bootstrap:${effect.target}`,
				phase: "prepare",
				order: 5,
				classification,
				reason: classification === "CREATE"
					? `Missing-only documentation enablement: ${effect.reason}`
					: `Documentation enablement preserves existing authored state: ${effect.reason}`,
			};
			effects.push(planned);
			if (classification === "CREATE") prepareIds.push(planned.id);
			if (classification === "BLOCKING_CONFLICT") blockers.push({ id: planned.id, target: planned.target, reason: planned.reason });
		}
		for (const field of (choices.fields || []).filter(field => field.startsWith("docs."))) {
			fieldDependencies[field] = [...prepareIds];
			dependencyClosure.push({
				field,
				reason: "Documentation policy enablement depends on verified missing-only bootstrap artifacts.",
				resolution: "selected",
			});
		}
	}

	if (choices.disableDocs) {
		configSectionRemovals.push({
			section: "docs",
			reason: "Remove only the selected canonical docs policy while preserving all authored documentation and surrounding configuration bytes.",
		});
		for (const [target, entry] of Object.entries(discovery.entries || {}).sort(([left], [right]) => left.localeCompare(right))) {
			if (entry.kind === "missing" || entry.kind === "blocked") continue;
			effects.push({
				id: `preserve:docs-disable:${target}`,
				order: 2,
				phase: "prepare",
				target,
				kind: entry.kind,
				classification: "PRESERVE",
				reason: "Disabling documentation policy preserves this authored document or directory.",
				diff: "unchanged",
				fingerprint: entry.fingerprint ?? null,
			});
		}
	}

	for (const transition of choices.pathTransitions || []) {
		if (!safeRelativePath(transition.source) || !safeRelativePath(transition.destination) || !["copy", "move"].includes(transition.intent)) {
			throw Object.assign(new Error("Each path transition requires safe relative source/destination paths and explicit copy/move intent."), { code: "ERR_INVALID_PATH_TRANSITION" });
		}
		if (transition.source === transition.destination) {
			throw Object.assign(new Error("Path transition source and destination must differ."), { code: "ERR_INVALID_PATH_TRANSITION" });
		}
		const source = discovery.entries?.[transition.source] || { kind: "missing", fingerprint: null };
		const destination = discovery.entries?.[transition.destination] || { kind: "missing", fingerprint: null };
		const field = transitionField(config, choices, transition);
		if (transition.intent === "move" && !field) {
			throw Object.assign(
				new Error("A documentation or changelog move must be bound to a selected canonical path field."),
				{ code: "ERR_UNBOUND_PATH_TRANSITION" },
			);
		}
		const managedReferences = Array.isArray(transition.managedReferences) ? transition.managedReferences : [];
		const verificationSteps = Array.isArray(transition.verificationSteps) ? transition.verificationSteps : [];
		const destinationId = `prepare:docs-path:${transition.destination}:copy`;
		const destinationPrepared = authorizedPreparedDestination(choices, destinationId, transition.destination, source, destination);
		const manifest = {
			source: transition.source,
			destination: transition.destination,
			intent: transition.intent,
			collision: destination.kind === "missing" || destinationPrepared ? null : { kind: destination.kind, fingerprint: destination.fingerprint ?? null },
			managedReferences: managedReferences.map(reference => reference.target),
			verificationSteps,
			field,
		};
		contentManifest.push(manifest);

		if (source.kind === "missing" || source.kind === "blocked") {
			const effect = {
				id: `block:docs-path:${transition.source}:source`,
				order: 1,
				phase: "prepare",
				target: transition.source,
				kind: "state",
				classification: "BLOCKING_CONFLICT",
				reason: "Configured path transition source is missing or unreadable.",
				diff: "blocked",
				fingerprint: source.fingerprint ?? null,
			};
			effects.push(effect);
			blockers.push({ id: effect.id, target: effect.target, reason: effect.reason });
			continue;
		}
		if (destination.kind !== "missing" && !destinationPrepared) {
			const effect = {
				id: `block:docs-path:${transition.destination}:collision`,
				order: 1,
				phase: "prepare",
				target: transition.destination,
				kind: destination.kind,
				classification: "BLOCKING_CONFLICT",
				reason: "Destination collision requires an explicit reviewed content resolution.",
				diff: "blocked",
				fingerprint: destination.fingerprint ?? null,
			};
			effects.push(effect);
			blockers.push({ id: effect.id, target: effect.target, reason: effect.reason });
			continue;
		}
		if (field && (managedReferences.length === 0 || verificationSteps.length === 0)) {
			const effect = {
				id: `block:docs-path:${transition.destination}:manifest`,
				order: 1,
				phase: "prepare",
				target: transition.destination,
				kind: source.kind,
				classification: "BLOCKING_CONFLICT",
				reason: "A configured path change requires managed-reference effects and explicit verification steps.",
				diff: "blocked",
				fingerprint: destination.fingerprint ?? null,
			};
			effects.push(effect);
			blockers.push({ id: effect.id, target: effect.target, reason: effect.reason });
			continue;
		}

		effects.push({
			id: destinationId,
			order: 5,
			phase: "prepare",
			target: transition.destination,
			kind: source.kind,
			classification: destinationPrepared ? "NO-OP" : "CREATE",
			reason: destinationPrepared
				? "The authorized destination copy is already verified by the persisted journal."
				: "Copy authored content to the reviewed destination and verify it before policy cutover.",
			after: source.content,
			diff: destinationPrepared ? "verified destination retained" : `${transition.intent} ${transition.source} -> ${transition.destination}`,
			fingerprint: {
				source: source.fingerprint ?? null,
				destination: destinationPrepared ? null : destination.fingerprint ?? null,
			},
			payload: { operation: "copy_docs_path", source: transition.source, destination: transition.destination, preserveAuthoredBytes: true, verificationSteps },
		});
		const referenceIds = [];
		for (const reference of managedReferences) {
			if (!safeRelativePath(reference.target) || typeof reference.after !== "string") {
				throw Object.assign(new Error("Managed-reference effects require a safe target and exact replacement content."), { code: "ERR_INVALID_MANAGED_REFERENCE" });
			}
			const referenceId = `cutover:docs-reference:${reference.target}:update`;
			referenceIds.push(referenceId);
			effects.push({
				id: referenceId,
				order: 21,
				phase: "cutover",
				target: reference.target,
				kind: "file",
				classification: reference.before === reference.after ? "NO-OP" : "UPDATE",
				reason: "Update only the managed reference that depends on the configured path.",
				before: reference.before,
				after: reference.after,
				diff: reference.before === reference.after ? "unchanged" : "managed reference updated",
				fingerprint: reference.fingerprint ?? null,
				dependencies: [destinationId],
				payload: { operation: "update_managed_docs_reference", source: transition.source, destination: transition.destination },
			});
		}
		if (field) fieldDependencies[field] = [destinationId];
		dependencyClosure.push({
			field: field || `${transition.source}->${transition.destination}`,
			reason: "Configured path cutover depends on verified destination content and managed references.",
			resolution: "selected",
			effectId: destinationId,
		});
		if (transition.intent === "move") {
			const dependencies = [destinationId, ...referenceIds, ...(field ? [`cutover:config:${field}:set`] : [])];
			effects.push({
				id: `cleanup:docs-path:${transition.source}:delete`,
				order: 31,
				phase: "cleanup",
				target: transition.source,
				kind: source.kind,
				classification: "DELETE",
				reason: "Delete the explicitly moved source only after destination, active policy, and managed references verify.",
				diff: "deleted",
				fingerprint: source.fingerprint ?? null,
				dependencies,
				destructive: true,
				payload: { operation: "delete_verified_docs_source", source: transition.source, destination: transition.destination },
			});
		}
	}
	return { effects, blockers, dependencyClosure, fieldDependencies, configSectionRemovals, contentManifest };
}

export function plan(config, discovery, choices) {
	const normalizedChoices = { ...choices, fields: choices?.fields || [] };
	const contexts = repositoryDocsContexts(config, discovery, normalizedChoices);
	if (contexts.length > 1) {
		const repositoryContributions = {};
		const contentManifest = [];
		for (const context of contexts) {
			const repositoryChoice = { ...context.choices, __repositoryId: context.repositoryId };
			const contribution = buildDocsContribution(context.config, context.discovery, repositoryChoice);
			repositoryContributions[context.repositoryId] = contribution;
			contentManifest.push(...contribution.contentManifest.map(item => ({ ...item, repositoryId: context.repositoryId })));
		}
		const result = createReconfigurePlan(config, docsSnapshot(discovery), {}, normalizedChoices, { repositoryContributions });
		return { ...result, contentManifest };
	}
	const context = contexts[0];
	const contribution = buildDocsContribution(context.config, context.discovery, {
		...context.choices,
		...(discovery.projectShape === "hub_root" ? { __repositoryId: context.repositoryId } : {}),
	});
	const result = createReconfigurePlan(config, docsSnapshot(discovery), {}, normalizedChoices, contribution);
	return { ...result, contentManifest: contribution.contentManifest };
}

export async function apply(config, discovery, choices, planHash, effects, adapters, injection = {}) {
	const expected = plan(config, discovery, choices);
	if (expected.hash !== planHash || JSON.stringify(expected.effects) !== JSON.stringify(effects)) {
		const error = new Error("The confirmed plan no longer matches current inputs.");
		error.code = "ERR_PLAN_MISMATCH";
		throw error;
	}
	return applyConfirmedPlan(expected, { config, discovery, choices }, adapters, injection);
}

export async function resume(config, discovery, choices, adapters, injection = {}) {
	const readJournal = adapters.readJournal;
	const record = typeof readJournal === "function" ? await readJournal.call(adapters) : null;
	const state = record?.state || record || null;
	const resumeChoices = state ? { ...choices, __resumeState: state } : choices;
	const expected = plan(config, discovery, resumeChoices);
	return resumeConfirmedPlan(expected, { config, discovery, choices }, adapters, injection);
}

export async function acceptPartial(config, discovery, choices, adapters) {
	const expected = plan(config, discovery, choices);
	return acceptConfirmedPartial(config, expected, { config, discovery, choices }, adapters);
}
