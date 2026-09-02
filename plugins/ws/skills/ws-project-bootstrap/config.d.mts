export interface ConfigValidationIssue {
	code: string;
	message: string;
	path: string;
}

export interface CanonicalProjectConfig {
	schema_version: number;
	tracker?: { primary: "local" | "github" | "gitlab" | "jira"; pull_requests: "ignore" | "triage" };
	triage?: { labels: Record<"needs_triage" | "needs_info" | "ready_for_agent" | "ready_for_human" | "wontfix", string> };
	domain?: { layout: "single_context" | "multi_context" };
	commit?: {
		jira: {
			actions: "disabled" | "ask" | "always";
			smart_commit_trailer: boolean;
			post_commit_comment: boolean;
			pr_transition: string | null;
		};
	};
	changelog?: { update_mode: "pull_request" | "commit" | "disabled"; path: string; skip_types: string[] };
	ui?: { session_start_dashboard: "disabled" | "jira_assignments" };
	runtime?: { session_discipline: "required"; dangerous_git_guard: "enabled" | "disabled" };
	jira?: { project: string; board?: number; default_issue_type: string; sync: "disabled" | "all_local_tickets" };
	docs?: {
		user_track: string;
		dev_track: string;
		default_audience: "user" | "dev" | "ask";
		default_scope: "repo" | "product" | "ask";
		adr_for_arch_changes: boolean;
	};
	[key: string]: unknown;
}

export interface ValidConfigResult {
	status: "valid";
	config: CanonicalProjectConfig;
	errors: [];
}

export interface NonValidConfigResult {
	status: "invalid" | "older" | "future";
	config: CanonicalProjectConfig | null;
	errors: ConfigValidationIssue[];
}

export type ConfigValidationResult = ValidConfigResult | NonValidConfigResult;

export interface ReadinessSnapshot {
	artifacts?: Record<string, boolean>;
	integrations?: Record<string, boolean>;
	runtime?: Record<string, boolean>;
}

export interface DerivedSetupReadiness {
	configValid: boolean;
	engineeringReady: boolean;
	trackerReady: boolean;
	docsReady: boolean;
	runtimeReady: boolean;
}

export class ConfigValidationError extends Error {
	readonly code: string;
	readonly path: string;
}

export function parseCanonicalConfigYaml(source: string): CanonicalProjectConfig;
export function validateCanonicalConfig(source: string): ConfigValidationResult;
export function deriveSetupReadiness(validation: ConfigValidationResult, snapshot?: ReadinessSnapshot): DerivedSetupReadiness;
