import { createHash } from "node:crypto";
import { serializeCanonicalConfig, validateCanonicalConfig } from "./config.mjs";
import { runHubTransaction } from "./hub-transaction.mjs";
import { applyLegacyCleanup, planLegacyMigration } from "./migration.mjs";
import { acceptConfirmedPartial, applyConfirmedPlan, createReconfigurePlan, resumeConfirmedPlan } from "./reconfigure.mjs";
import { applyPlan, buildPlan, deriveReadiness, discoverStandaloneRepository, runSetupTransaction } from "./transaction.mjs";
import { applyDocumentation, discoverDocumentation, planDocumentation } from "../ws-docs-bootstrap/transaction.mjs";

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
		for (const [index, effect] of (target.docs?.effects ?? []).entries()) {
			items.push(item(effect, index, { phase: "docs", scope: target.name }));
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
async function planConfiguredDocumentation(root, projectShape, config) {
	if (!config?.docs) return null;
	return planDocumentation(await discoverDocumentation(
		root,
		projectShape,
		{ docs: config.docs, changelog: config.changelog },
	));
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
	const docsPlan = configValidation?.status === "valid"
		? await planConfiguredDocumentation(request.root, request.snapshot.projectShape, configValidation.config)
		: null;
	const items = [
		...setupItems(planned.plan),
		...(docsPlan?.effects ?? []).map((effect, index) => item(effect, index, { phase: "docs", scope: "repository" })),
	];
	const blockers = items
		.filter(entry => entry.classification === "BLOCKING_CONFLICT")
		.map(entry => entry.reason);
	const completeHash = hash({ mode: "setup", core: planned.plan.hash, docs: docsPlan?.hash ?? null });
	const complete = manifest(
		"setup",
		completeHash,
		planned.plan.scope,
		items,
		[...new Set(blockers)],
		{ core: planned.plan, docs: docsPlan },
	);
	const requiresAuthorization = blockers.length === 0 && hasMutation(items);
	if (!request.authorization || !requiresAuthorization) {
		return {
			manifest: complete,
			requiresAuthorization,
			applied: !requiresAuthorization && blockers.length === 0,
			operations: [],
			readiness: withDocumentationReadiness(planned.readiness, docsPlan),
			report: blockers.length > 0
				? planned.report
				: requiresAuthorization
					? "Complete setup manifest ready. No files have been changed."
					: planned.report,
			failure: planned.failure,
		};
	}

	assertAuthorization(request.authorization, complete.hash);
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
			readiness: applied.readiness,
			report: applied.report,
			failure: applied.failure,
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
				operations: [...applied.operations, ...(error.operations ?? [])],
				readiness: applied.readiness,
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
		operations: [...applied.operations, ...docsOperations],
		readiness: withDocumentationReadiness(applied.readiness, docsPlan),
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
	const docsPlan = await planConfiguredDocumentation(
		request.root,
		request.snapshot.core.projectShape,
		legacyPlan.config,
	);
	const items = [
		...legacyPlan.effects.map((effect, index) => item(effect, index, { phase: effect.order >= 900 ? "cleanup" : "migration", scope: "repository" })),
		...setupItems(corePlan ?? { effects: [] }, "core", "repository"),
		...(docsPlan?.effects ?? []).map((effect, index) => item(effect, index, { phase: "docs", scope: "repository" })),
	];
	const blockers = [
		...legacyPlan.blockers,
		...items.filter(entry => entry.classification === "BLOCKING_CONFLICT").map(entry => entry.reason),
	];
	const planHash = hash({
		mode: "migration",
		legacy: legacyPlan.hash,
		core: corePlan?.hash ?? null,
		docs: docsPlan?.hash ?? null,
	});
	const complete = manifest(
		"migration",
		planHash,
		{ root: request.root, projectShape: request.snapshot.core.projectShape },
		items,
		[...new Set(blockers)],
		{ legacy: legacyPlan, core: corePlan, docs: docsPlan },
	);
	const requiresAuthorization = blockers.length === 0 && hasMutation(items);
	if (!request.authorization || !requiresAuthorization) {
		const readiness = coreChoices && !requiresAuthorization ? deriveReadiness(request.snapshot.core, coreChoices) : undefined;
		return {
			manifest: complete,
			requiresAuthorization,
			applied: !requiresAuthorization && blockers.length === 0,
			operations: [],
			readiness,
			report: blockers.length > 0 ? legacyPlan.report : requiresAuthorization ? "Complete migration manifest ready. No files have been changed." : legacyPlan.report,
		};
	}
	assertAuthorization(request.authorization, complete.hash);
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
			readiness: migrationReadiness(core, legacyPlan),
			report: core.report,
			failure: core.failure,
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
				operations: [...core.operations, ...(error.operations ?? [])],
				readiness: migrationReadiness(core, legacyPlan),
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
	const cleanupRuntimeEvidence = {
		sessionDiscipline: readiness.runtimeReady === true && verifiedDiscovery.machine.sessionDiscipline === true,
		dangerousGitGuard: readiness.runtimeReady === true && verifiedDiscovery.machine.dangerousGitGuard === true,
	};
	const cleanup = await applyLegacyCleanup(request.root, legacyPlan, legacyPlan.hash, cleanupRuntimeEvidence);
	return {
		manifest: complete,
		requiresAuthorization: false,
		applied: true,
		operations: [...core.operations, ...docsOperations, ...cleanup],
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
