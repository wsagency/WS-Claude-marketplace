import { flattenPaths, getPath, setPath } from "./migration-primitives.mjs";

export function discoverJiraState(snapshots) {
	const globalValues = snapshots["~/.claude/ws/config.yaml"] || {};
	const projectValues = snapshots[".claude/ws-project.yaml"] || {};
	const docsValues = snapshots[".claude/docs-config.yaml"] || {};
	
	const unrecognized = [];
	const knownGlobalKeys = ["jira.site", "atlassian.cloud_id", "atlassian.account_id", "defaults.jira_actions", "defaults.pr_transition", "defaults.smart_commit_trailer", "defaults.commit_comment", "ui.session_start_dashboard"];
	const knownProjectKeys = ["jira.project", "jira.board", "jira.default_issue_type", "changelog.path", "changelog.skip_types", "changelog.auto_update", "hooks.session_start_dashboard"];
	const knownDocsKeys = ["auto.changelog_per_commit", "auto.adr_for_arch_changes", "docs.changelog.skip_types", "docs.user_track", "docs.dev_track", "docs.default_audience", "docs.default_scope"];
	

	const flatGlobal = flattenPaths(globalValues);
	const flatProject = flattenPaths(projectValues);
	const flatDocs = flattenPaths(docsValues);
	
	for (const key of Object.keys(flatGlobal)) {
		if (!knownGlobalKeys.includes(key)) unrecognized.push({ source: "~/.claude/ws/config.yaml", key, value: flatGlobal[key] });
	}
	for (const key of Object.keys(flatProject)) {
		if (!knownProjectKeys.includes(key)) unrecognized.push({ source: ".claude/ws-project.yaml", key, value: flatProject[key] });
	}
	for (const key of Object.keys(flatDocs)) {
		if (!knownDocsKeys.includes(key)) unrecognized.push({ source: ".claude/docs-config.yaml", key, value: flatDocs[key] });
	}

	return {
		hasGlobalConfig: Object.keys(globalValues).length > 0,
		hasProjectConfig: Object.keys(projectValues).length > 0,
		hasDocsConfig: Object.keys(docsValues).length > 0,
		globalValues: flatGlobal,
		projectValues: flatProject,
		docsValues: flatDocs,
		unrecognized
	};
}

export function planJiraMigration(discovery, currentCanonical, resolutions) {
	const patch = JSON.parse(JSON.stringify(currentCanonical || {}));
	const conflicts = [];
	const suggestions = [];
	const effects = [];
	const blockers = [];
	

	// Local mappings
	const { projectValues = {}, docsValues = {}, globalValues = {} } = discovery;
	const unrecognizedLocal = (discovery.unrecognized ?? []).filter(item => item.source === ".claude/ws-project.yaml");
	for (const item of unrecognizedLocal) {
		blockers.push(`Unrecognized legacy field ${item.source}:${item.key}`);
		effects.push({
			classification: "BLOCKING_CONFLICT",
			target: item.source,
			fields: [item.key],
			reason: "Unknown repository-local legacy policy must be resolved before cleanup"
		});
	}
	const trackedFields = new Set();
	
	// Helper for local values
	const handleLocal = (legacyKey, canonicalKey, transform = v => v) => {
		const canonVal = getPath(currentCanonical, canonicalKey);
		if (canonVal !== undefined) return;
		
		let localVal = projectValues[legacyKey];
		// if user resolved
		if (resolutions && resolutions[canonicalKey] !== undefined) {
			localVal = resolutions[canonicalKey];
			if (localVal !== undefined && localVal !== null) {
				setPath(patch, canonicalKey, transform(localVal));
				trackedFields.add(canonicalKey);
			}
			return;
		}
		
		if (localVal !== undefined) {
			setPath(patch, canonicalKey, transform(localVal));
			trackedFields.add(canonicalKey);
		}
	};


	handleLocal("jira.project", "jira.project");
	handleLocal("jira.board", "jira.board");
	handleLocal("jira.default_issue_type", "jira.default_issue_type");
	handleLocal("changelog.path", "changelog.path");
	const canonSkipTypes = getPath(currentCanonical, "changelog.skip_types");
	if (canonSkipTypes === undefined) {
		if (resolutions && resolutions["changelog.skip_types"] !== undefined) {
			setPath(patch, "changelog.skip_types", resolutions["changelog.skip_types"]);
			trackedFields.add("changelog.skip_types");
		} else {
			const projSkip = projectValues["changelog.skip_types"];
			const docsSkip = docsValues["docs.changelog.skip_types"];
			
			if (projSkip !== undefined && docsSkip !== undefined && JSON.stringify(projSkip) !== JSON.stringify(docsSkip)) {
				conflicts.push({
					field: "changelog.skip_types",
					values: [
						{ source: ".claude/ws-project.yaml", value: projSkip },
						{ source: ".claude/docs-config.yaml", value: docsSkip }
					]
				});
			} else if (projSkip !== undefined) {
				setPath(patch, "changelog.skip_types", projSkip);
				trackedFields.add("changelog.skip_types");
			} else if (docsSkip !== undefined) {
				setPath(patch, "changelog.skip_types", docsSkip);
				trackedFields.add("changelog.skip_types");
			}
		}
	}

	// UI Dashboard
	const canonUi = getPath(currentCanonical, "ui.session_start_dashboard");
	if (canonUi === undefined) {
		const localHook = projectValues["hooks.session_start_dashboard"];
		if (localHook !== undefined) {
			setPath(patch, "ui.session_start_dashboard", localHook ? "jira_assignments" : "disabled");
			trackedFields.add("ui.session_start_dashboard");
		}
	}

	// Changelog Mode
	const canonUpdate = getPath(currentCanonical, "changelog.update_mode");
	if (canonUpdate === undefined) {
		if (resolutions && resolutions["changelog.update_mode"] !== undefined) {
			setPath(patch, "changelog.update_mode", resolutions["changelog.update_mode"]);
			trackedFields.add("changelog.update_mode");
		} else {
			const prUpdate = projectValues["changelog.auto_update"];
			const commitUpdate = docsValues["auto.changelog_per_commit"];
			
			if (prUpdate === true && commitUpdate === true) {
				conflicts.push({
					field: "changelog.update_mode",
					values: [
						{ source: ".claude/ws-project.yaml (changelog.auto_update)", value: prUpdate },
						{ source: ".claude/docs-config.yaml (auto.changelog_per_commit)", value: commitUpdate }
					]
				});
			} else if (prUpdate === true) {
				setPath(patch, "changelog.update_mode", "pull_request");
				trackedFields.add("changelog.update_mode");
			} else if (commitUpdate === true) {
				setPath(patch, "changelog.update_mode", "commit");
				trackedFields.add("changelog.update_mode");
			} else if (prUpdate === false && commitUpdate === false) {
				setPath(patch, "changelog.update_mode", "disabled");
				trackedFields.add("changelog.update_mode");
			} else if (prUpdate === false && commitUpdate === undefined) {
				setPath(patch, "changelog.update_mode", "disabled");
				trackedFields.add("changelog.update_mode");
			} else if ((prUpdate === undefined && commitUpdate === false) || (prUpdate === undefined && commitUpdate === undefined)) {
				// absent + false -> ask (insufficient evidence)
				// absent + absent -> ask (insufficient evidence)
				if (projectValues["changelog.path"] !== undefined || docsValues["docs.changelog.skip_types"] !== undefined) {
					conflicts.push({
						field: "changelog.update_mode",
						values: [{ source: "inference", value: "ambiguous/insufficient evidence" }]
					});
				}
			}
		}
	}


	// Suggestions from Global
	let globalJiraActions = globalValues["defaults.jira_actions"];
	if (globalJiraActions === "never") globalJiraActions = "disabled";
	
	if (globalJiraActions !== undefined && getPath(currentCanonical, "commit.jira.actions") === undefined) {
		suggestions.push({
			field: "commit.jira.actions",
			value: globalJiraActions,
			source: "~/.claude/ws/config.yaml"
		});
	}

	const globalUi = globalValues["ui.session_start_dashboard"];
	if (globalUi !== undefined && getPath(currentCanonical, "ui.session_start_dashboard") === undefined && patch.ui?.session_start_dashboard === undefined) {
		suggestions.push({
			field: "ui.session_start_dashboard",
			value: globalUi ? "jira_assignments" : "disabled",
			source: "~/.claude/ws/config.yaml"
		});
	}
	
	// Categorized effects
	for (const field of trackedFields) {
		effects.push({
			classification: "UPDATE",
			target: ".wsagency/config.yaml",
			fields: [field]
		});
	}
	for (const conflict of conflicts) {
		effects.push({
			classification: "BLOCKING_CONFLICT",
			target: ".wsagency/config.yaml",
			fields: [conflict.field],
			reason: "Unresolved legacy conflict"
		});
		blockers.push(`Unresolved conflict for ${conflict.field}`);
	}
	
	return { patch, conflicts, suggestions, effects, blockers };
}

export function checkJiraCleanupEligibility(plan, canonicalValidation, adaptersReady) {
	if (!canonicalValidation || !canonicalValidation.isValid) return { eligible: false, blockers: ["Canonical configuration is missing or invalid"] };
	
	if (plan.patch.jira && plan.patch.jira.project) {
		if (!adaptersReady || !adaptersReady.isJiraReady) {
			return { eligible: false, blockers: ["Jira adapter is not ready or verified"] };
		}
	}
	
	if (plan.conflicts && plan.conflicts.length > 0) {
		return { eligible: false, blockers: ["Unresolved legacy configuration conflicts"] };
	}
	
	return { eligible: true, blockers: [] };
}
