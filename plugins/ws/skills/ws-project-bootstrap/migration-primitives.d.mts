import type { EffectClassification } from "./transaction.d.mts";

export interface MigrationEntry {
	kind: "missing" | "file" | "directory" | "state" | "blocked";
	content: unknown;
	fingerprint: string | null;
}

export interface MigrationChange {
	field: string;
	value: unknown;
	source: string;
}

export interface MigrationEffect {
	order: number;
	target: string;
	kind: "file" | "directory" | "state";
	classification: EffectClassification;
	reason: string;
	before: unknown;
	after: unknown;
	diff: string;
	fingerprint: string | null;
}

export function sha256(value: string): string;
export function normalizeMigrationEntry(value: unknown): MigrationEntry;
export function flattenPaths(value: unknown, prefix?: string, output?: Record<string, unknown>): Record<string, unknown>;
export function getPath(value: unknown, ...paths: string[]): unknown;
export function setPath(target: Record<string, unknown>, dottedPath: string, value: unknown): void;
export function setIfAbsent(target: Record<string, unknown>, dottedPath: string, value: unknown, changes: MigrationChange[], source: string): void;
export function migrationEffect(
	order: number,
	target: string,
	kind: MigrationEffect["kind"],
	classification: EffectClassification,
	reason: string,
	entry?: MigrationEntry | null,
	after?: unknown,
): MigrationEffect;
