import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
	serializeCanonicalConfig,
	type CanonicalProjectConfig,
} from "../../../plugins/ws/skills/ws-project-bootstrap/config.mjs";
import {
	deriveNativeRuntimeBehavior,
	loadRepositoryPolicyFromRoot,
	repositoryPolicyProblem,
	type NativeRuntimeCapabilities,
} from "../src/lib/project-policy";

const READY: NativeRuntimeCapabilities = {
	sessionDiscipline: true,
	dangerousGitGuard: true,
	jira: true,
};

const LEGACY_POLICY_SOURCES = [
	".claude/ws-project.yaml",
	".claude/docs-config.yaml",
	"dev-docs/agents/issue-tracker.md",
	"dev-docs/agents/triage-labels.md",
	"dev-docs/agents/domain.md",
	".scratch",
] as const;

function canonicalPolicy(overrides: Partial<CanonicalProjectConfig> = {}): CanonicalProjectConfig {
	return {
		schema_version: 1,
		tracker: { primary: "local", pull_requests: "ignore" },
		triage: {
			labels: {
				needs_triage: "needs-triage",
				needs_info: "needs-info",
				ready_for_agent: "ready-for-agent",
				ready_for_human: "ready-for-human",
				wontfix: "wontfix",
			},
		},
		domain: { layout: "single_context" },
		commit: {
			jira: {
				actions: "disabled",
				smart_commit_trailer: false,
				post_commit_comment: false,
				pr_transition: null,
			},
		},
		changelog: {
			update_mode: "pull_request",
			path: "CHANGELOG.md",
			skip_types: ["docs", "chore", "test", "style", "build", "ci"],
		},
		ui: { session_start_dashboard: "disabled" },
		runtime: { session_discipline: "required", dangerous_git_guard: "enabled" },
		...overrides,
	};
}

let root: string;

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-policy-"));
});

afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

async function writePolicy(config: CanonicalProjectConfig): Promise<void> {
	await fs.mkdir(path.join(root, ".wsagency"), { recursive: true });
	await fs.writeFile(path.join(root, ".wsagency", "config.yaml"), serializeCanonicalConfig(config));
}

async function writeLegacySources(unreadable = false): Promise<void> {
	for (const relativePath of [...LEGACY_POLICY_SOURCES].reverse()) {
		const target = path.join(root, relativePath);
		if (relativePath === ".scratch") {
			await fs.mkdir(target);
			continue;
		}
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, "deliberately invalid legacy values that must not be parsed\n");
		if (unreadable) await fs.chmod(target, 0);
	}
}

describe("canonical native runtime policy", () => {
	test("enables dashboard, guard, changelog, and Local compaction from canonical policy", async () => {
		await writePolicy(canonicalPolicy({
			changelog: { update_mode: "commit", path: "HISTORY.md", skip_types: ["docs"] },
			ui: { session_start_dashboard: "jira_assignments" },
			jira: { project: "WCM", default_issue_type: "Task", sync: "all_local_tickets" },
		}));

		const state = await loadRepositoryPolicyFromRoot(root);
		const behavior = deriveNativeRuntimeBehavior(state, READY);

		expect(state.status).toBe("valid");
		expect(behavior).toEqual({
			runtimeReady: true,
			sessionDiscipline: true,
			dangerousGitGuard: true,
			dashboard: true,
			localTicketCompaction: true,
			changelog: { updateMode: "commit", path: "HISTORY.md", skipTypes: ["docs"] },
		});
	});

	test("honors canonical disablement without inventing defaults", async () => {
		await writePolicy(canonicalPolicy({
			changelog: { update_mode: "disabled", path: "HISTORY.md", skip_types: [] },
			runtime: { session_discipline: "required", dangerous_git_guard: "disabled" },
		}));

		const behavior = deriveNativeRuntimeBehavior(await loadRepositoryPolicyFromRoot(root), READY);
		expect(behavior.runtimeReady).toBe(true);
		expect(behavior.sessionDiscipline).toBe(true);
		expect(behavior.dangerousGitGuard).toBe(false);
		expect(behavior.dashboard).toBe(false);
		expect(behavior.changelog?.updateMode).toBe("disabled");
		const strengthened = deriveNativeRuntimeBehavior(
			await loadRepositoryPolicyFromRoot(root),
			READY,
			true,
		);
		expect(strengthened.dangerousGitGuard).toBe(true);
	});

	test("reports missing machine capabilities without disabling unrelated policy", async () => {
		await writePolicy(canonicalPolicy({
			ui: { session_start_dashboard: "jira_assignments" },
			jira: { project: "WCM", default_issue_type: "Task", sync: "all_local_tickets" },
		}));


		const state = await loadRepositoryPolicyFromRoot(root);
		const outage = deriveNativeRuntimeBehavior(state, {
			sessionDiscipline: true,
			dangerousGitGuard: true,
			jira: false,
		});
		expect(outage.dashboard).toBe(false);
		expect(outage.runtimeReady).toBe(true);
		expect(outage.dangerousGitGuard).toBe(true);
		expect(outage.localTicketCompaction).toBe(true);
		expect(outage.changelog?.path).toBe("CHANGELOG.md");

		const missingRuntime = deriveNativeRuntimeBehavior(state, {
			sessionDiscipline: false,
			dangerousGitGuard: false,
			jira: true,
		});
		expect(missingRuntime.runtimeReady).toBe(false);
		expect(missingRuntime.sessionDiscipline).toBe(false);
		expect(missingRuntime.dangerousGitGuard).toBe(false);
	});

	test("detects every canonical repository legacy source in source order without reading values", async () => {
		await writeLegacySources(true);

		const state = await loadRepositoryPolicyFromRoot(root);
		expect(state.status).toBe("missing");
		expect(state.legacySources).toEqual([...LEGACY_POLICY_SOURCES]);
		for (const helper of ["ws-guard", "ws-dashboard", "ws-compaction"]) {
			expect(repositoryPolicyProblem(state, helper)).toBe(
				`${helper}: legacy repository policy detected in ${LEGACY_POLICY_SOURCES.join(", ")}; run /ws-setup to migrate to .wsagency/config.yaml.`,
			);
		}
	});

	test("gives a strict-valid canonical policy precedence over adjacent legacy sources", async () => {
		await writeLegacySources(true);
		await writePolicy(canonicalPolicy());

		const state = await loadRepositoryPolicyFromRoot(root);
		expect(state.status).toBe("valid");
		expect(state.legacySources).toEqual([]);
		expect(repositoryPolicyProblem(state, "ws-guard")).toBeUndefined();
	});

	test("keeps a clean repository without canonical policy unconfigured and non-blocking", async () => {
		const state = await loadRepositoryPolicyFromRoot(root);
		expect(state.status).toBe("missing");
		expect(state.legacySources).toEqual([]);
		expect(repositoryPolicyProblem(state, "ws-compaction")).toBeUndefined();
	});

	test("reports invalid canonical policy without consulting legacy values", async () => {
		await fs.mkdir(path.join(root, ".wsagency"), { recursive: true });
		await fs.mkdir(path.join(root, ".claude"), { recursive: true });
		await fs.writeFile(path.join(root, ".wsagency", "config.yaml"), "schema_version: 1\nruntime:\n  dangerous_git_guard: enabled\n");
		await fs.writeFile(path.join(root, ".claude", "ws-project.yaml"), "hooks:\n  session_start_dashboard: true\n");

		const state = await loadRepositoryPolicyFromRoot(root);
		expect(state.status).toBe("invalid");
		expect(state.legacySources).toEqual([]);
		expect(repositoryPolicyProblem(state, "ws-guard")).toContain(".wsagency/config.yaml is invalid");
		expect(repositoryPolicyProblem(state, "ws-guard")).toContain("/ws-setup");
	});

	test("never treats plugin override files as repository policy", async () => {
		await fs.mkdir(path.join(root, ".omp"), { recursive: true });
		await fs.writeFile(
			path.join(root, ".omp", "plugin-overrides.json"),
			JSON.stringify({ settings: { "@wsagency/omp-ws": { removedPolicy: "ignored" } } }),
		);
		const missing = await loadRepositoryPolicyFromRoot(root);
		expect(missing.legacySources).toEqual([]);
		expect(repositoryPolicyProblem(missing, "ws-dashboard")).toBeUndefined();

		await writePolicy(canonicalPolicy({
			changelog: { update_mode: "disabled", path: "HISTORY.md", skip_types: [] },
			runtime: { session_discipline: "required", dangerous_git_guard: "disabled" },
		}));
		const canonical = deriveNativeRuntimeBehavior(await loadRepositoryPolicyFromRoot(root), READY);
		expect(canonical.dashboard).toBe(false);
		expect(canonical.dangerousGitGuard).toBe(false);
		expect(canonical.changelog?.updateMode).toBe("disabled");
	});

	test("keeps canonical behavior aligned across isolated omp profiles", async () => {
		await writePolicy(canonicalPolicy({
			ui: { session_start_dashboard: "jira_assignments" },
			jira: { project: "WCM", default_issue_type: "Task", sync: "all_local_tickets" },
		}));
		const state = await loadRepositoryPolicyFromRoot(root);
		const previousProfile = process.env.OMP_PROFILE;
		try {
			process.env.OMP_PROFILE = "alpha";
			const alpha = deriveNativeRuntimeBehavior(state, READY);
			process.env.OMP_PROFILE = "beta";
			const beta = deriveNativeRuntimeBehavior(state, READY);
			expect(beta).toEqual(alpha);
		} finally {
			if (previousProfile === undefined) delete process.env.OMP_PROFILE;
			else process.env.OMP_PROFILE = previousProfile;
		}
	});
});
