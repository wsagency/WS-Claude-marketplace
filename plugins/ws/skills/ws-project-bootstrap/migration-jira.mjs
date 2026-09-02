export function discoverJiraState(snapshots) {
	const globalValues = snapshots["~/.claude/ws/config.yaml"] || {};
	const projectValues = snapshots[".claude/ws-project.yaml"] || {};
	const docsValues = snapshots[".claude/docs-config.yaml"] || {};
	
	const unrecognized = [];
	const knownGlobalKeys = ["jira.site", "atlassian.cloud_id", "atlassian.account_id", "defaults.jira_actions", "defaults.pr_transition", "defaults.smart_commit_trailer", "defaults.commit_comment", "ui.session_start_dashboard"];
	const knownProjectKeys = ["jira.project", "jira.board", "jira.default_issue_type", "changelog.path", "changelog.skip_types", "changelog.auto_update", "hooks.session_start_dashboard"];
	const knownDocsKeys = ["auto.changelog_per_commit", "auto.adr_for_arch_changes", "docs.changelog.skip_types", "docs.user_track", "docs.dev_track", "docs.default_audience", "docs.default_scope"];
	
	const flattenKeys = (obj, prefix = '') => {
		return Object.keys(obj).reduce((acc, k) => {
			const pre = prefix.length ? prefix + '.' : '';
			if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
				Object.assign(acc, flattenKeys(obj[k], pre + k));
			} else {
				acc[pre + k] = obj[k];
			}
			return acc;
		}, {});
	};

	const flatGlobal = flattenKeys(globalValues);
	const flatProject = flattenKeys(projectValues);
	const flatDocs = flattenKeys(docsValues);
	
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
	
	const setPatch = (path, value) => {
		const parts = path.split('.');
		let current = patch;
		for (let i = 0; i < parts.length - 1; i++) {
			if (!current[parts[i]]) current[parts[i]] = {};
			current = current[parts[i]];
		}
		current[parts[parts.length - 1]] = value;
	};

	const getCanonical = (path) => {
		const parts = path.split('.');
		let current = currentCanonical;
		for (const part of parts) {
			if (!current) return undefined;
			current = current[part];
		}
		return current;
	};

	// Local mappings
	const { projectValues = {}, docsValues = {}, globalValues = {} } = discovery;
	const trackedFields = new Set();
	
	// Helper for local values
	const handleLocal = (legacyKey, canonicalKey, transform = v => v) => {
		const canonVal = getCanonical(canonicalKey);
		if (canonVal !== undefined) return;
		
		let localVal = projectValues[legacyKey];
		// if user resolved
		if (resolutions && resolutions[canonicalKey] !== undefined) {
			localVal = resolutions[canonicalKey];
			if (localVal !== undefined && localVal !== null) {
				setPatch(canonicalKey, transform(localVal));
				trackedFields.add(canonicalKey);
			}
			return;
		}
		
		if (localVal !== undefined) {
			setPatch(canonicalKey, transform(localVal));
			trackedFields.add(canonicalKey);
		}
	};


	handleLocal("jira.project", "jira.project");
	handleLocal("jira.board", "jira.board");
	handleLocal("jira.default_issue_type", "jira.default_issue_type");
	handleLocal("changelog.path", "changelog.path");
	const canonSkipTypes = getCanonical("changelog.skip_types");
	if (canonSkipTypes === undefined) {
		if (resolutions && resolutions["changelog.skip_types"] !== undefined) {
			setPatch("changelog.skip_types", resolutions["changelog.skip_types"]);
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
				setPatch("changelog.skip_types", projSkip);
				trackedFields.add("changelog.skip_types");
			} else if (docsSkip !== undefined) {
				setPatch("changelog.skip_types", docsSkip);
				trackedFields.add("changelog.skip_types");
			}
		}
	}

	// UI Dashboard
	const canonUi = getCanonical("ui.session_start_dashboard");
	if (canonUi === undefined) {
		const localHook = projectValues["hooks.session_start_dashboard"];
		if (localHook !== undefined) {
			setPatch("ui.session_start_dashboard", localHook ? "jira_assignments" : "disabled");
			trackedFields.add("ui.session_start_dashboard");
		}
	}

	// Changelog Mode
	const canonUpdate = getCanonical("changelog.update_mode");
	if (canonUpdate === undefined) {
		if (resolutions && resolutions["changelog.update_mode"] !== undefined) {
			setPatch("changelog.update_mode", resolutions["changelog.update_mode"]);
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
				setPatch("changelog.update_mode", "pull_request");
				trackedFields.add("changelog.update_mode");
			} else if (commitUpdate === true) {
				setPatch("changelog.update_mode", "commit");
				trackedFields.add("changelog.update_mode");
			} else if (prUpdate === false && commitUpdate === false) {
				setPatch("changelog.update_mode", "disabled");
				trackedFields.add("changelog.update_mode");
			} else if (prUpdate === false && commitUpdate === undefined) {
				setPatch("changelog.update_mode", "disabled");
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
	
	if (globalJiraActions !== undefined && getCanonical("commit.jira.actions") === undefined) {
		suggestions.push({
			field: "commit.jira.actions",
			value: globalJiraActions,
			source: "~/.claude/ws/config.yaml"
		});
	}

	const globalUi = globalValues["ui.session_start_dashboard"];
	if (globalUi !== undefined && getCanonical("ui.session_start_dashboard") === undefined && patch.ui?.session_start_dashboard === undefined) {
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
