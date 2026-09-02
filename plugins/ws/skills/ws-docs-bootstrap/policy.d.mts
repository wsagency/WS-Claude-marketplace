import type { CanonicalProjectConfig } from "../ws-project-bootstrap/config.mjs";

export const CANONICAL_CONFIG_PATH: ".wsagency/config.yaml";
export const LEGACY_CONFIG_PATHS: readonly [".claude/docs-config.yaml", ".claude/ws-project.yaml"];
export const DEFAULT_DOCUMENTATION_POLICY: Readonly<NonNullable<CanonicalProjectConfig["docs"]>>;
export const DEFAULT_CHANGELOG_POLICY: Readonly<NonNullable<CanonicalProjectConfig["changelog"]>>;

export type DocumentationCapability = "inspect" | "bootstrap" | "documentation" | "changelog" | "maintenance" | "hub_documentation";

export interface PolicyBlocker {
	code: string;
	source: string;
	message: string;
}

export interface CanonicalPolicyInspection {
	root: string;
	status: "valid" | "missing" | "blocked";
	config: CanonicalProjectConfig | null;
	docs: CanonicalProjectConfig["docs"] | null;
	changelog: CanonicalProjectConfig["changelog"] | null;
	blockers: PolicyBlocker[];
}

export class DocumentationPolicyError extends Error {
	readonly code: string;
	readonly source: string;
}

export function inspectCanonicalPolicy(root: string): Promise<CanonicalPolicyInspection>;
export function derivePolicyReadiness(inspection: CanonicalPolicyInspection, capability: DocumentationCapability): { ready: boolean; blockers: PolicyBlocker[] };
export function requirePolicyCapability(root: string, capability: DocumentationCapability): Promise<CanonicalPolicyInspection>;
export function deriveDocumentationReadiness(inspection: CanonicalPolicyInspection, snapshot?: {
	projectShape?: "standalone" | "hub_root" | "hub_subrepository";
	userTrack?: boolean;
	requireProductDocsRepository?: boolean;
	devTrack?: boolean;
	changelog?: boolean;
	productDocsRepository?: boolean;
}): {
	configValid: boolean;
	docsPolicyReady: boolean;
	changelogPolicyReady: boolean;
	docsReady: boolean;
	changelogReady: boolean;
	publishReady: boolean;
	blockers: PolicyBlocker[];
};
