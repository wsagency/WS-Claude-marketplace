import type { OriginIdentity } from "./transaction.d.mts";

export interface RepositoryIdentityInput {
	root?: string;
	verifiedOrigin?: string | OriginIdentity | null;
	persistedIdentity?: string | null;
}

export interface JiraCorrelationIdentity {
	id: string;
	scope: string;
	token: string;
	marker: string;
}

export function validateRepositoryIdentity(identity: unknown): string;
export function resolveRepositoryIdentity(input?: RepositoryIdentityInput): string;
export function repositoryIdentityScope(repositoryIdentity: string): string;
export function createJiraCorrelation(repositoryIdentity: string, jiraProject: string, sourceCorrelationId: string): JiraCorrelationIdentity;
export function parseJiraCorrelationId(value: unknown): Omit<JiraCorrelationIdentity, "marker"> | null;
export function parseJiraCorrelationMarker(value: unknown): JiraCorrelationIdentity | null;
export function resolveJiraCorrelation(repositoryIdentity: string, jiraProject: string, correlationId: string): JiraCorrelationIdentity;
export function repositorySourceLink(repositoryIdentity: string, localId: string): string;
