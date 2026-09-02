export function parseYamlLike(content) {
	if (!content) return {};
	const result = {};
	let currentContext = [];
	let currentIndent = 0;
	
	const lines = content.split('\n');
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		
		const indentMatch = line.match(/^(\s*)/);
		const indent = indentMatch ? indentMatch[1].length : 0;
		
		while (currentContext.length > 0 && indent <= currentContext[currentContext.length - 1].indent) {
			currentContext.pop();
		}
		
		const colonIdx = trimmed.indexOf(':');
		if (colonIdx === -1) continue;
		
		const key = trimmed.slice(0, colonIdx).trim();
		let valueStr = trimmed.slice(colonIdx + 1).trim();
		
		// Remove inline comments
		const commentIdx = valueStr.indexOf('#');
		if (commentIdx !== -1) {
			valueStr = valueStr.slice(0, commentIdx).trim();
		}
		
		if (!valueStr) {
			currentContext.push({ key, indent });
			continue;
		}
		
		let value = valueStr;
		if (value === 'true') value = true;
		else if (value === 'false') value = false;
		else if (!isNaN(Number(value)) && value !== '') value = Number(value);
		else if (value.startsWith('[') && value.endsWith(']')) {
			value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
		} else if (value.startsWith('"') && value.endsWith('"')) {
			value = value.slice(1, -1);
		} else if (value.startsWith("'") && value.endsWith("'")) {
			value = value.slice(1, -1);
		}
		
		const path = currentContext.map(c => c.key).concat(key).join('.');
		result[path] = value;
	}
	
	return result;
}

export function discoverJiraState(snapshots) {
	const globalContent = snapshots["~/.claude/ws/config.yaml"];
	const projectContent = snapshots[".claude/ws-project.yaml"];
	const docsContent = snapshots[".claude/docs-config.yaml"];
	
	const globalValues = parseYamlLike(globalContent);
	const projectValues = parseYamlLike(projectContent);
	const docsValues = parseYamlLike(docsContent);
	
	return {
		hasGlobalConfig: !!globalContent,
		hasProjectConfig: !!projectContent,
		hasDocsConfig: !!docsContent,
		globalValues,
		projectValues,
		docsValues,
		unrecognized: []
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
			}
			return;
		}
		
		if (localVal !== undefined) {
			setPatch(canonicalKey, transform(localVal));
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
			} else if (docsSkip !== undefined) {
				setPatch("changelog.skip_types", docsSkip);
			}
		}
	}

	// UI Dashboard
	const canonUi = getCanonical("ui.session_start_dashboard");
	if (canonUi === undefined) {
		const localHook = projectValues["hooks.session_start_dashboard"];
		if (localHook !== undefined) {
			setPatch("ui.session_start_dashboard", localHook ? "jira_assignments" : "disabled");
		}
	}
	// Changelog Mode
	const canonUpdate = getCanonical("changelog.update_mode");
	if (canonUpdate === undefined) {
		if (resolutions && resolutions["changelog.update_mode"] !== undefined) {
			setPatch("changelog.update_mode", resolutions["changelog.update_mode"]);
		} else {
			const prUpdate = projectValues["changelog.auto_update"];
			const commitUpdate = docsValues["auto.changelog_per_commit"];
			
			if (prUpdate !== undefined || commitUpdate !== undefined) {
				if ((prUpdate === true && commitUpdate === true) || (prUpdate === false && commitUpdate === false)) {
					conflicts.push({
						field: "changelog.update_mode",
						values: [
							{ source: ".claude/ws-project.yaml (changelog.auto_update)", value: prUpdate },
							{ source: ".claude/docs-config.yaml (auto.changelog_per_commit)", value: commitUpdate }
						]
					});
				} else if (prUpdate === true || commitUpdate === false) {
					setPatch("changelog.update_mode", "pull_request");
				} else if (prUpdate === false || commitUpdate === true) {
					setPatch("changelog.update_mode", "commit");
				}
			}
		}
	}

	// Suggestions from Global
	const globalJiraActions = globalValues["defaults.jira_actions"];
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
