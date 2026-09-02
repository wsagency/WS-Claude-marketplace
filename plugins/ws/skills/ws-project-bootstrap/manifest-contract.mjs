import { createHash } from "node:crypto";
import { serializeCanonicalConfig, validateCanonicalConfig } from "./config.mjs";
import { runHubTransaction } from "./hub-transaction.mjs";
import { applyLegacyCleanup, planLegacyMigration } from "./migration.mjs";
import { acceptConfirmedPartial, applyConfirmedPlan, createReconfigurePlan, resumeConfirmedPlan } from "./reconfigure.mjs";
import { applyPlan, buildPlan, deriveReadiness, discoverStandaloneRepository, preflightPlan, runSetupTransaction } from "./transaction.mjs";
import { applyDocumentation, discoverDocumentation, planDocumentation, preflightDocumentation } from "../ws-docs-bootstrap/transaction.mjs";
import { auditBackfill, executeBackfill, planBackfill } from "./backfill-jira.mjs";

export const MANIFEST_CONTRACT_VERSION = 1;
export const MANIFEST_CLASSIFICATIONS = Object.freeze([
	"CREATE",
	"UPDATE",
	"DELETE",
	"PRESERVE",
	"SKIP",
	"NO-OP",
	"BLOCKING_CONFLICT",
]);

const MUTATIONS = new Set(["CREATE", "UPDATE", "DELETE"]);

function hash(value) {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function item(effect, index, defaults = {}) {
	return {
		id: effect.id ?? `${defaults.phase ?? "core"}:${defaults.scope ?? "repository"}:${effect.target}:${index + 1}`,
		order: effect.order ?? index + 1,
		phase: effect.phase ?? defaults.phase ?? "core",
		scope: defaults.scope ?? "repository",
		target: effect.target,
		kind: effect.kind ?? "state",
		classification: effect.classification,
		reason: effect.reason ?? "Planned by the delegated transaction seam.",
		diff: effect.diff ?? "delegated",
		fingerprint: effect.fingerprint ?? null,
	};
}

function categories(items) {
	return Object.fromEntries(MANIFEST_CLASSIFICATIONS.map(classification => [
		classification,
		items.filter(entry => entry.classification === classification),
	]));
}

function manifest(mode, planHash, scope, items, blockers, delegated) {
	return {
		version: MANIFEST_CONTRACT_VERSION,
		mode,
		hash: planHash,
		scope,
		items,
		categories: categories(items),
		blockers,
		delegated,
	};
}

function assertAuthorization(authorization, expected) {
	if (authorization !== expected) throw new Error("Authorization hash does not match the complete manifest.");
}

function setupItems(plan, phase = "core", scope = "repository") {
	return plan.effects.map((effect, index) => item(effect, index, { phase, scope }));
}

function hubItems(plan) {
	const items = [];
	for (const target of plan.targets) {
		for (const [index, effect] of (target.core?.effects ?? []).entries()) {
			items.push(item(effect, index, { phase: "core", scope: target.name }));
		}
		for (const [index, effect] of (target.backfill?.effects ?? []).entries()) {
			items.push(item(effect, index, { phase: "backfill", scope: target.name }));
		}
		for (const [index, effect] of (target.docs?.effects ?? []).entries()) {
			items.push(item(effect, index, { phase: "docs", scope: target.name }));
		}
		for (const [index, effect] of (target.legacy?.effects ?? []).filter(effect => effect.order >= 900).entries()) {
			items.push(item(effect, index, { phase: "cleanup", scope: target.name }));
		}
	}
	return items;
}

function migrationChoices(plan, choices = {}) {
	return {
		...choices,
		profile: "materialized",
		targetConfig: serializeCanonicalConfig(plan.config),
	};
}

function migrationReadiness(core, plan) {
	const readiness = core.readiness ?? {};
	return {
		configValid: readiness.configValid === true,
		semanticReadBack: readiness.configValid === true,
		engineeringReady: readiness.engineeringReady === true,
		contextReady: readiness.engineeringReady === true,
		runtimeReady: readiness.runtimeReady === true,
		fingerprintsReady: !core.failure,
		docsReady: !plan.config?.docs || readiness.docsReady === true,
		jiraReady: !plan.config?.jira || readiness.trackerReady === true,
	};
}

function hasMutation(items) {
	return items.some(entry => MUTATIONS.has(entry.classification));
}

function usesLocalJiraBackfill(config) {
	return config?.tracker?.primary === "local" && config?.jira?.sync === "all_local_tickets";
}

function backfillStateEffect(classification, reason, fingerprint = null) {
	return {
		order: 200,
		target: "jira:backfill:audit",
		kind: "external",
		classification,
		reason,
		diff: "",
		fingerprint,
	};
}

async function planLocalJiraBackfill(config, adapters) {
	if (!usesLocalJiraBackfill(config)) return null;
	const input = adapters?.jiraBackfill;
	const requiredCallbacks = [
		["jiraAdapter.getTicket", input?.jiraAdapter?.getTicket],
		["jiraAdapter.findTicketByCorrelation", input?.jiraAdapter?.findTicketByCorrelation],
		["jiraAdapter.createTicket", input?.jiraAdapter?.createTicket],
		["persistence.persistSyncState", input?.persistence?.persistSyncState],
		["persistence.readSyncState", input?.persistence?.readSyncState],
		["persistence.readLocalTickets", input?.persistence?.readLocalTickets],
	];
	const missing = [
		...(input?.localTickets && typeof input.localTickets === "object" ? [] : ["localTickets"]),
		...(input?.syncState && typeof input.syncState === "object" ? [] : ["syncState"]),
		...requiredCallbacks.filter(([, callback]) => typeof callback !== "function").map(([name]) => name),
	];
	if (missing.length > 0) {
		const reason = `Local/Jira initial backfill requires ${missing.join(", ")}.`;
		return {
			audit: null,
			plan: null,
			effects: [backfillStateEffect("BLOCKING_CONFLICT", reason)],
			blockers: [reason],
			input,
			localTicketsFingerprint: null,
			syncFingerprint: null,
		};
	}

	const audit = await auditBackfill(input.localTickets, input.syncState, input.jiraAdapter);
	const auditProblems = ["missing", "stale", "duplicated", "conflicting"]
		.flatMap(classification => audit[classification].map(entry => ({ classification, ...entry })));
	const blockers = auditProblems.map(problem =>
		`Local/Jira mapping audit found ${problem.classification} state for ${problem.localId}${problem.jiraId ? ` (${problem.jiraId})` : ""}.`,
	);
	const plan = planBackfill(input.localTickets, input.syncState, config);
	const localTicketsFingerprint = hash(input.localTickets);
	const syncFingerprint = hash(input.syncState);
	const effects = [
		backfillStateEffect(
			blockers.length > 0 ? "BLOCKING_CONFLICT" : "NO-OP",
			blockers.length > 0 ? "Resolve Local/Jira mapping audit failures before backfill." : "Local/Jira mapping audit completed without conflicts.",
			hash({ audit, localTicketsFingerprint, syncFingerprint }),
		),
		...plan.unmapped.map((entry, index) => ({
			order: 201 + index,
			target: `jira:${entry.proposedProject}:${entry.localId}`,
			kind: "external",
			classification: "CREATE",
			reason: `Create or recover the Jira issue for Local ticket ${entry.localId}.`,
			diff: JSON.stringify({
				sourceLink: entry.sourceLink,
				proposedType: entry.proposedType,
				mappedFields: entry.mappedFields,
				unsupportedFields: entry.unsupportedFields,
			}),
			fingerprint: entry.correlationToken,
		})),
	];
	return { audit, plan, effects, blockers, input, localTicketsFingerprint, syncFingerprint };
}

function publicBackfillPlan(backfill) {
	if (!backfill) return null;
	return {
		audit: backfill.audit,
		plan: backfill.plan,
		effects: backfill.effects,
		localTicketsFingerprint: backfill.localTicketsFingerprint,
		syncFingerprint: backfill.syncFingerprint,
	};
}

function withBackfillReadiness(readiness, backfill, execution) {
	if (!backfill) return readiness;
	const pending = execution?.pending ?? backfill.plan?.unmapped.map(entry => entry.localId) ?? [];
	const errors = execution?.errors?.map(entry => `${entry.localId}: ${entry.error}`) ?? [];
	const blockers = [...backfill.blockers, ...errors];
	const ready = blockers.length === 0 && pending.length === 0;
	const backfillBlockers = blockers.length > 0
		? blockers
		: pending.length > 0
			? [`Pending Local/Jira backfill: ${pending.join(", ")}.`]
			: [];
	return {
		...(readiness ?? {}),
		jiraBackfillReady: ready,
		jiraReady: (readiness?.jiraReady ?? true) && ready,
		...(readiness?.blockers || !ready
			? {
				blockers: {
					...(readiness?.blockers ?? {}),
					...(!ready ? { jiraBackfill: backfillBlockers } : {}),
				},
			}
			: {}),
	};
}

async function refreshPlannedBackfill(backfill) {
	if (!backfill) return null;
	const durableLocalTickets = await backfill.input.persistence.readLocalTickets();
	if (hash(durableLocalTickets) !== backfill.localTicketsFingerprint) {
		throw new Error("Local tickets changed after manifest authorization.");
	}
	const durableSyncState = await backfill.input.persistence.readSyncState();
	if (hash(durableSyncState) !== backfill.syncFingerprint) {
		throw new Error("Local/Jira sync state changed after manifest authorization.");
	}
	const durableAudit = await auditBackfill(durableLocalTickets, durableSyncState, backfill.input.jiraAdapter);
	if (hash(durableAudit) !== hash(backfill.audit)) {
		throw new Error("Jira mappings changed after manifest authorization.");
	}
	return {
		...backfill,
		audit: durableAudit,
		input: {
			...backfill.input,
			localTickets: durableLocalTickets,
			syncState: durableSyncState,
		},
	};
}
async function executePlannedBackfill(backfill) {
	if (!backfill) return { completed: [], pending: [], errors: [], nextSyncState: undefined };
	if (!backfill.plan || backfill.plan.unmapped.length === 0) {
		return { completed: [], pending: [], errors: [], nextSyncState: backfill.input.syncState };
	}
	return executeBackfill({
		plan: backfill.plan,
		syncState: backfill.input.syncState,
		jiraAdapter: backfill.input.jiraAdapter,
		persistence: backfill.input.persistence,
	});
}

function backfillOperations(execution) {
	return [
		...execution.completed.map(localId => ({
			action: "verify",
			target: `jira:backfill:${localId}`,
			remoteId: execution.nextSyncState?.mappings?.[localId]?.jiraId ?? null,
		})),
		...execution.pending.map(localId => ({ action: "pending", target: `jira:backfill:${localId}` })),
	];
}

function backfillFailure(execution, error) {
	const pending = execution?.pending ?? [];
	return {
		target: pending[0] ? `jira:backfill:${pending[0]}` : "jira:backfill",
		error: error?.message ?? execution?.errors?.[0]?.error ?? "Local/Jira backfill did not complete.",
		completed: execution?.completed ?? [],
		pending,
	};
}
function projectDocumentationDiscovery(discovery, corePlan) {
	const entries = Object.fromEntries(Object.entries(discovery.entries).map(([target, entry]) => [target, { ...entry }]));
	for (const effect of corePlan?.effects ?? []) {
		if (!MUTATIONS.has(effect.classification) || effect.kind === "state") continue;
		if (entries[effect.target]) {
			entries[effect.target] = effect.kind === "directory"
				? { kind: "directory", fingerprint: "directory" }
				: { kind: "file", content: effect.after, fingerprint: hash(effect.after) };
		}
		for (const [target, entry] of Object.entries(entries)) {
			if (entry.kind === "missing" && effect.target.startsWith(`${target}/`)) {
				entries[target] = { kind: "directory", fingerprint: "directory" };
			}
		}
	}
	return { ...discovery, entries };
}

async function planConfiguredDocumentation(root, projectShape, config, corePlan) {
	if (!config?.docs) return null;
	const discovery = await discoverDocumentation(
		root,
		projectShape,
		{ docs: config.docs, changelog: config.changelog },
	);
	return planDocumentation(projectDocumentationDiscovery(discovery, corePlan));
}

function withDocumentationReadiness(readiness, docsPlan) {
	if (!readiness || !docsPlan) return readiness;
	const docsReady = !docsPlan.effects.some(effect => effect.classification === "BLOCKING_CONFLICT");
	return {
		...readiness,
		docsConfigured: true,
		docsReady,
		blockers: {
			...readiness.blockers,
			docs: docsReady ? [] : readiness.blockers?.docs ?? ["Documentation bootstrap is blocked."],
		},
	};
}


async function runSetup(request) {
	const planned = await runSetupTransaction({
		root: request.root,
		discovery: request.snapshot,
		choices: request.choices,
		originVerifier: request.adapters?.originVerifier,
	});
	if (!planned.plan) throw new Error("The manifest contract requires resolved setup choices.");

	const configSource = request.choices?.targetConfig;
	const configValidation = configSource ? validateCanonicalConfig(configSource) : null;
	const config = configValidation?.status === "valid" ? configValidation.config : null;
	const docsPlan = config
		? await planConfiguredDocumentation(request.root, request.snapshot.projectShape, config, planned.plan)
		: null;
	const backfill = await planLocalJiraBackfill(config, request.adapters);
	const items = [
		...setupItems(planned.plan),
		...(backfill?.effects ?? []).map((effect, index) => item(effect, index, { phase: "backfill", scope: "repository" })),
		...(docsPlan?.effects ?? []).map((effect, index) => item(effect, index, { phase: "docs", scope: "repository" })),
	];
	const blockers = items
		.filter(entry => entry.classification === "BLOCKING_CONFLICT")
		.map(entry => entry.reason);
	const completeHash = hash({
		mode: "setup",
		core: planned.plan.hash,
		backfill: publicBackfillPlan(backfill),
		docs: docsPlan?.hash ?? null,
	});
	const complete = manifest(
		"setup",
		completeHash,
		planned.plan.scope,
		items,
		[...new Set(blockers)],
		{ core: planned.plan, backfill: publicBackfillPlan(backfill), docs: docsPlan },
	);
	const requiresAuthorization = blockers.length === 0 && hasMutation(items);
	if (!request.authorization || !requiresAuthorization) {
		const readiness = withBackfillReadiness(
			withDocumentationReadiness(planned.readiness, docsPlan),
			backfill,
		undefined,
		);
		return {
			manifest: complete,
			requiresAuthorization,
			applied: !requiresAuthorization && blockers.length === 0,
			operations: [],
			readiness,
			report: blockers.length > 0
				? [...new Set([planned.report, ...blockers])].join("\n")
				: requiresAuthorization
					? "Complete setup manifest ready. No files have been changed."
					: planned.report,
			failure: planned.failure,
		};
	}

	assertAuthorization(request.authorization, complete.hash);
	let authorizedBackfill = backfill;
	try {
		authorizedBackfill = await refreshPlannedBackfill(backfill);
		await preflightPlan(request.root, planned.plan);
		if (docsPlan) await preflightDocumentation(request.root, docsPlan);
	} catch (error) {
		if (!/^(?:Local(?: tickets|\/Jira sync state)|Jira mappings) changed after manifest authorization\.$/.test(error.message)) throw error;
		const failure = backfillFailure(undefined, error);
		return {
			manifest: complete,
			requiresAuthorization: false,
			applied: false,
			operations: [],
			readiness: withBackfillReadiness(
				withDocumentationReadiness(planned.readiness, docsPlan),
				backfill,
				{ completed: [], pending: backfill?.plan?.unmapped.map(entry => entry.localId) ?? [], errors: [{ localId: "backfill", error: error.message }] },
			),
			report: `Setup stopped before writes at ${failure.target}: ${failure.error}.`,
			failure,
		};
	}
	const applied = await runSetupTransaction({
		root: request.root,
		discovery: request.snapshot,
		choices: request.choices,
		authorization: planned.plan.hash,
		originVerifier: request.adapters?.originVerifier,
		injectedFailure: request.injection?.failure,
	});
	if (applied.failure) {
		return {
			manifest: complete,
			requiresAuthorization: false,
			applied: false,
			operations: applied.operations,
			readiness: withBackfillReadiness(applied.readiness, backfill, undefined),
			report: applied.report,
			failure: applied.failure,
		};
	}

	let backfillResult;
	try {
		backfillResult = await executePlannedBackfill(authorizedBackfill);
	} catch (error) {
		const failure = backfillFailure(undefined, error);
		return {
			manifest: complete,
			requiresAuthorization: false,
			applied: false,
			operations: applied.operations,
			readiness: withBackfillReadiness(applied.readiness, backfill, { completed: [], pending: backfill?.plan?.unmapped.map(entry => entry.localId) ?? [], errors: [{ localId: "backfill", error: error.message }] }),
			report: `Setup stopped at ${failure.target}: ${failure.error}. No rollback was performed.`,
			failure,
		};
	}
	const externalOperations = backfillOperations(backfillResult);
	if (backfillResult.errors.length > 0 || backfillResult.pending.length > 0) {
		const failure = backfillFailure(backfillResult);
		return {
			manifest: complete,
			requiresAuthorization: false,
			applied: false,
			operations: [...applied.operations, ...externalOperations],
			readiness: withBackfillReadiness(applied.readiness, backfill, backfillResult),
			report: `Setup stopped at ${failure.target}: ${failure.error}. No rollback was performed.`,
			failure,
		};
	}

	let docsOperations = [];
	if (docsPlan) {
		try {
			docsOperations = await applyDocumentation(
				request.root,
				docsPlan,
				docsPlan.hash,
				request.injection?.docsFailure,
			);
		} catch (error) {
			const completed = (error.completed ?? []).map(effect => effect.target);
			const pending = (error.pending ?? []).map(effect => effect.target);
			return {
				manifest: complete,
				requiresAuthorization: false,
				applied: false,
				operations: [...applied.operations, ...externalOperations, ...(error.operations ?? [])],
				readiness: withBackfillReadiness(applied.readiness, backfill, backfillResult),
				report: `Setup documentation stopped at ${pending[0] ?? "documentation:bootstrap"}: ${error.message}. No rollback was performed.`,
				failure: {
					target: pending[0] ?? "documentation:bootstrap",
					error: error.message,
					completed,
					pending,
				},
			};
		}
	}
	return {
		manifest: complete,
		requiresAuthorization: false,
		applied: true,
		operations: [...applied.operations, ...externalOperations, ...docsOperations],
		readiness: withBackfillReadiness(
			withDocumentationReadiness(applied.readiness, docsPlan),
			backfill,
			backfillResult,
		),
		report: docsPlan ? `Documentation bootstrap verified. ${applied.report}` : applied.report,
	};
}

async function runHub(request) {
	const base = {
		root: request.root,
		discovery: request.snapshot,
		choices: request.choices,
		machinePrerequisite: request.adapters?.machinePrerequisite,
		beforePhase: request.adapters?.beforePhase,
		backfill: {
			usesLocalJiraBackfill,
			plan: async (config, target) => planLocalJiraBackfill(config, { jiraBackfill: await request.adapters?.backfillFactory?.(target) }),
			publicPlan: publicBackfillPlan,
			execute: executePlannedBackfill,
			refresh: refreshPlannedBackfill,
			withReadiness: withBackfillReadiness,
			operations: backfillOperations,
			failure: backfillFailure,
		},
	};
	const planned = await runHubTransaction(base);
	const items = hubItems(planned.plan);
	const complete = manifest("hub", planned.plan.hash, planned.plan.scope, items, planned.blockers.map(blocker => blocker.reason), planned.plan);
	if (!request.authorization || !planned.requiresConfirmation) {
		return {
			manifest: complete,
			requiresAuthorization: planned.requiresConfirmation,
			applied: !planned.requiresConfirmation && planned.blockers.length === 0,
			operations: planned.operations,
			readiness: planned.readiness,
			report: planned.report,
			outcomes: planned.outcomes,
		};
	}
	assertAuthorization(request.authorization, complete.hash);
	const applied = await runHubTransaction({
		...base,
		authorization: planned.plan.hash,
		injectedFailure: request.injection?.failure,
	});
	return {
		manifest: complete,
		requiresAuthorization: false,
		applied: !applied.outcomes.some(outcome => outcome.status === "failed"),
		operations: applied.operations,
		readiness: applied.readiness,
		report: applied.report,
		outcomes: applied.outcomes,
	};
}

function materializeReviewedMigrationPlan(corePlan, legacyPlan) {
	const reviewedReplacements = new Map(
		legacyPlan.effects
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
			reason: "Apply the reviewed migration replacement after its semantic values were captured in canonical configuration.",
			after: replacement.after,
			diff: `${JSON.stringify(effect.before)} -> ${JSON.stringify(replacement.after)}`,
		};
	});
	return changed ? { ...corePlan, effects, hash: hash({ delegated: corePlan.hash, effects }) } : corePlan;
}

async function runMigration(request) {
	const legacyPlan = planLegacyMigration(request.snapshot.legacy, request.choices?.migration);
	const coreChoices = legacyPlan.config ? migrationChoices(legacyPlan, request.choices?.core) : null;
	const corePlan = coreChoices
		? materializeReviewedMigrationPlan(buildPlan(request.snapshot.core, coreChoices), legacyPlan)
		: null;
	const [docsPlan, backfill] = await Promise.all([
		planConfiguredDocumentation(
			request.root,
			request.snapshot.core.projectShape,
			legacyPlan.config,
			corePlan,
		),
		planLocalJiraBackfill(legacyPlan.config, request.adapters),
	]);
	const migrationEffects = legacyPlan.effects.filter(effect => effect.order < 900);
	const cleanupEffects = legacyPlan.effects.filter(effect => effect.order >= 900);
	const items = [
		...migrationEffects.map((effect, index) => item(effect, index, { phase: "migration", scope: "repository" })),
		...setupItems(corePlan ?? { effects: [] }, "core", "repository"),
		...(backfill?.effects ?? []).map((effect, index) => item(effect, index, { phase: "backfill", scope: "repository" })),
		...(docsPlan?.effects ?? []).map((effect, index) => item(effect, index, { phase: "docs", scope: "repository" })),
		...cleanupEffects.map((effect, index) => item(effect, index, { phase: "cleanup", scope: "repository" })),
	];
	const blockers = [
		...legacyPlan.blockers,
		...items.filter(entry => entry.classification === "BLOCKING_CONFLICT").map(entry => entry.reason),
	];
	const planHash = hash({
		mode: "migration",
		legacy: legacyPlan.hash,
		core: corePlan?.hash ?? null,
		backfill: publicBackfillPlan(backfill),
		docs: docsPlan?.hash ?? null,
	});
	const complete = manifest(
		"migration",
		planHash,
		{ root: request.root, projectShape: request.snapshot.core.projectShape },
		items,
		[...new Set(blockers)],
		{ legacy: legacyPlan, core: corePlan, backfill: publicBackfillPlan(backfill), docs: docsPlan },
	);
	const requiresAuthorization = blockers.length === 0 && hasMutation(items);
	if (!request.authorization || !requiresAuthorization) {
		const readiness = coreChoices && !requiresAuthorization
			? withBackfillReadiness(deriveReadiness(request.snapshot.core, coreChoices), backfill, undefined)
			: undefined;
		return {
			manifest: complete,
			requiresAuthorization,
			applied: !requiresAuthorization && blockers.length === 0,
			operations: [],
			readiness,
			report: blockers.length > 0
				? [...new Set([legacyPlan.report, ...blockers])].join("\n")
				: requiresAuthorization
					? "Complete migration manifest ready. No files have been changed."
					: legacyPlan.report,
		};
	}
	assertAuthorization(request.authorization, complete.hash);
	let authorizedBackfill;
	try {
		authorizedBackfill = await refreshPlannedBackfill(backfill);
		await preflightPlan(request.root, corePlan);
		if (docsPlan) await preflightDocumentation(request.root, docsPlan);
	} catch (error) {
		if (!/^(?:Local(?: tickets|\/Jira sync state)|Jira mappings) changed after manifest authorization\.$/.test(error.message)) throw error;
		const failure = backfillFailure(undefined, error);
		return {
			manifest: complete,
			requiresAuthorization: false,
			applied: false,
			operations: [],
			readiness: withBackfillReadiness(undefined, backfill, { completed: [], pending: backfill?.plan?.unmapped.map(entry => entry.localId) ?? [], errors: [{ localId: "preflight", error: error.message }] }),
			report: `Migration stopped before writes at ${failure.target}: ${failure.error}.`,
			failure,
		};
	}
	const applyResult = await applyPlan(request.root, corePlan, request.injection?.failure);
	const verifiedDiscovery = await discoverStandaloneRepository(request.root, request.snapshot.core.machine);
	const coreReadiness = deriveReadiness(verifiedDiscovery, coreChoices);
	const failure = applyResult.failure
		? {
			target: applyResult.failure.target,
			error: applyResult.failure.error.message,
			completed: [...applyResult.failure.completed],
			pending: [...applyResult.failure.pending],
		}
		: undefined;
	const core = {
		operations: applyResult.operations,
		readiness: coreReadiness,
		failure,
		report: failure
			? `Migration core stopped at ${failure.target}: ${failure.error}. No rollback was performed.`
			: "WS setup verified through the confirmed migration manifest.",
	};
	if (core.failure) {
		return {
			manifest: complete,
			requiresAuthorization: false,
			applied: false,
			operations: core.operations,
			readiness: withBackfillReadiness(migrationReadiness(core, legacyPlan), backfill, undefined),
			report: core.report,
			failure: core.failure,
		};
	}

	let backfillResult;
	try {
		backfillResult = await executePlannedBackfill(authorizedBackfill);
	} catch (error) {
		const failure = backfillFailure(undefined, error);
		return {
			manifest: complete,
			requiresAuthorization: false,
			applied: false,
			operations: core.operations,
			readiness: withBackfillReadiness(migrationReadiness(core, legacyPlan), backfill, { completed: [], pending: backfill?.plan?.unmapped.map(entry => entry.localId) ?? [], errors: [{ localId: "backfill", error: error.message }] }),
			report: `Migration stopped at ${failure.target}: ${failure.error}. No rollback was performed.`,
			failure,
		};
	}
	const externalOperations = backfillOperations(backfillResult);
	if (backfillResult.errors.length > 0 || backfillResult.pending.length > 0) {
		const failure = backfillFailure(backfillResult);
		return {
			manifest: complete,
			requiresAuthorization: false,
			applied: false,
			operations: [...core.operations, ...externalOperations],
			readiness: withBackfillReadiness(migrationReadiness(core, legacyPlan), backfill, backfillResult),
			report: `Migration stopped at ${failure.target}: ${failure.error}. No rollback was performed.`,
			failure,
		};
	}

	let docsOperations = [];
	if (docsPlan) {
		try {
			docsOperations = await applyDocumentation(
				request.root,
				docsPlan,
				docsPlan.hash,
				request.injection?.docsFailure,
			);
		} catch (error) {
			const completed = (error.completed ?? []).map(effect => effect.target);
			const pending = (error.pending ?? []).map(effect => effect.target);
			return {
				manifest: complete,
				requiresAuthorization: false,
				applied: false,
				operations: [...core.operations, ...externalOperations, ...(error.operations ?? [])],
				readiness: withBackfillReadiness(migrationReadiness(core, legacyPlan), backfill, backfillResult),
				report: `Migration documentation stopped at ${pending[0] ?? "documentation:bootstrap"}: ${error.message}. No rollback was performed.`,
				failure: {
					target: pending[0] ?? "documentation:bootstrap",
					error: error.message,
					completed,
					pending,
				},
			};
		}
	}
	let readiness = migrationReadiness(core, legacyPlan);
	if (request.adapters?.verifyMigrationReadiness) {
		readiness = {
			...readiness,
			...await request.adapters.verifyMigrationReadiness({ manifest: complete, legacyPlan, coreResult: core }),
		};
	}
	readiness = withBackfillReadiness(readiness, backfill, backfillResult);
	const cleanupRuntimeEvidence = {
		sessionDiscipline: readiness.runtimeReady === true && verifiedDiscovery.machine.sessionDiscipline === true,
		dangerousGitGuard: readiness.runtimeReady === true && verifiedDiscovery.machine.dangerousGitGuard === true,
	};
	let cleanup;
	try {
		cleanup = await applyLegacyCleanup(request.root, legacyPlan, legacyPlan.hash, cleanupRuntimeEvidence, request.injection?.cleanupFailure);
	} catch (error) {
		const completedOperations = error.cleanupProgress?.completed ?? [];
		const completed = completedOperations.map(operation => operation.target);
		const pending = error.cleanupProgress?.pending ?? [];
		const failed = error.cleanupProgress?.failed;
		const failedTarget = failed?.target ?? pending[0] ?? "migration:cleanup";
		return {
			manifest: complete,
			requiresAuthorization: false,
			applied: false,
			operations: [...core.operations, ...externalOperations, ...docsOperations, ...completedOperations],
			readiness: {
				...readiness,
				runtimeReady: false,
			},
			report: `Migration cleanup stopped at ${failedTarget}: ${failed?.reason ?? error.message}. No rollback was performed.`,
			failure: {
				target: failedTarget,
				error: failed?.reason ?? error.message,
				completed,
				pending,
			},
		};
	}
	return {
		manifest: complete,
		requiresAuthorization: false,
		applied: true,
		operations: [...core.operations, ...externalOperations, ...docsOperations, ...cleanup],
		readiness,
		report: `Legacy migration verified. ${core.report}`,
	};
}

async function runReconfigure(request) {
	const plan = createReconfigurePlan(
		request.snapshot.config,
		request.snapshot.target,
		request.snapshot.machine,
		request.choices,
		request.contribution,
	);
	const items = plan.effects.map((effect, index) => item(effect, index, { phase: effect.phase, scope: plan.scope.join(",") }));
	const complete = manifest("reconfigure", plan.hash, { repositories: plan.scope, domains: plan.domains }, items, plan.blockers.map(blocker => blocker.reason), plan);
	const requiresAuthorization = plan.blockers.length === 0 && hasMutation(items);
	if (!request.authorization || !requiresAuthorization) {
		return {
			manifest: complete,
			requiresAuthorization,
			applied: !requiresAuthorization && plan.blockers.length === 0,
			operations: [],
			readiness: undefined,
			report: plan.report,
		};
	}
	assertAuthorization(request.authorization, complete.hash);
	if (!request.adapters) throw new Error("Reconfiguration adapters are required after authorization.");
	const applied = request.action === "resume"
		? await resumeConfirmedPlan(plan, request.context, request.adapters, request.injection?.reconfigure)
		: request.action === "accept_partial"
			? await acceptConfirmedPartial(request.snapshot.config, plan, request.context, request.adapters)
			: await applyConfirmedPlan(plan, request.context, request.adapters, request.injection?.reconfigure);
	return {
		manifest: complete,
		requiresAuthorization: false,
		applied: applied.success,
		operations: applied.operationReport,
		readiness: applied.readiness,
		report: applied.report,
		phase: applied.phase,
		ownership: applied.ownershipReport,
	};
}

/**
 * Highest deterministic WS setup seam. It only categorizes and dispatches to
 * the existing setup, migration, hub, and reconfiguration transactions.
 */
export async function runManifestTransaction(request) {
	if (!request || !["setup", "migration", "hub", "reconfigure"].includes(request.mode)) {
		throw new Error("Unsupported manifest transaction mode.");
	}
	if (!request.root || !request.snapshot) throw new Error("A discovered workspace snapshot and root are required.");
	if (request.mode === "setup") return runSetup(request);
	if (request.mode === "migration") return runMigration(request);
	if (request.mode === "hub") return runHub(request);
	return runReconfigure(request);
}
