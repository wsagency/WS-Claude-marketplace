import { createHash } from "node:crypto";

export function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

export function normalizeMigrationEntry(value) {
	if (value == null) return { kind: "missing", content: null, fingerprint: null };
	if (typeof value === "string") return { kind: "file", content: value, fingerprint: sha256(value) };
	if (typeof value === "object" && Object.hasOwn(value, "content")) {
		return {
			kind: value.kind ?? "file",
			content: value.content,
			fingerprint: value.fingerprint ?? (typeof value.content === "string" ? sha256(value.content) : null),
		};
	}
	return { kind: "state", content: value, fingerprint: sha256(JSON.stringify(value)) };
}

export function flattenPaths(value, prefix = "", output = {}) {
	for (const [key, child] of Object.entries(value ?? {})) {
		const field = prefix ? `${prefix}.${key}` : key;
		if (child && typeof child === "object" && !Array.isArray(child)) flattenPaths(child, field, output);
		else output[field] = child;
	}
	return output;
}

export function getPath(value, ...paths) {
	for (const dottedPath of paths) {
		const result = dottedPath.split(".").reduce((cursor, part) => cursor?.[part], value);
		if (result !== undefined) return result;
	}
	return undefined;
}

export function setPath(target, dottedPath, value) {
	const parts = dottedPath.split(".");
	let cursor = target;
	for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
	cursor[parts.at(-1)] = structuredClone(value);
}

export function setIfAbsent(target, dottedPath, value, changes, source) {
	if (value === undefined || value === null || getPath(target, dottedPath) !== undefined) return;
	setPath(target, dottedPath, value);
	changes.push({ field: dottedPath, value, source });
}

export function migrationEffect(order, target, kind, classification, reason, entry, after) {
	const before = entry?.content ?? null;
	const hasAfter = arguments.length >= 7;
	const renderedAfter = kind === "state" && hasAfter && after !== null
		? JSON.stringify(after)
		: hasAfter
			? after
			: before;
	return {
		order,
		target,
		kind,
		classification,
		reason,
		before,
		after: renderedAfter,
		diff: classification === "PRESERVE" || classification === "NO-OP"
			? "unchanged"
			: `${JSON.stringify(before)} -> ${JSON.stringify(renderedAfter)}`,
		fingerprint: entry?.fingerprint ?? null,
	};
}
