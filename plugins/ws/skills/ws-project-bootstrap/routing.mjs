export function planTriage(config, snapshot, machine, choices) {
    const effects = [];
    let requiresConfirmation = false;
    let dependencyClosure = [];
    const mappings = choices.triageMappings || {};
    let blocking = false;

    // Prepare: Create new labels
    for (const [oldLabel, mapping] of Object.entries(mappings)) {
        effects.push({
            order: 5,
            target: `remote:label:${mapping.newLabel}`,
            kind: "state",
            classification: "CREATE",
            reason: `Create mapped label for role ${mapping.role}`,
            diff: "created",
            fingerprint: null
        });
        requiresConfirmation = true;
    }

    // Identify affected tickets
    const affectedTickets = [];
    for (const [target, entry] of Object.entries(snapshot.entries)) {
        if (target.startsWith("remote:ticket:")) {
            try {
                const content = JSON.parse(entry.content || "{}");
                const ticketLabels = content.labels || [];
                const affectedBy = Object.keys(mappings).filter(old => ticketLabels.includes(old));
                
                if (affectedBy.length > 0) {
                    affectedTickets.push({ target, entry, content, affectedBy });
                }
            } catch (e) {
                // ignore unparseable
            }
        }
    }

    // Cutover: Add new labels & check blocks
    for (const item of affectedTickets) {
        if (item.entry.kind === "blocked" || item.content.claimed || item.content.unresolvedConflict) {
            blocking = true;
            effects.push({
                order: 20,
                target: item.target,
                kind: "state",
                classification: "BLOCKING_CONFLICT",
                reason: `Ticket has claimed work or unresolved conflict`,
                diff: "blocked",
                fingerprint: item.entry.fingerprint
            });
        } else {
            effects.push({
                order: 20,
                target: item.target,
                kind: "state",
                classification: "UPDATE",
                reason: `Map new semantic labels to ticket`,
                diff: "changed",
                fingerprint: item.entry.fingerprint
            });
            requiresConfirmation = true;
        }
    }

    // Cleanup: Remove old labels from affected items only after new state active
    for (const item of affectedTickets) {
        if (item.entry.kind !== "blocked" && !item.content.claimed && !item.content.unresolvedConflict) {
            effects.push({
                order: 35,
                target: item.target + ":old_labels",
                kind: "state",
                classification: "UPDATE",
                reason: `Remove old labels from ticket after new state is active`,
                diff: "removed",
                fingerprint: null
            });
            requiresConfirmation = true;
        }
    }

    return { effects, requiresConfirmation, dependencyClosure, blocking };
}

export function planDomain(config, snapshot, machine, choices) {
    const effects = [];
    let requiresConfirmation = false;
    let dependencyClosure = [];
    const contextMap = choices.contextMap || {};
    let blocking = false;

    // Iterate through domain sources
    for (const [source, destination] of Object.entries(contextMap)) {
        const sourceTarget = `domain:source:${source}`;
        const destTarget = `domain:destination:${destination}`;
        
        const sourceEntry = snapshot.entries[sourceTarget];
        const destEntry = snapshot.entries[destTarget];

        if (!sourceEntry || sourceEntry.kind === "missing") {
            continue; // Nothing to move
        }

        // Cutover: Routing destination
        if (destEntry && destEntry.kind !== "missing") {
            // Collision handling rather than inferred semantics
            blocking = true;
            effects.push({
                order: 20,
                target: destTarget,
                kind: "state",
                classification: "BLOCKING_CONFLICT",
                reason: `Visible collision: Destination ${destination} already exists`,
                diff: "blocked",
                fingerprint: destEntry.fingerprint
            });
        } else {
            // Valid move
            effects.push({
                order: 20,
                target: destTarget,
                kind: "state",
                classification: "CREATE",
                reason: `Source-to-destination routing for decision and context artifacts`,
                diff: "created",
                fingerprint: null
            });
            requiresConfirmation = true;
        }

        // Cleanup: Source deletion only if authorized
        if (choices.authorizeSourceDelete) {
            effects.push({
                order: 35,
                target: sourceTarget,
                kind: "state",
                classification: "UPDATE",
                reason: `Explicitly authorized source deletion`,
                diff: "removed",
                fingerprint: sourceEntry.fingerprint
            });
            requiresConfirmation = true;
        } else {
            // Authored prose is preserved
            effects.push({
                order: 35,
                target: sourceTarget,
                kind: "state",
                classification: "PRESERVE",
                reason: `Authored prose is preserved. Source deletion not authorized.`,
                diff: "unchanged",
                fingerprint: sourceEntry.fingerprint
            });
        }
    }

    return { effects, requiresConfirmation, dependencyClosure, blocking };
}
