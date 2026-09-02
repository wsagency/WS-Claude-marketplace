import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CanonicalProjectConfig } from "../../../../plugins/ws/skills/ws-project-bootstrap/config.d.mts";
import type {
	JiraAdapter,
	JiraTicket,
	LocalTicket,
	SyncState,
	TicketFields,
	TrackerPersistence,
} from "../../../../plugins/ws/skills/ws-project-bootstrap/sync.d.mts";
import { runTrackerOperation } from "../../../../plugins/ws/skills/ws-project-bootstrap/sync.mjs";
import { run as defaultRun, type RunResult } from "./exec";
import { isUnknownRecord } from "./type-guards";
import type { NativeTicketSyncBoundary } from "../tools/ticket";

const SYNC_STATE_PATH = path.join(".wsagency", "sync-state.json");
const JIRA_FIELDS_START = "<!-- WS-MANAGED:jira-fields:START -->";
const JIRA_FIELDS_END = "<!-- WS-MANAGED:jira-fields:END -->";
const JIRA_FIELDS_PREFIX = "<!-- WS-JIRA-FIELDS:";
const ACCEPTANCE_START = "WS-ACCEPTANCE-CRITERIA-BEGIN";
const ACCEPTANCE_END = "WS-ACCEPTANCE-CRITERIA-END";
const CORRELATION_PREFIX = "WS-CORRELATION-";
const JIRA_TIMEOUT_MS = 10_000;
const TICKET_ACTIONS = new Set(["create", "update", "comment", "status"]);

interface JiraComment {
	id: string;
	text: string;
	author?: string;
	createdAt?: string;
}

interface ManagedJiraFields {
	priority?: string;
	type?: string;
	comments?: JiraComment[];
}

interface ParsedIssue {
	ticket: JiraTicket;
	correlationId?: string;
}

export interface ParsedTicket extends TicketFields {
	title: string;
	description: string;
	status: string;
	acceptanceCriteria: string;
}


function assertBareLocalId(localId: string): void {
	if (
		localId === ""
		|| localId === "."
		|| localId === ".."
		|| ["__proto__", "constructor", "prototype"].includes(localId)
		|| /[\\/]/.test(localId)
	) {
		throw new Error(`Invalid Local ticket identity: ${localId}`);
	}
}

function isVersion(value: unknown): value is string | number {
	return (typeof value === "string" && value !== "") || (typeof value === "number" && Number.isFinite(value));
}

function normalizeComments(value: unknown): JiraComment[] {
	if (!Array.isArray(value)) throw new Error("Managed Jira comments must be an array.");
	return value.map((candidate, index) => {
		if (!isUnknownRecord(candidate) || typeof candidate.id !== "string" || candidate.id === "" || typeof candidate.text !== "string") {
			throw new Error(`Managed Jira comment ${index + 1} is invalid.`);
		}
		const comment: JiraComment = { id: candidate.id, text: candidate.text };
		if (typeof candidate.author === "string") comment.author = candidate.author;
		if (typeof candidate.createdAt === "string") comment.createdAt = candidate.createdAt;
		return comment;
	});
}

function decodeManagedJiraFields(text: string): ManagedJiraFields {
	const start = text.indexOf(JIRA_FIELDS_START);
	const end = text.indexOf(JIRA_FIELDS_END);
	if (start === -1 && end === -1 && !text.includes(JIRA_FIELDS_PREFIX)) return {};
	if (start === -1 || end === -1 || end < start || text.indexOf(JIRA_FIELDS_START, start + 1) !== -1) {
		throw new Error("Ticket contains a malformed managed Jira fields section.");
	}
	const section = text.slice(start + JIRA_FIELDS_START.length, end).trim();
	if (!section.startsWith(JIRA_FIELDS_PREFIX) || !section.endsWith(" -->")) {
		throw new Error("Ticket contains a malformed managed Jira fields payload.");
	}
	const encoded = section.slice(JIRA_FIELDS_PREFIX.length, -" -->".length);
	let decoded: unknown;
	try {
		decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
	} catch (error) {
		throw new Error("Ticket contains an unreadable managed Jira fields payload.", { cause: error });
	}
	if (!isUnknownRecord(decoded)) throw new Error("Managed Jira fields payload must be an object.");
	const managed: ManagedJiraFields = {};
	if (Object.hasOwn(decoded, "priority")) {
		if (typeof decoded.priority !== "string") throw new Error("Managed Jira priority must be a string.");
		managed.priority = decoded.priority;
	}
	if (Object.hasOwn(decoded, "type")) {
		if (typeof decoded.type !== "string") throw new Error("Managed Jira type must be a string.");
		managed.type = decoded.type;
	}
	if (Object.hasOwn(decoded, "comments")) managed.comments = normalizeComments(decoded.comments);
	return managed;
}

function removeManagedJiraFields(text: string): string {
	const start = text.indexOf(JIRA_FIELDS_START);
	if (start === -1) return text;
	const end = text.indexOf(JIRA_FIELDS_END, start);
	if (end === -1) throw new Error("Ticket contains a malformed managed Jira fields section.");
	const before = text.slice(0, start).trimEnd();
	const after = text.slice(end + JIRA_FIELDS_END.length).trimStart();
	return after === "" ? `${before}\n` : `${before}\n\n${after}`;
}

function encodeManagedJiraFields(text: string, fields: Partial<TicketFields>): string {
	const managed = decodeManagedJiraFields(text);
	for (const field of ["priority", "type"] as const) {
		if (!Object.hasOwn(fields, field)) continue;
		const value = fields[field];
		if (value === undefined) delete managed[field];
		else if (typeof value === "string") managed[field] = value;
		else throw new Error(`Managed Jira ${field} must be a string.`);
	}
	if (Object.hasOwn(fields, "comments")) {
		if (fields.comments === undefined) delete managed.comments;
		else managed.comments = normalizeComments(fields.comments);
	}
	const withoutSection = removeManagedJiraFields(text).trimEnd();
	if (Object.keys(managed).length === 0) return `${withoutSection}\n`;
	const encoded = Buffer.from(JSON.stringify(managed), "utf8").toString("base64url");
	return `${withoutSection}\n\n${JIRA_FIELDS_START}\n${JIRA_FIELDS_PREFIX}${encoded} -->\n${JIRA_FIELDS_END}\n`;
}

function isTicketFieldBoundary(line: string): boolean {
	return /^\*\*[^*\n]+:\*\*(?:\s|$)/.test(line) || /^- \[[ xX]\] /.test(line) || line === JIRA_FIELDS_START;
}

function descriptionSpan(lines: string[]): { start: number; end: number } | null {
	const start = lines.findIndex(line => line.startsWith("**What to build:**"));
	if (start === -1) return null;
	let end = start + 1;
	while (end < lines.length && !isTicketFieldBoundary(lines[end] ?? "")) end += 1;
	while (end > start + 1 && (lines[end - 1] ?? "").trim() === "") end -= 1;
	return { start, end };
}

function criteriaLines(value: string): string[] {
	return value
		.split("\n")
		.map(line => line.trim())
		.filter(Boolean)
		.map(line => /^- \[[ xX]\] /.test(line) ? line : `- [ ] ${line}`);
}

export function parseTicket(text: string): ParsedTicket {
	const normalized = text.replaceAll("\r\n", "\n");
	const lines = normalized.split("\n");
	const titleLine = lines.find(line => line.startsWith("# "));
	const statusLine = lines.find(line => line.startsWith("**Status:**"));
	const span = descriptionSpan(lines);
	let description = "";
	if (span) {
		const first = (lines[span.start] ?? "").slice("**What to build:**".length).trimStart();
		description = [first, ...lines.slice(span.start + 1, span.end)].join("\n").trim();
	}
	const acceptanceCriteria = lines
		.filter(line => /^- \[[ xX]\] /.test(line))
		.map(line => line.trim())
		.join("\n");
	const managed = decodeManagedJiraFields(normalized);
	return {
		title: titleLine?.slice(2).trim() ?? "",
		description,
		status: statusLine?.slice("**Status:**".length).trim() ?? "",
		acceptanceCriteria,
		...(managed.priority !== undefined ? { priority: managed.priority } : {}),
		...(managed.type !== undefined ? { type: managed.type } : {}),
		...(managed.comments !== undefined ? { comments: managed.comments } : {}),
	};
}

export function updateTicketText(text: string, fields: Partial<TicketFields>): string {
	const managed = decodeManagedJiraFields(text);
	let lines = removeManagedJiraFields(text).replaceAll("\r\n", "\n").trimEnd().split("\n");
	if (Object.hasOwn(fields, "title")) {
		if (typeof fields.title !== "string" || fields.title === "") throw new Error("Ticket title must be a non-empty string.");
		const titleIndex = lines.findIndex(line => line.startsWith("# "));
		if (titleIndex === -1) lines.unshift(`# ${fields.title}`, "");
		else lines[titleIndex] = `# ${fields.title}`;
	}
	if (Object.hasOwn(fields, "description")) {
		if (typeof fields.description !== "string") throw new Error("Ticket description must be a string.");
		const nextDescription = fields.description.split("\n");
		const replacement = [`**What to build:** ${nextDescription.shift() ?? ""}`, ...nextDescription];
		const span = descriptionSpan(lines);
		if (span) lines.splice(span.start, span.end - span.start, ...replacement);
		else {
			const blockedBy = lines.findIndex(line => line.startsWith("**Blocked by:**"));
			const insertion = blockedBy === -1 ? lines.length : blockedBy;
			lines.splice(insertion, 0, ...replacement, "");
		}
	}
	if (Object.hasOwn(fields, "status")) {
		if (typeof fields.status !== "string" || fields.status === "") throw new Error("Ticket status must be a non-empty string.");
		const statusIndex = lines.findIndex(line => line.startsWith("**Status:**"));
		if (statusIndex === -1) lines.push("", `**Status:** ${fields.status}`);
		else lines[statusIndex] = `**Status:** ${fields.status}`;
	}
	if (Object.hasOwn(fields, "acceptanceCriteria")) {
		if (typeof fields.acceptanceCriteria !== "string") throw new Error("Ticket acceptance criteria must be a string.");
		lines = lines.filter(line => !/^- \[[ xX]\] /.test(line));
		const nextCriteria = criteriaLines(fields.acceptanceCriteria);
		if (nextCriteria.length > 0) {
			const statusIndex = lines.findIndex(line => line.startsWith("**Status:**"));
			const insertion = statusIndex === -1 ? lines.length : statusIndex + 1;
			while (insertion < lines.length && lines[insertion] === "") lines.splice(insertion, 1);
			lines.splice(insertion, 0, "", ...nextCriteria);
		}
	}
	return encodeManagedJiraFields(`${lines.join("\n").trimEnd()}\n`, { ...managed, ...fields });
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
	try {
		await fs.writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
		await fs.rename(temporary, filePath);
	} catch (error) {
		await fs.rm(temporary, { force: true }).catch(() => undefined);
		throw error;
	}
}

function validateSyncState(value: unknown): SyncState {
	if (!isUnknownRecord(value) || !isUnknownRecord(value.mappings) || !Array.isArray(value.pendingOperations)) {
		throw new Error(".wsagency/sync-state.json must contain mappings and pendingOperations.");
	}
	const mappings: SyncState["mappings"] = {};
	for (const [localId, candidate] of Object.entries(value.mappings)) {
		assertBareLocalId(localId);
		if (!isUnknownRecord(candidate) || typeof candidate.jiraId !== "string" || candidate.jiraId === "" || !isUnknownRecord(candidate.fieldHashes)) {
			throw new Error(`Invalid sync mapping for ${localId}.`);
		}
		const fieldHashes: Record<string, string> = {};
		for (const [field, fieldHash] of Object.entries(candidate.fieldHashes)) {
			if (typeof fieldHash !== "string") throw new Error(`Invalid field hash for ${localId}.${field}.`);
			fieldHashes[field] = fieldHash;
		}
		if (candidate.jiraVersion !== undefined && !isVersion(candidate.jiraVersion)) {
			throw new Error(`Invalid Jira version for ${localId}.`);
		}
		mappings[localId] = {
			jiraId: candidate.jiraId,
			fieldHashes,
			...(candidate.jiraVersion !== undefined ? { jiraVersion: candidate.jiraVersion } : {}),
		};
	}
	const pendingOperations: SyncState["pendingOperations"] = value.pendingOperations.map((candidate, index) => {
		if (
			!isUnknownRecord(candidate)
			|| typeof candidate.correlationId !== "string"
			|| candidate.correlationId === ""
			|| typeof candidate.localId !== "string"
			|| typeof candidate.action !== "string"
			|| !TICKET_ACTIONS.has(candidate.action)
			|| !isUnknownRecord(candidate.payload)
		) {
			throw new Error(`Invalid pending sync operation ${index + 1}.`);
		}
		assertBareLocalId(candidate.localId);
		if (candidate.returnedId !== undefined && (typeof candidate.returnedId !== "string" || candidate.returnedId === "")) {
			throw new Error(`Invalid returned Jira identity for pending operation ${index + 1}.`);
		}
		if (candidate.returnedVersion !== undefined && !isVersion(candidate.returnedVersion)) {
			throw new Error(`Invalid returned Jira version for pending operation ${index + 1}.`);
		}
		return {
			correlationId: candidate.correlationId,
			localId: candidate.localId,
			action: candidate.action as SyncState["pendingOperations"][number]["action"],
			payload: structuredClone(candidate.payload),
			...(candidate.returnedId !== undefined ? { returnedId: candidate.returnedId } : {}),
			...(candidate.returnedVersion !== undefined ? { returnedVersion: candidate.returnedVersion } : {}),
		};
	});
	return { mappings, pendingOperations };
}

async function existingTicketPath(root: string, localId: string): Promise<{ filePath: string; state: "open" | "done" } | null> {
	assertBareLocalId(localId);
	const open = path.join(root, "dev-docs", "tickets", "open", `${localId}.md`);
	const done = path.join(root, "dev-docs", "tickets", "done", `${localId}.md`);
	const [openExists, doneExists] = await Promise.all([
		fs.stat(open).then(stat => stat.isFile()).catch(error => {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
			throw error;
		}),
		fs.stat(done).then(stat => stat.isFile()).catch(error => {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
			throw error;
		}),
	]);
	if (openExists && doneExists) throw new Error(`Local ticket ${localId} exists in both open/ and done/.`);
	if (openExists) return { filePath: open, state: "open" };
	if (doneExists) return { filePath: done, state: "done" };
	return null;
}

export function createTicketPersistence(root: string): TrackerPersistence {
	const syncStatePath = path.join(root, SYNC_STATE_PATH);
	return {
		async persistSyncState(state) {
			const validated = validateSyncState(state);
			await atomicWrite(syncStatePath, `${JSON.stringify(validated, null, "\t")}\n`);
		},
		async readSyncState() {
			let source: string;
			try {
				source = await fs.readFile(syncStatePath, "utf8");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return { mappings: {}, pendingOperations: [] };
				throw error;
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(source);
			} catch (error) {
				throw new Error(".wsagency/sync-state.json is not valid JSON.", { cause: error });
			}
			return validateSyncState(parsed);
		},
		async persistLocalStore(store) {
			for (const [localId, ticket] of Object.entries(store)) {
				const current = await existingTicketPath(root, localId);
				if (!current) throw new Error(`Local ticket ${localId} disappeared before synchronization could persist it.`);
				const targetState = ticket.status === "done" ? "done" : "open";
				const target = path.join(root, "dev-docs", "tickets", targetState, `${localId}.md`);
				if (target !== current.filePath) {
					try {
						await fs.lstat(target);
						throw new Error(`Destination already exists: ${target}`);
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
					}
				}
				const source = await fs.readFile(current.filePath, "utf8");
				const updated = updateTicketText(source, ticket);
				if (updated !== source) await atomicWrite(current.filePath, updated);
				if (target !== current.filePath) {
					await fs.mkdir(path.dirname(target), { recursive: true });
					await fs.link(current.filePath, target);
					try {
						await fs.unlink(current.filePath);
					} catch (error) {
						await fs.rm(target, { force: true }).catch(() => undefined);
						throw error;
					}
				}
			}
		},
		async readLocalStore() {
			const store: Record<string, LocalTicket> = {};
			for (const state of ["open", "done"] as const) {
				const directory = path.join(root, "dev-docs", "tickets", state);
				let entries: string[];
				try {
					entries = (await fs.readdir(directory)).filter(entry => entry.endsWith(".md")).sort();
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
					throw error;
				}
				for (const entry of entries) {
					const localId = entry.slice(0, -3);
					assertBareLocalId(localId);
					if (store[localId]) throw new Error(`Local ticket ${localId} exists in both open/ and done/.`);
					const filePath = path.join(directory, entry);
					const parsed = parseTicket(await fs.readFile(filePath, "utf8"));
					store[localId] = {
						id: localId,
						...parsed,
						status: parsed.status || (state === "done" ? "done" : "ready-for-agent"),
						localMetadata: { path: path.relative(root, filePath), state },
					};
				}
			}
			return store;
		},
	};
}

function adfText(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(adfText).join("");
	if (!isUnknownRecord(value)) return "";
	if (value.type === "text") return typeof value.text === "string" ? value.text : "";
	if (value.type === "hardBreak") return "\n";
	const content = adfText(value.content);
	if (value.type === "paragraph" || value.type === "heading") return `${content}\n\n`;
	if (value.type === "listItem") return `- ${content.trim()}\n`;
	return content;
}

function normalizeAdfText(value: unknown): string {
	return adfText(value).replace(/\n{3,}/g, "\n\n").trim();
}

function parseDescriptionEnvelope(value: unknown): { description: string; acceptanceCriteria?: string; correlationId?: string } {
	let text = normalizeAdfText(value);
	let acceptanceCriteria: string | undefined;
	const acceptanceStart = text.lastIndexOf(ACCEPTANCE_START);
	const acceptanceEnd = text.lastIndexOf(ACCEPTANCE_END);
	if ((acceptanceStart === -1) !== (acceptanceEnd === -1) || (acceptanceStart !== -1 && acceptanceEnd < acceptanceStart)) {
		throw new Error("Jira description contains malformed acceptance-criteria markers.");
	}
	if (acceptanceStart !== -1) {
		acceptanceCriteria = text.slice(acceptanceStart + ACCEPTANCE_START.length, acceptanceEnd).trim();
		text = `${text.slice(0, acceptanceStart)}${text.slice(acceptanceEnd + ACCEPTANCE_END.length)}`.trim();
	}
	const correlationPattern = new RegExp(`(?:^|\\n)${CORRELATION_PREFIX}([a-f0-9]{64})(?:$|\\n)`, "i");
	const correlation = text.match(correlationPattern);
	if (correlation) text = text.replace(correlation[0], "\n").trim();
	return {
		description: text,
		...(acceptanceCriteria !== undefined ? { acceptanceCriteria } : {}),
		...(correlation?.[1] ? { correlationId: correlation[1].toLowerCase() } : {}),
	};
}

function formatDescription(fields: TicketFields, correlationId?: string): string {
	const sections = [typeof fields.description === "string" ? fields.description.trim() : ""];
	if (typeof fields.acceptanceCriteria === "string" && fields.acceptanceCriteria.trim() !== "") {
		sections.push(`${ACCEPTANCE_START}\n${fields.acceptanceCriteria.trim()}\n${ACCEPTANCE_END}`);
	}
	if (correlationId) sections.push(`${CORRELATION_PREFIX}${correlationId}`);
	return sections.filter(Boolean).join("\n\n");
}

function canonicalStatus(fields: Record<string, unknown>): string | undefined {
	const status = isUnknownRecord(fields.status) ? fields.status : null;
	const category = status && isUnknownRecord(status.statusCategory) ? status.statusCategory : null;
	const categoryKey = typeof category?.key === "string" ? category.key.toLowerCase() : "";
	const name = typeof status?.name === "string" ? status.name.toLowerCase() : "";
	if (categoryKey === "done" || ["done", "closed", "resolved"].includes(name)) return "done";
	return status ? "ready-for-agent" : undefined;
}

function parseIssue(raw: unknown): ParsedIssue {
	if (!isUnknownRecord(raw) || typeof raw.key !== "string" || raw.key === "" || !isUnknownRecord(raw.fields)) {
		throw new Error("Jira returned an issue without a stable key or fields.");
	}
	const version = raw.fields.updated ?? raw.version;
	if (!isVersion(version)) throw new Error(`Jira issue ${raw.key} did not include an update version.`);
	const envelope = parseDescriptionEnvelope(raw.fields.description);
	const commentContainer = isUnknownRecord(raw.fields.comment) ? raw.fields.comment : null;
	const rawComments = Array.isArray(commentContainer?.comments) ? commentContainer.comments : [];
	const comments = rawComments.flatMap(candidate => {
		if (!isUnknownRecord(candidate) || (typeof candidate.id !== "string" && typeof candidate.id !== "number")) return [];
		const authorRecord = isUnknownRecord(candidate.author) ? candidate.author : null;
		const author = typeof authorRecord?.displayName === "string"
			? authorRecord.displayName
			: typeof authorRecord?.accountId === "string" ? authorRecord.accountId : undefined;
		return [{
			id: String(candidate.id),
			text: normalizeAdfText(candidate.body),
			...(author ? { author } : {}),
			...(typeof candidate.created === "string" ? { createdAt: candidate.created } : {}),
		}];
	});
	const priority = isUnknownRecord(raw.fields.priority) && typeof raw.fields.priority.name === "string" ? raw.fields.priority.name : undefined;
	const type = isUnknownRecord(raw.fields.issuetype) && typeof raw.fields.issuetype.name === "string" ? raw.fields.issuetype.name : undefined;
	const status = canonicalStatus(raw.fields);
	return {
		ticket: {
			id: raw.key,
			version,
			...(typeof raw.fields.summary === "string" ? { title: raw.fields.summary } : {}),
			description: envelope.description,
			...(envelope.acceptanceCriteria !== undefined ? { acceptanceCriteria: envelope.acceptanceCriteria } : {}),
			...(status ? { status } : {}),
			...(priority !== undefined ? { priority } : {}),
			...(type !== undefined ? { type } : {}),
			comments,
		},
		...(envelope.correlationId ? { correlationId: envelope.correlationId } : {}),
	};
}

function jiraFailure(action: string, result: RunResult): Error {
	const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
	return new Error(`${action} failed: ${detail}`);
}

function parseJsonOutput(action: string, output: string): unknown {
	try {
		return JSON.parse(output);
	} catch (error) {
		throw new Error(`${action} returned invalid JSON.`, { cause: error });
	}
}

function outputIssueKeys(raw: unknown): string[] {
	const candidates = Array.isArray(raw) ? raw : isUnknownRecord(raw) && Array.isArray(raw.issues) ? raw.issues : [];
	return candidates.flatMap(candidate => isUnknownRecord(candidate) && typeof candidate.key === "string" ? [candidate.key] : []);
}

function jqlString(value: string): string {
	return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function changed(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) !== JSON.stringify(right);
}

export function createJiraAdapter(
	root: string,
	config: CanonicalProjectConfig,
	runExec: typeof defaultRun = defaultRun,
): JiraAdapter {
	const project = config.jira?.project;
	if (!project) throw new Error("Missing Jira project in canonical policy.");
	const invoke = async (args: string[], action: string): Promise<RunResult> => {
		const result = await runExec("jira", args, { cwd: root, timeout: JIRA_TIMEOUT_MS });
		if (result.code !== 0) throw jiraFailure(action, result);
		return result;
	};
	const getParsed = async (id: string): Promise<ParsedIssue> => {
		const result = await invoke(["issue", "view", id, "--raw", "--comments", "100"], `Jira view ${id}`);
		return parseIssue(parseJsonOutput(`Jira view ${id}`, result.stdout));
	};
	const adapter: JiraAdapter = {
		async getTicket(id) {
			return (await getParsed(id)).ticket;
		},
		async findTicketByCorrelation(correlationId) {
			const marker = `${CORRELATION_PREFIX}${correlationId}`;
			const jql = `project = ${jqlString(project)} AND description ~ ${jqlString(marker)}`;
			const result = await invoke(["issue", "list", "-q", jql, "--raw"], "Jira correlation lookup");
			for (const key of outputIssueKeys(parseJsonOutput("Jira correlation lookup", result.stdout))) {
				const candidate = await getParsed(key);
				if (candidate.correlationId === correlationId.toLowerCase()) return candidate.ticket;
			}
			return null;
		},
		async createTicket(fields, correlationId) {
			if (!/^[a-f0-9]{64}$/i.test(correlationId)) throw new Error("Jira correlation identity must be a SHA-256 value.");
			const title = typeof fields.title === "string" && fields.title.trim() !== "" ? fields.title : "Untitled";
			const type = typeof fields.type === "string" && fields.type !== "" ? fields.type : config.jira?.default_issue_type ?? "Task";
			const args = [
				"issue", "create",
				"-p", project,
				"-t", type,
				"-s", title,
				"-b", formatDescription(fields, correlationId.toLowerCase()),
			];
			if (typeof fields.priority === "string" && fields.priority !== "") args.push("-y", fields.priority);
			args.push("--raw", "--no-input");
			const result = await invoke(args, "Jira create");
			let key: string | undefined;
			try {
				const created = JSON.parse(result.stdout) as unknown;
				if (isUnknownRecord(created) && typeof created.key === "string") key = created.key;
			} catch {
				// Some jira-cli releases emit a human-readable confirmation even with --raw.
			}
			key ??= result.stdout.match(/\b[A-Z][A-Z0-9]+-\d+\b/)?.[0];
			if (!key) throw new Error("Jira create returned no verifiable issue key.");
			let created = await getParsed(key);
			if (created.correlationId !== correlationId.toLowerCase()) {
				throw new Error(`Jira create verification for ${key} did not preserve the correlation identity.`);
			}
			if (fields.status === "done" && created.ticket.status !== "done") {
				const transitioned = await adapter.updateStatus(key, "done");
				created = {
					ticket: transitioned?.id && transitioned.version !== undefined
						? transitioned
						: (await getParsed(key)).ticket,
					correlationId,
				};
			}
			return created.ticket;
		},
		async updateTicket(id, fields) {
			const current = await getParsed(id);
			const merged: TicketFields = { ...current.ticket, ...fields };
			if (Object.hasOwn(fields, "type") && changed(fields.type, current.ticket.type)) {
				throw new Error("jira-cli cannot safely change issue type; the update remains pending.");
			}
			if (Object.hasOwn(fields, "comments") && changed(fields.comments, current.ticket.comments)) {
				throw new Error("Jira comments must be changed through addComment; the update remains pending.");
			}
			const args = ["issue", "edit", id];
			let edited = false;
			if (Object.hasOwn(fields, "title") && changed(fields.title, current.ticket.title)) {
				if (typeof fields.title !== "string" || fields.title === "") throw new Error("Jira title must be a non-empty string.");
				args.push("-s", fields.title);
			}
			if (
				(Object.hasOwn(fields, "description") && changed(fields.description, current.ticket.description))
				|| (Object.hasOwn(fields, "acceptanceCriteria") && changed(fields.acceptanceCriteria, current.ticket.acceptanceCriteria))
			) {
				args.push("-b", formatDescription(merged, current.correlationId));
			}
			if (Object.hasOwn(fields, "priority") && changed(fields.priority, current.ticket.priority)) {
				if (typeof fields.priority !== "string" || fields.priority === "") {
					throw new Error("jira-cli cannot safely clear issue priority; the update remains pending.");
				}
				args.push("-y", fields.priority);
			}
			if (args.length > 3) {
				args.push("--no-input");
				await invoke(args, `Jira edit ${id}`);
				edited = true;
			}
			if (Object.hasOwn(fields, "status") && changed(fields.status, current.ticket.status)) {
				if (typeof fields.status !== "string") throw new Error("Jira status must be a string.");
				return adapter.updateStatus(id, fields.status);
			}
			return edited ? (await getParsed(id)).ticket : current.ticket;
		},
		async updateStatus(id, status) {
			const target = status === "done" ? "Done" : "To Do";
			await invoke(["issue", "move", id, target], `Jira transition ${id}`);
			return (await getParsed(id)).ticket;
		},
		async addComment(id, text) {
			const before = await getParsed(id);
			const existingIds = new Set(before.ticket.comments?.map(comment => comment.id) ?? []);
			await invoke(["issue", "comment", "add", id, text, "--no-input"], `Jira comment ${id}`);
			const after = await getParsed(id);
			const created = [...(after.ticket.comments ?? [])]
				.reverse()
				.find(comment => !existingIds.has(comment.id) && comment.text === text);
			if (!created) throw new Error(`Jira comment on ${id} could not be verified by identity and content.`);
			return { id: created.id, version: after.ticket.version };
		},
	};
	return adapter;
}

export function createSynchronizedOperation(runExec: typeof defaultRun = defaultRun): NativeTicketSyncBoundary {
	return async ({ root, policy, operation }) => {
		if (!policy.config) throw new Error("Canonical project policy is unavailable.");
		const persistence = createTicketPersistence(root);
		let performedMessage: string | undefined;
		const result = await runTrackerOperation({
			config: policy.config,
			localStore: await persistence.readLocalStore(),
			syncState: await persistence.readSyncState(),
			operation: {
				action: operation.action,
				localId: operation.localId,
				payload: operation.payload,
				perform: async (_store: Record<string, LocalTicket>, effective: { payload: Record<string, unknown> }) => {
					performedMessage = await operation.perform(effective.payload);
					return persistence.readLocalStore();
				},
			},
			jiraAdapter: createJiraAdapter(root, policy.config, runExec),
			persistence,
			conflictChoices: [],
		});
		if (result.readiness?.ready === false) throw new Error(result.readiness.reason ?? "Synchronization is not ready.");
		if (Array.isArray(result.conflicts) && result.conflicts.length > 0) {
			const details = result.conflicts.map((conflict: { field?: unknown }) =>
				typeof conflict.field === "string" ? `Conflict on ${conflict.field}` : "Conflict on unknown field"
			);
			throw new Error(`Sync blocked: ${details.join(", ")}`);
		}
		if (Array.isArray(result.blockers) && result.blockers.length > 0) {
			throw new Error(`Sync blocked: ${result.blockers.join(", ")}`);
		}
		const message = performedMessage ?? `Applied ${operation.action} for ${operation.localId}`;
		const pendingCount = result.nextSyncState.pendingOperations.length;
		return pendingCount > 0
			? `${message}; Jira sync pending: ${pendingCount} operation(s).`
			: `${message}; Jira synchronized.`;
	};
}

export const runSynchronizedOperation = createSynchronizedOperation();
