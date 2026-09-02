const TRIAGE_ROLES = Object.freeze(["needs_triage", "needs_info", "ready_for_agent", "ready_for_human", "wontfix"]);
const DOMAIN_ARTIFACT_KINDS = new Set(["context", "decision", "map"]);

function routingError(message, code) {
	const error = new Error(message);
	error.code = code;
	return error;
}

function parseItem(target, entry) {
	if (!target.startsWith("local:ticket:") && !target.startsWith("remote:ticket:")) return null;
	if (entry.kind === "blocked") return { target, entry, content: {}, parseBlocked: true };
	try {
		const content = typeof entry.content === "string" ? JSON.parse(entry.content) : entry.content || {};
		return { target, entry, content, parseBlocked: false };
	} catch {
		return { target, entry, content: {}, parseBlocked: true };
	}
}

function normalizedTriageMappings(config, choices) {
	if (!config.triage?.labels) throw routingError("Triage reconfiguration requires a complete triage section.", "ERR_MISSING_TRIAGE_BASELINE");
	const mappings = [];
	for (const [role, requested] of Object.entries(choices.triageMappings || {})) {
		if (!TRIAGE_ROLES.includes(role)) throw routingError(`Unknown triage semantic role: ${role}.`, "ERR_UNKNOWN_TRIAGE_ROLE");
		const newLabel = typeof requested === "string" ? requested : requested?.newLabel;
		if (typeof newLabel !== "string" || newLabel.trim() === "") throw routingError(`A non-empty label is required for ${role}.`, "ERR_INVALID_TRIAGE_LABEL");
		const field = `triage.labels.${role}`;
		if (!(choices.fields || []).includes(field) || choices.values?.[field] !== newLabel) {
			throw routingError(`Semantic role ${role} must be selected as concrete field ${field} with the same proposed label.`, "ERR_TRIAGE_FIELD_REQUIRED");
		}
		mappings.push({ role, oldLabel: config.triage.labels[role], newLabel });
	}
	const proposed = new Set(mappings.map(mapping => mapping.newLabel));
	if (proposed.size !== mappings.length) throw routingError("Proposed triage labels must remain unique by semantic role.", "ERR_DUPLICATE_TRIAGE_LABEL");
	return mappings.sort((left, right) => left.role.localeCompare(right.role));
}

export function planTriage(config, snapshot, machine, choices) {
	const effects = [];
	const blockers = [];
	const dependencyClosure = [];
	const affectedItems = [];
	const fieldDependencies = {};
	const mappings = normalizedTriageMappings(config, choices);
	const items = Object.entries(snapshot.entries || {}).map(([target, entry]) => parseItem(target, entry)).filter(Boolean);

	for (const mapping of mappings) {
		if (mapping.oldLabel === mapping.newLabel) continue;
		const labelTarget = `remote:label:${mapping.newLabel}`;
		const labelEntry = snapshot.entries?.[labelTarget] || { kind: "missing", fingerprint: null };
		const labelId = `prepare:triage-label:${mapping.role}:${mapping.newLabel}`;
		if (labelEntry.kind === "blocked") {
			const effect = {
				id: labelId,
				order: 1,
				phase: "prepare",
				target: labelTarget,
				kind: "state",
				classification: "BLOCKING_CONFLICT",
				reason: `The target label for semantic role ${mapping.role} cannot be validated.`,
				diff: "blocked",
				fingerprint: labelEntry.fingerprint ?? null,
			};
			effects.push(effect);
			blockers.push({ id: effect.id, target: effect.target, reason: effect.reason });
			continue;
		}
		const labelExists = labelEntry.kind !== "missing";
		effects.push({
			id: labelId,
			order: 1,
			phase: "prepare",
			target: labelTarget,
			kind: "state",
			classification: labelExists ? "NO-OP" : "CREATE",
			reason: labelExists
				? `Validate the existing label for semantic role ${mapping.role}.`
				: `Create the new label for semantic role ${mapping.role} before cutover.`,
			diff: labelExists ? "validated" : "created",
			fingerprint: labelEntry.fingerprint ?? null,
			remoteFingerprint: labelEntry.fingerprint ?? null,
			payload: { operation: labelExists ? "validate_label" : "create_label", external: true, role: mapping.role, label: mapping.newLabel },
		});
		fieldDependencies[`triage.labels.${mapping.role}`] = labelExists ? [] : [labelId];

		for (const item of items) {
			const labels = Array.isArray(item.content.labels) ? item.content.labels : [];
			if (!item.parseBlocked && !labels.includes(mapping.oldLabel)) continue;
			const affected = { target: item.target, role: mapping.role, oldLabel: mapping.oldLabel, newLabel: mapping.newLabel };
			affectedItems.push(affected);
			const blockedReasons = [];
			if (item.parseBlocked) blockedReasons.push("item state cannot be parsed or read");
			if (item.content.claimed === true) blockedReasons.push("claimed work");
			if (item.content.unresolvedConflict === true) blockedReasons.push("unresolved tracker conflict");
			if (item.content.pendingSync === true) blockedReasons.push("pending synchronization");
			if (blockedReasons.length > 0) {
				const effect = {
					id: `block:${item.target}:${mapping.role}`,
					order: 2,
					phase: "prepare",
					target: item.target,
					kind: "state",
					classification: "BLOCKING_CONFLICT",
					reason: `Affected item blocks semantic relabeling: ${blockedReasons.join(", ")}.`,
					diff: "blocked",
					fingerprint: item.entry.fingerprint ?? null,
				};
				effects.push(effect);
				blockers.push({ id: effect.id, target: effect.target, reason: effect.reason });
				continue;
			}
			const addId = `cutover:${item.target}:add:${mapping.role}`;
			const isRemote = item.target.startsWith("remote:");
			effects.push({
				id: addId,
				order: 21,
				phase: "cutover",
				target: item.target,
				kind: "state",
				classification: "UPDATE",
				reason: `Add the new label for semantic role ${mapping.role} to this affected item.`,
				diff: `${mapping.oldLabel} + ${mapping.newLabel}`,
				fingerprint: item.entry.fingerprint ?? null,
				...(isRemote ? { remoteFingerprint: item.entry.remoteFingerprint ?? item.entry.fingerprint ?? null } : {}),
				dependencies: labelExists ? [] : [labelId],
				payload: { operation: "add_semantic_label", external: isRemote, role: mapping.role, oldLabel: mapping.oldLabel, newLabel: mapping.newLabel },
			});
			const configId = `cutover:config:triage.labels.${mapping.role}:set`;
			effects.push({
				id: `cleanup:${item.target}:remove:${mapping.role}`,
				order: 31,
				phase: "cleanup",
				target: item.target,
				kind: "state",
				classification: "UPDATE",
				reason: `Remove the old label from this affected item only after the new mapping is active.`,
				diff: `${mapping.oldLabel} removed`,
				fingerprint: item.entry.fingerprint ?? null,
				...(isRemote ? { remoteFingerprint: item.entry.remoteFingerprintAfterCutover ?? null } : {}),
				dependencies: [addId, configId],
				payload: { operation: "remove_old_semantic_label", external: isRemote, role: mapping.role, oldLabel: mapping.oldLabel, newLabel: mapping.newLabel },
			});
		}
	}

	return { effects, blockers, dependencyClosure, fieldDependencies, affectedItems, blocking: blockers.length > 0 };
}

function normalizeArtifactRoutes(choices) {
	if (Array.isArray(choices.artifactRoutes)) return choices.artifactRoutes;
	return Object.entries(choices.contextMap || {}).map(([source, value]) => typeof value === "string"
		? { source, destination: value, kind: "context", intent: choices.authorizeSourceDelete ? "move" : "copy" }
		: { source, ...value });
}

function snapshotTarget(entries, side, path) {
	if (Object.hasOwn(entries, path)) return path;
	const namespaced = `domain:${side}:${path}`;
	return Object.hasOwn(entries, namespaced) ? namespaced : path;
}

export function planDomain(config, snapshot, machine, choices) {
	if (!config.domain) throw routingError("Domain reconfiguration requires a complete domain section.", "ERR_MISSING_DOMAIN_BASELINE");
	const layoutField = "domain.layout";
	const layoutSelected = (choices.fields || []).includes(layoutField);
	const proposedLayout = choices.values?.[layoutField];
	const layoutChanges = layoutSelected && proposedLayout !== config.domain.layout;
	const routes = normalizeArtifactRoutes(choices);
	if (layoutChanges && routes.length === 0) throw routingError("A domain layout change requires an explicit artifact routing manifest.", "ERR_DOMAIN_ROUTES_REQUIRED");
	if (layoutChanges) {
		const kinds = new Set(routes.map(route => route.kind));
		if (!kinds.has("context") || !kinds.has("decision")) {
			throw routingError("A domain layout change must route both context and decision artifacts explicitly.", "ERR_INCOMPLETE_DOMAIN_ROUTES");
		}
	}

	const effects = [];
	const blockers = [];
	const collisions = [];
	const destinationIds = [];
	const fieldDependencies = {};
	const entries = snapshot.entries || {};
	for (const route of routes) {
		if (!route || typeof route.source !== "string" || typeof route.destination !== "string" || !DOMAIN_ARTIFACT_KINDS.has(route.kind) || !["copy", "move"].includes(route.intent)) {
			throw routingError("Each domain route requires source, destination, context/decision/map kind, and copy/move intent.", "ERR_INVALID_DOMAIN_ROUTE");
		}
		const sourceTarget = snapshotTarget(entries, "source", route.source);
		const destinationTarget = snapshotTarget(entries, "destination", route.destination);
		const sourceEntry = entries[sourceTarget] || { kind: "missing", fingerprint: null };
		const destinationEntry = entries[destinationTarget] || { kind: "missing", fingerprint: null };
		if (sourceEntry.kind === "missing" || sourceEntry.kind === "blocked") {
			const effect = {
				id: `block:${sourceTarget}:missing-source`,
				order: 1,
				phase: "prepare",
				target: sourceTarget,
				kind: "state",
				classification: "BLOCKING_CONFLICT",
				reason: `Explicit ${route.kind} source cannot be read for routing.`,
				diff: "blocked",
				fingerprint: sourceEntry.fingerprint ?? null,
			};
			effects.push(effect);
			blockers.push({ id: effect.id, target: effect.target, reason: effect.reason });
			continue;
		}
		if (destinationEntry.kind !== "missing") {
			const collision = { source: sourceTarget, destination: destinationTarget, kind: route.kind, resolution: route.collisionResolution || "unresolved" };
			collisions.push(collision);
			if (route.collisionResolution !== "keep-destination") {
				const effect = {
					id: `block:${destinationTarget}:collision`,
					order: 1,
					phase: "prepare",
					target: destinationTarget,
					kind: "state",
					classification: "BLOCKING_CONFLICT",
					reason: `Visible ${route.kind} collision requires an explicit reviewed resolution.`,
					diff: "blocked",
					fingerprint: destinationEntry.fingerprint ?? null,
				};
				effects.push(effect);
				blockers.push({ id: effect.id, target: effect.target, reason: effect.reason });
				continue;
			}
			effects.push({
				id: `preserve:${destinationTarget}:collision`,
				order: 2,
				phase: "prepare",
				target: destinationTarget,
				kind: destinationEntry.kind,
				classification: "PRESERVE",
				reason: "Keep the reviewed destination collision unchanged.",
				diff: "unchanged",
				fingerprint: destinationEntry.fingerprint ?? null,
			});
			continue;
		}

		const destinationId = `prepare:${destinationTarget}:copy`;
		destinationIds.push(destinationId);
		effects.push({
			id: destinationId,
			order: 5,
			phase: "prepare",
			target: destinationTarget,
			kind: sourceEntry.kind === "directory" ? "directory" : "file",
			classification: "CREATE",
			reason: `Copy the authored ${route.kind} artifact and verify it before active routing changes.`,
			after: sourceEntry.content,
			diff: `copy ${sourceTarget} -> ${destinationTarget}`,
			fingerprint: { source: sourceEntry.fingerprint ?? null, destination: destinationEntry.fingerprint ?? null },
			payload: { operation: "copy_domain_artifact", source: sourceTarget, destination: destinationTarget, artifactKind: route.kind, preserveAuthoredBytes: true },
		});
		if (route.intent === "move") {
			if (route.authorizeSourceDelete !== true && choices.authorizeSourceDelete !== true) {
				effects.push({
					id: `preserve:${sourceTarget}:move-not-authorized`,
					order: 31,
					phase: "cleanup",
					target: sourceTarget,
					kind: sourceEntry.kind,
					classification: "PRESERVE",
					reason: "Preserve authored source because deletion was not explicitly authorized.",
					diff: "unchanged",
					fingerprint: sourceEntry.fingerprint ?? null,
				});
			} else {
				effects.push({
					id: `cleanup:${sourceTarget}:delete`,
					order: 31,
					phase: "cleanup",
					target: sourceTarget,
					kind: sourceEntry.kind,
					classification: "DELETE",
					reason: "Delete the explicitly authorized source only after destination and active routing verify.",
					diff: "deleted",
					fingerprint: sourceEntry.fingerprint ?? null,
					dependencies: [destinationId, `cutover:config:${layoutField}:set`],
					destructive: true,
					payload: { operation: "delete_authorized_domain_source", source: sourceTarget, destination: destinationTarget },
				});
			}
		}
	}
	if (layoutSelected) fieldDependencies[layoutField] = destinationIds;
	return {
		effects,
		blockers,
		dependencyClosure: destinationIds.map(id => ({ field: layoutField, reason: "Active domain routing depends on verified destination artifacts.", resolution: "selected", effectId: id })),
		fieldDependencies,
		collisions,
		blocking: blockers.length > 0,
	};
}
