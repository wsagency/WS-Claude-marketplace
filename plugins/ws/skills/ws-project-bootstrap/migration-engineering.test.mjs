import { expect, test } from "bun:test";
import { discoverEngineeringState, planEngineeringMigration, checkEngineeringCleanupEligibility } from "./migration-engineering.mjs";

test("discoverEngineeringState extracts tracker, triage, domain from legacy adapters", () => {
	const snapshots = {
		"dev-docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n\nPRs as a request surface: yes",
		"dev-docs/agents/triage-labels.md": "The triage labels are mapped to these strings:\n- needs-triage: `bug:triage`\n- needs-info: `needs-info`",
		"dev-docs/agents/domain.md": "We use single-context layout."
	};
	
	const discovery = discoverEngineeringState(snapshots);
	expect(discovery.derived.tracker).toBe("github");
	expect(discovery.derived.pull_requests).toBe("triage");
	expect(discovery.derived.triageLabels).toEqual({
		needs_triage: "bug:triage",
		needs_info: "needs-info"
	});
	expect(discovery.derived.domainLayout).toBe("single_context");
});

test("planEngineeringMigration replaces exact adapters and managed blocks", () => {
	const discovery = {
		hasEngineeringState: true,
		trackerContent: "Issue tracker: Local Markdown",
		agentsMd: "## Agent skills\nSome content",
		derived: {
			tracker: "local",
			sync: "all_local_tickets",
			pull_requests: "ignore"
		}
	};
	const { patch, effects, blockers } = planEngineeringMigration(discovery, {});
	expect(patch.tracker.primary).toBe("local");
	expect(patch.tracker.pull_requests).toBe("ignore");
	expect(patch.jira.sync).toBe("all_local_tickets");
	expect(blockers).toHaveLength(0);
	
	const trackerEffect = effects.find(e => e.target === "dev-docs/agents/issue-tracker.md");
	expect(trackerEffect.classification).toBe("UPDATE");
	
	const agentsEffect = effects.find(e => e.target === "AGENTS.md");
	expect(agentsEffect.classification).toBe("UPDATE");
});

test("planEngineeringMigration blocks on customized adapters", () => {
	const discovery = {
		hasEngineeringState: true,
		trackerContent: "This is a completely custom tracker adapter that doesn't match our heuristic at all, let's make it very long or just without keywords. ".repeat(100),
		derived: {}
	};
	
	const { effects, blockers } = planEngineeringMigration(discovery, {});
	const trackerEffect = effects.find(e => e.target === "dev-docs/agents/issue-tracker.md");
	expect(trackerEffect.classification).toBe("BLOCKING_CONFLICT");
	expect(blockers).toContain("Customized tracker adapter requires reviewed merge");
});

test("planEngineeringMigration blocks on conflicting context blocks", () => {
	const discovery = {
		hasEngineeringState: true,
		agentsMd: "## Agent skills\nAGENTS",
		claudeMd: "## Agent skills\nCLAUDE",
		derived: {}
	};
	
	const { effects, blockers } = planEngineeringMigration(discovery, {});
	expect(effects.find(e => e.target === "AGENTS.md").classification).toBe("BLOCKING_CONFLICT");
	expect(effects.find(e => e.target === "CLAUDE.md").classification).toBe("BLOCKING_CONFLICT");
	expect(blockers).toContain("Conflicting authored context blocks in both AGENTS.md and CLAUDE.md pending explicit merge choice");
});

test("checkEngineeringCleanupEligibility", () => {
	expect(checkEngineeringCleanupEligibility({}, { isValid: true }, { engineeringReady: true })).toEqual({ eligible: true, blockers: [] });
	expect(checkEngineeringCleanupEligibility({}, { isValid: false }, { engineeringReady: true })).toEqual({ eligible: false, blockers: ["Canonical configuration is invalid"] });
	expect(checkEngineeringCleanupEligibility({}, { isValid: true }, { engineeringReady: false })).toEqual({ eligible: false, blockers: ["Engineering adapters are not ready"] });
});
