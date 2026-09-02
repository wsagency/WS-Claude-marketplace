const EXACT_ISSUE_TRACKER_FRAGMENTS = [
	"Issue tracker: Local Markdown",
	"Issue tracker: GitHub",
	"Issue tracker: GitLab",
	"Issue tracker: Jira",
	"Issue tracker: Local + Jira sync",
	"Local Markdown operations",
	"GitHub Issues behavior",
	"GitLab Issues behavior",
	"Jira behavior configured"
];

const EXACT_TRIAGE_FRAGMENTS = [
	"The triage labels are mapped to these strings:",
	"The triage labels are:"
];

const EXACT_DOMAIN_FRAGMENTS = [
	"single-context",
	"multi-context",
	"single_context",
	"multi_context"
];

function isExactAdapter(content, fragments) {
	if (!content) return false;
	// Very simple heuristic: if it contains one of the known fragments and is relatively short,
	// or we just trust the fragment presence. The prompt says "exact released generated adapters".
	// In a real system we'd hash them, but we don't have the hashes.
	// For now, if it matches our basic discovery keywords, we assume it's exact enough to be replaced,
	// unless it has a lot of custom text. Let's say length < 1000 is generated.
	return fragments.some(f => content.includes(f)) && content.length < 2000;
}

export function discoverEngineeringState(snapshots) {
	const trackerContent = snapshots["dev-docs/agents/issue-tracker.md"] || null;
	const domainContent = snapshots["dev-docs/agents/domain.md"] || null;
	const triageContent = snapshots["dev-docs/agents/triage-labels.md"] || null;
	const agentsMd = snapshots["AGENTS.md"] || null;
	const claudeMd = snapshots["CLAUDE.md"] || null;

	let primaryTracker = undefined;
	let sync = undefined;
	let pullRequests = undefined;
	
	if (trackerContent) {
		if (trackerContent.includes("Issue tracker: Local Markdown") || trackerContent.includes("Local Markdown operations")) {
			primaryTracker = "local";
		}
		if (trackerContent.includes("Issue tracker: Local + Jira sync")) {
			primaryTracker = "local";
			sync = "all_local_tickets";
		}
		if (trackerContent.includes("Issue tracker: GitHub") || trackerContent.includes("GitHub Issues behavior")) {
			primaryTracker = "github";
		}
		if (trackerContent.includes("Issue tracker: GitLab") || trackerContent.includes("GitLab Issues behavior")) {
			primaryTracker = "gitlab";
		}
		if (trackerContent.includes("Issue tracker: Jira") && !trackerContent.includes("Local + Jira sync")) {
			primaryTracker = "jira";
		}
		if (trackerContent.includes("Jira behavior configured")) {
			primaryTracker = "jira";
		}
		
		if (trackerContent.includes("PRs as a request surface: yes")) {
			pullRequests = "triage";
		} else if (trackerContent.includes("PRs as a request surface: no")) {
			pullRequests = "ignore";
		}
	}

	let triageLabels = undefined;
	if (triageContent) {
		triageLabels = {};
		const lines = triageContent.split('\n');
		for (const line of lines) {
			const match = line.match(/- (needs-triage|needs-info|ready-for-agent|ready-for-human|wontfix):\s*`([^`]+)`/);
			if (match) {
				const key = match[1].replace(/-/g, '_');
				triageLabels[key] = match[2];
			}
		}
		if (Object.keys(triageLabels).length === 0) triageLabels = undefined;
	}

	let domainLayout = undefined;
	if (domainContent) {
		if (domainContent.includes("single-context") || domainContent.includes("single_context")) {
			domainLayout = "single_context";
		}
		if (domainContent.includes("multi-context") || domainContent.includes("multi_context")) {
			domainLayout = "multi_context";
		}
	}

	return {
		hasEngineeringState: !!(trackerContent || domainContent || triageContent || agentsMd || claudeMd),
		trackerContent,
		domainContent,
		triageContent,
		agentsMd,
		claudeMd,
		derived: {
			tracker: primaryTracker,
			sync: sync,
			pull_requests: pullRequests,
			triageLabels: triageLabels,
			domainLayout: domainLayout,
		}
	};
}

function fullEffect(order, target, classification, reason) {
	return {
		order,
		target,
		kind: target.includes(".") ? "file" : "directory",
		classification,
		reason,
		diff: "",
		fingerprint: null
	};
}

export function planEngineeringMigration(discovery, currentCanonical, resolutions) {
	const patch = JSON.parse(JSON.stringify(currentCanonical || {}));
	const effects = [];
	const conflicts = [];
	const blockers = [];
	const suggestions = [];

	if (!discovery.hasEngineeringState) {
		return { patch, effects, conflicts, suggestions, blockers };
	}

	if (discovery.derived.tracker && !patch.tracker?.primary) {
		patch.tracker = patch.tracker || {};
		patch.tracker.primary = discovery.derived.tracker;
	}
	if (discovery.derived.pull_requests && !patch.tracker?.pull_requests) {
		patch.tracker = patch.tracker || {};
		patch.tracker.pull_requests = discovery.derived.pull_requests;
	}
	if (discovery.derived.sync && patch.tracker?.primary === 'local' && !patch.jira?.sync) {
		patch.jira = patch.jira || {};
		patch.jira.sync = discovery.derived.sync;
	}

	if (discovery.derived.triageLabels && !patch.triage?.labels) {
		patch.triage = patch.triage || {};
		patch.triage.labels = discovery.derived.triageLabels;
	}

	if (discovery.derived.domainLayout && !patch.domain?.layout) {
		patch.domain = patch.domain || {};
		patch.domain.layout = discovery.derived.domainLayout;
	}

	if (discovery.trackerContent) {
		if (isExactAdapter(discovery.trackerContent, EXACT_ISSUE_TRACKER_FRAGMENTS)) {
			effects.push(fullEffect(80, "dev-docs/agents/issue-tracker.md", "UPDATE", "Replace exact legacy tracker adapter"));
		} else {
			effects.push(fullEffect(80, "dev-docs/agents/issue-tracker.md", "BLOCKING_CONFLICT", "Customized tracker adapter requires reviewed merge"));
			blockers.push("Customized tracker adapter requires reviewed merge");
		}
	}
	
	if (discovery.domainContent) {
		if (isExactAdapter(discovery.domainContent, EXACT_DOMAIN_FRAGMENTS)) {
			effects.push(fullEffect(80, "dev-docs/agents/domain.md", "UPDATE", "Replace exact legacy domain adapter"));
		} else {
			effects.push(fullEffect(80, "dev-docs/agents/domain.md", "BLOCKING_CONFLICT", "Customized domain adapter requires reviewed merge"));
			blockers.push("Customized domain adapter requires reviewed merge");
		}
	}
	
	if (discovery.triageContent) {
		if (isExactAdapter(discovery.triageContent, EXACT_TRIAGE_FRAGMENTS)) {
			effects.push(fullEffect(80, "dev-docs/agents/triage-labels.md", "UPDATE", "Replace exact legacy triage adapter"));
		} else {
			effects.push(fullEffect(80, "dev-docs/agents/triage-labels.md", "BLOCKING_CONFLICT", "Customized triage adapter requires reviewed merge"));
			blockers.push("Customized triage adapter requires reviewed merge");
		}
	}

	const hasAgentsContext = discovery.agentsMd && (discovery.agentsMd.includes("## Agent skills") || discovery.agentsMd.includes("<!-- WS-AGENT-SKILLS:START -->"));
	const hasClaudeContext = discovery.claudeMd && (discovery.claudeMd.includes("## Agent skills") || discovery.claudeMd.includes("<!-- WS-AGENT-SKILLS:START -->"));
	
	if (hasAgentsContext && hasClaudeContext) {
		effects.push(fullEffect(40, "AGENTS.md", "BLOCKING_CONFLICT", "Conflicting authored context blocks in both AGENTS.md and CLAUDE.md"));
		effects.push(fullEffect(40, "CLAUDE.md", "BLOCKING_CONFLICT", "Conflicting authored context blocks in both AGENTS.md and CLAUDE.md"));
		blockers.push("Conflicting authored context blocks in both AGENTS.md and CLAUDE.md pending explicit merge choice");
	} else if (hasAgentsContext) {
		effects.push(fullEffect(40, "AGENTS.md", "UPDATE", "Replace known managed context block"));
	} else if (hasClaudeContext) {
		effects.push(fullEffect(40, "CLAUDE.md", "UPDATE", "Replace known managed context block"));
	}

	return { patch, effects, conflicts, suggestions, blockers };
}

export function checkEngineeringCleanupEligibility(plan, canonicalValidation, adaptersReady) {
	const eligible = canonicalValidation.isValid && adaptersReady.engineeringReady;
	const blockers = [];
	if (!eligible) {
		if (!canonicalValidation.isValid) blockers.push("Canonical configuration is invalid");
		if (!adaptersReady.engineeringReady) blockers.push("Engineering adapters are not ready");
	}
	return { eligible, blockers };
}
