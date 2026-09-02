import { expect, test } from "bun:test";
import {
	FakeJiraAdapter,
	checkTrackerReadiness,
	discoverProviders,
	parseOriginIdentity,
	planTrackerEffects,
	validateJiraCapability,
} from "../../../plugins/ws/skills/ws-project-bootstrap/trackers.mjs";

const missingAdapter = {
	entries: {
		"dev-docs/agents/issue-tracker.md": { kind: "missing", fingerprint: null },
	},
};

test("validated GitHub and GitLab origins expose only their matching primary tracker", () => {
	expect(parseOriginIdentity("git@github.com:wsagency/example.git")).toEqual({
		provider: "github",
		host: "github.com",
		owner: "wsagency",
		repo: "example",
	});
	expect(discoverProviders("https://gitlab.com/wsagency/group/example.git")).toEqual(["local", "gitlab"]);
	expect(discoverProviders("https://example.com/wsagency/example.git")).toEqual(["local"]);
});

test("tracker plan effects conform to the shared manifest contract even when blocked", () => {
	const effects = planTrackerEffects(
		{ tracker: { primary: "github", pull_requests: "triage" } },
		{ ...missingAdapter, git: { origin: "https://gitlab.com/wsagency/example.git" } },
		null,
		{ ghCli: true },
	);

	expect(effects).toHaveLength(1);
	expect(effects[0]).toMatchObject({
		order: expect.any(Number),
		target: "integration:github",
		kind: "state",
		classification: "BLOCKING_CONFLICT",
		diff: "",
		fingerprint: null,
	});
});

test("Jira primary requires read-only capability and produces a secret-free adapter", async () => {
	const jira = new FakeJiraAdapter();
	const validation = await validateJiraCapability(jira, "WCM");
	const config = {
		tracker: { primary: "jira", pull_requests: "ignore" },
		jira: { project: "WCM", default_issue_type: "Task", sync: "disabled" },
	};
	const effects = planTrackerEffects(config, missingAdapter, validation, {});
	const readiness = checkTrackerReadiness(config, missingAdapter, validation, {});

	expect(validation).toEqual({ ready: true });
	expect(readiness).toEqual({ trackerReady: true, blockers: [] });
	expect(effects[0]).toMatchObject({
		target: "dev-docs/agents/issue-tracker.md",
		classification: "CREATE",
	});
	expect(effects[0]?.after).toContain("project defined in `.wsagency/config.yaml`");
	expect(effects[0]?.after).not.toMatch(/^\s*(token|password|credential|site):/im);
});

test("Jira capability failures block only tracker readiness without adapter writes", async () => {
	const validation = await validateJiraCapability(new FakeJiraAdapter({ authFailed: true }), "WCM");
	const config = {
		tracker: { primary: "jira", pull_requests: "ignore" },
		jira: { project: "WCM", default_issue_type: "Task", sync: "disabled" },
	};
	const effects = planTrackerEffects(config, missingAdapter, validation, {});
	const readiness = checkTrackerReadiness(config, missingAdapter, validation, {});

	expect(validation).toEqual({ ready: false, reason: "jira-cli authentication failed" });
	expect(effects.every(effect => effect.classification === "BLOCKING_CONFLICT")).toBe(true);
	expect(readiness.trackerReady).toBe(false);
});
