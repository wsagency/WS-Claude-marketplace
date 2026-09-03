import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { hashField, runTrackerOperation } from "../../../plugins/ws/skills/ws-project-bootstrap/sync.mjs";
import {
	createJiraCorrelation,
	resolveJiraCorrelation,
	resolveRepositoryIdentity,
} from "../../../plugins/ws/skills/ws-project-bootstrap/correlation-identity.mjs";
import { planBackfill } from "../../../plugins/ws/skills/ws-project-bootstrap/backfill-jira.mjs";
import type { CanonicalProjectConfig } from "../../../plugins/ws/skills/ws-project-bootstrap/config.d.mts";
import type { RunOptions, RunResult } from "../src/lib/exec";
import type { RepositoryPolicyState } from "../src/lib/project-policy";
import {
	createJiraAdapter,
	createJiraCommentPropertyStore,
	createSynchronizedOperation,
	createTicketPersistence,
	parseTicket,
	updateTicketText,
	type JiraCommentCorrelationStore,
} from "../src/lib/ticket-sync";
import { renderTicket, type NativeTicketSyncOperation } from "../src/tools/ticket";

const CONFIG: CanonicalProjectConfig = {
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
	jira: { project: "WCM", sync: "all_local_tickets", default_issue_type: "Task" },
};

interface JiraIssueState {
	key: string;
	fields: {
		summary: string;
		description: unknown;
		updated: string;
		status: { name: string; statusCategory: { key: string } };
		issuetype: { name: string };
		priority?: { name: string };
		comment: { comments: Array<Record<string, unknown>> };
	};
}

class FakeJiraCli {
	calls: Array<{ command: string; args: string[] }> = [];
	issue: JiraIssueState | null;
	outage = false;
	private revision = 1;
	private nextComment = 10_001;
	commentProperties = new Map<string, string>();
	commentPropertyCalls: Array<{ issueId: string; text: string; correlationId: string }> = [];

	constructor(issue: JiraIssueState | null = null) {
		this.issue = issue;
	}

	private timestamp(): string {
		const result = `2026-09-03T00:00:${String(this.revision).padStart(2, "0")}.000+0000`;
		this.revision += 1;
		return result;
	}

	private flag(args: string[], name: string): string | undefined {
		const index = args.indexOf(name);
		return index === -1 ? undefined : args[index + 1];
	}

	run = async (command: string, args: string[], _options?: RunOptions): Promise<RunResult> => {
		this.calls.push({ command, args: [...args] });
		if (this.outage) return { code: 1, stdout: "", stderr: "Jira unavailable" };
		if (command !== "jira") return { code: 1, stdout: "", stderr: "unexpected command" };
		if (args[0] !== "issue") return { code: 1, stdout: "", stderr: "unexpected Jira resource" };

		if (args[1] === "create") {
			const project = this.flag(args, "-p") ?? "WCM";
			this.issue = {
				key: `${project}-101`,
				fields: {
					summary: this.flag(args, "-s") ?? "Untitled",
					description: this.flag(args, "-b") ?? "",
					updated: this.timestamp(),
					status: { name: "To Do", statusCategory: { key: "new" } },
					issuetype: { name: this.flag(args, "-t") ?? "Task" },
					...(this.flag(args, "-y") ? { priority: { name: this.flag(args, "-y")! } } : {}),
					comment: { comments: [] },
				},
			};
			return { code: 0, stdout: JSON.stringify({ key: this.issue.key }), stderr: "" };
		}
		if (args[1] === "view") {
			if (!this.issue || args[2] !== this.issue.key) return { code: 1, stdout: "", stderr: "issue not found" };
			return { code: 0, stdout: JSON.stringify(this.issue), stderr: "" };
		}
		if (args[1] === "list") {
			return { code: 0, stdout: JSON.stringify({ issues: this.issue ? [{ key: this.issue.key }] : [] }), stderr: "" };
		}
		if (args[1] === "edit") {
			if (!this.issue || args[2] !== this.issue.key) return { code: 1, stdout: "", stderr: "issue not found" };
			const summary = this.flag(args, "-s");
			const body = this.flag(args, "-b");
			const priority = this.flag(args, "-y");
			if (summary !== undefined) this.issue.fields.summary = summary;
			if (body !== undefined) this.issue.fields.description = body;
			if (priority !== undefined) this.issue.fields.priority = { name: priority };
			this.issue.fields.updated = this.timestamp();
			return { code: 0, stdout: "Edited", stderr: "" };
		}
		if (args[1] === "move") {
			if (!this.issue || args[2] !== this.issue.key) return { code: 1, stdout: "", stderr: "issue not found" };
			const done = args[3] === "Done";
			this.issue.fields.status = done
				? { name: "Done", statusCategory: { key: "done" } }
				: { name: "To Do", statusCategory: { key: "new" } };
			this.issue.fields.updated = this.timestamp();
			return { code: 0, stdout: "Moved", stderr: "" };
		}
		return { code: 1, stdout: "", stderr: `unhandled Jira command: ${args.join(" ")}` };
	};

	addCommentWithProperty(issueId: string, text: string, correlationId: string): string {
		if (!this.issue || issueId !== this.issue.key) throw new Error("issue not found");
		const id = String(this.nextComment++);
		this.issue.fields.comment.comments.push({
			id,
			body: text,
			author: { displayName: "WS Bot" },
			created: this.timestamp(),
		});
		this.issue.fields.updated = this.timestamp();
		this.commentProperties.set(id, correlationId);
		this.commentPropertyCalls.push({ issueId, text, correlationId });
		return id;
	}
}

function issue(overrides: Partial<JiraIssueState["fields"]> = {}): JiraIssueState {
	return {
		key: "WCM-1",
		fields: {
			summary: "Baseline",
			description: "Body",
			updated: "2026-09-03T00:00:00.000+0000",
			status: { name: "To Do", statusCategory: { key: "new" } },
			issuetype: { name: "Task" },
			priority: { name: "Medium" },
			comment: { comments: [] },
			...overrides,
		},
	};
}

function policy(root: string): RepositoryPolicyState {
	return { status: "valid", root, config: CONFIG, errors: [], legacySources: [], reconfiguringDomains: [] };
}

function testCommentCorrelationStore(
	jira: FakeJiraCli,
	repositoryIdentity: string,
	project = "WCM",
): JiraCommentCorrelationStore {
	return {
		resolve(sourceCorrelationId) {
			return createJiraCorrelation(repositoryIdentity, project, sourceCorrelationId).id;
		},
		async correlations(issueId) {
			if (!jira.issue || jira.issue.key !== issueId) throw new Error("issue not found");
			return [...jira.commentProperties.entries()].flatMap(([commentId, correlationId]) => {
				try {
					const expected = resolveJiraCorrelation(repositoryIdentity, project, correlationId);
					const comment = jira.issue?.fields.comment.comments.find(candidate => String(candidate.id) === commentId);
					if (expected.id !== correlationId || typeof comment?.body !== "string") return [];
					return [{ commentId, correlationId, text: comment.body }];
				} catch {
					return [];
				}
			});
		},
		async create(issueId, text, correlationId) {
			return jira.addCommentWithProperty(issueId, text, correlationId);
		},
	};
}

function operation(
	action: NativeTicketSyncOperation["action"],
	localId: string,
	payload: Record<string, unknown>,
	perform: NativeTicketSyncOperation["perform"],
): NativeTicketSyncOperation {
	return { action, localId, payload, perform };
}

let root: string;

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "ws-ticket-sync-test-"));
	await fs.mkdir(path.join(root, ".wsagency"), { recursive: true });
	await fs.mkdir(path.join(root, "dev-docs", "tickets", "open"), { recursive: true });
	await fs.mkdir(path.join(root, "dev-docs", "tickets", "done"), { recursive: true });
});

afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

describe("Local ticket persistence", () => {
	test("round-trips mapped fields while preserving Local-only prose and moving status atomically", async () => {
		const openPath = path.join(root, "dev-docs", "tickets", "open", "ticket.md");
		await fs.writeFile(openPath, renderTicket({
			title: "Original",
			body: "Original body",
			blockedBy: ["private-dependency"],
			share: "https://private.example/session",
			criteria: ["Original criterion"],
		}), "utf8");
		const persistence = createTicketPersistence(root);
		const comments = [{ id: "10001", text: "Remote comment", author: "WS Bot", createdAt: "2026-09-03" }];

		await persistence.persistLocalStore({
			ticket: {
				id: "ticket",
				title: "Updated",
				description: "First line\nSecond line",
				status: "done",
				acceptanceCriteria: "- [ ] First\n- [x] Second",
				priority: "High",
				type: "Task",
				comments,
				localMetadata: { private: "never serialized" },
			},
		});

		const donePath = path.join(root, "dev-docs", "tickets", "done", "ticket.md");
		const text = await fs.readFile(donePath, "utf8");
		expect(text).toContain("share: https://private.example/session");
		expect(text).toContain("**Blocked by:** private-dependency");
		expect(text).not.toContain("never serialized");
		expect(await fs.stat(openPath).then(() => true).catch(() => false)).toBe(false);
		const parsed = parseTicket(text);
		expect(parsed).toEqual({
			title: "Updated",
			description: "First line\nSecond line",
			status: "done",
			acceptanceCriteria: "- [ ] First\n- [x] Second",
			priority: "High",
			type: "Task",
			comments,
		});
	});

	test("rejects malformed durable state instead of silently resetting synchronization", async () => {
		await fs.writeFile(path.join(root, ".wsagency", "sync-state.json"), "{not-json", "utf8");
		expect(createTicketPersistence(root).readSyncState()).rejects.toThrow("is not valid JSON");
	});

	test("updates multiline descriptions and criteria without replacing authored metadata", () => {
		const source = renderTicket({ title: "Before", body: "Before", blockedBy: ["one"], share: "secret", criteria: ["Old"] });
		const updated = updateTicketText(source, {
			title: "After",
			description: "Line one\nLine two",
			status: "done",
			acceptanceCriteria: "- [ ] New",
		});
		expect(updated).toContain("share: secret");
		expect(updated).toContain("**Blocked by:** one");
		expect(parseTicket(updated)).toMatchObject({
			title: "After",
			description: "Line one\nLine two",
			status: "done",
			acceptanceCriteria: "- [ ] New",
		});
	});
});

describe("Jira CLI adapter", () => {
	test("maps ADF, update, status, comments, and correlation with verified Jira identities", async () => {
		const sourceCorrelationId = "a".repeat(64);
		const repositoryIdentity = resolveRepositoryIdentity({ root });
		const correlation = createJiraCorrelation(repositoryIdentity, "WCM", sourceCorrelationId);
		const jira = new FakeJiraCli(issue({
			description: {
				type: "doc",
				content: [
					{ type: "paragraph", content: [{ type: "text", text: "Body" }] },
					{ type: "paragraph", content: [{ type: "text", text: "WS-ACCEPTANCE-CRITERIA-BEGIN" }] },
					{ type: "paragraph", content: [{ type: "text", text: "- [ ] Works" }] },
					{ type: "paragraph", content: [{ type: "text", text: "WS-ACCEPTANCE-CRITERIA-END" }] },
					{ type: "paragraph", content: [{ type: "text", text: correlation.marker }] },
				],
			},
		}));
		const adapter = createJiraAdapter(
			root,
			CONFIG,
			jira.run,
			testCommentCorrelationStore(jira, repositoryIdentity),
		);

		const initial = await adapter.getTicket("WCM-1");
		expect(initial).toMatchObject({
			id: "WCM-1",
			version: "2026-09-03T00:00:00.000+0000",
			description: "Body",
			acceptanceCriteria: "- [ ] Works",
			status: "ready-for-agent",
			type: "Task",
			priority: "Medium",
			comments: [],
		});
		expect((await adapter.findTicketByCorrelation(sourceCorrelationId))?.id).toBe("WCM-1");

		const updated = await adapter.updateTicket("WCM-1", {
			title: "Updated",
			description: "New body",
			acceptanceCriteria: "- [ ] New criterion",
			priority: "High",
		});
		expect(updated).toMatchObject({ title: "Updated", description: "New body", acceptanceCriteria: "- [ ] New criterion", priority: "High" });
		const edit = jira.calls.find(call => call.args[1] === "edit");
		expect(edit?.args).toEqual([
			"issue", "edit", "WCM-1",
			"-s", "Updated",
			"-b", `New body\n\nWS-ACCEPTANCE-CRITERIA-BEGIN\n- [ ] New criterion\nWS-ACCEPTANCE-CRITERIA-END\n\n${correlation.marker}`,
			"-y", "High",
			"--no-input",
		]);

		const transitioned = await adapter.updateStatus("WCM-1", "done");
		expect(transitioned).toMatchObject({ status: "done" });
		const move = jira.calls.find(call => call.args[1] === "move");
		expect(move?.args).toEqual(["issue", "move", "WCM-1", "Done"]);

		const sourceCommentCorrelation = "c".repeat(64);
		const scopedCommentCorrelation = createJiraCorrelation(
			repositoryIdentity,
			"WCM",
			sourceCommentCorrelation,
		).id;
		const exactComment = "  Durable comment  \n";
		const comment = await adapter.addComment("WCM-1", exactComment, sourceCommentCorrelation);
		expect(comment.id).toBe("10001");
		expect(comment.version).toBe(jira.issue!.fields.updated);
		expect(jira.commentPropertyCalls).toEqual([{
			issueId: "WCM-1",
			text: exactComment,
			correlationId: scopedCommentCorrelation,
		}]);
		expect(jira.issue?.fields.comment.comments[0]?.body).toBe(exactComment);
		expect((await adapter.getTicket("WCM-1"))?.comments?.[0]?.text).toBe(exactComment);
	});

	test("rejects malformed and ambiguous comment ownership properties before mutation", async () => {
		const repositoryIdentity = resolveRepositoryIdentity({ root });
		const scopedCorrelation = createJiraCorrelation(repositoryIdentity, "WCM", "source-comment").id;
		const malformed = new FakeJiraCli(issue({
			comment: {
				comments: [{
					id: "10001",
					body: "Visible",
					author: { displayName: "WS Bot" },
					created: "2026-09-03T00:00:00.000+0000",
				}],
			},
		}));
		const malformedBase = testCommentCorrelationStore(malformed, repositoryIdentity);
		const malformedAdapter = createJiraAdapter(root, CONFIG, malformed.run, {
			...malformedBase,
			async correlations() {
				return [{ correlationId: "malformed", commentId: "10001", text: "Visible" }];
			},
		});
		await expect(malformedAdapter.addComment("WCM-1", "Visible", "source-comment"))
			.rejects.toThrow("SHA-256");
		expect(malformed.commentPropertyCalls).toHaveLength(0);

		const ambiguous = new FakeJiraCli(issue({
			comment: {
				comments: ["10001", "10002"].map(id => ({
					id,
					body: "Visible",
					author: { displayName: "WS Bot" },
					created: "2026-09-03T00:00:00.000+0000",
				})),
			},
		}));
		const ambiguousBase = testCommentCorrelationStore(ambiguous, repositoryIdentity);
		const ambiguousAdapter = createJiraAdapter(root, CONFIG, ambiguous.run, {
			...ambiguousBase,
			async correlations() {
				return ["10001", "10002"].map(commentId => ({ correlationId: scopedCorrelation, commentId, text: "Visible" }));
			},
		});
		await expect(ambiguousAdapter.addComment("WCM-1", "Visible", "source-comment"))
			.rejects.toThrow("ambiguously owned");
		expect(ambiguous.commentPropertyCalls).toHaveLength(0);
	});

	test("uses only the repository-resolved scope when recovering comments", async () => {
		const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ws-ticket-comment-scope-"));
		try {
			const jira = new FakeJiraCli(issue());
			const sourceCorrelation = "same-source-request";
			const first = createJiraAdapter(
				root,
				CONFIG,
				jira.run,
				testCommentCorrelationStore(jira, resolveRepositoryIdentity({ root })),
			);
			const second = createJiraAdapter(
				secondRoot,
				CONFIG,
				jira.run,
				testCommentCorrelationStore(jira, resolveRepositoryIdentity({ root: secondRoot })),
			);

			await first.addComment("WCM-1", "Same visible text", sourceCorrelation);
			await second.addComment("WCM-1", "Same visible text", sourceCorrelation);

			expect(jira.commentPropertyCalls).toHaveLength(2);
			expect(jira.issue?.fields.comment.comments).toHaveLength(2);
			expect(jira.issue?.fields.comment.comments[0]?.body).toBe("Same visible text");
			expect(jira.issue?.fields.comment.comments[1]?.body).toBe("Same visible text");
			expect((await second.getTicket("WCM-1"))?.comments?.map(comment => comment.text))
				.toEqual(["Same visible text", "Same visible text"]);
		} finally {
			await fs.rm(secondRoot, { recursive: true, force: true });
		}
	});

	test("keeps the Jira comment body exact and stores ownership in a non-rendered property", async () => {
		const configPath = path.join(root, "jira-cli.yml");
		await fs.writeFile(
			configPath,
			"server: https://jira.example.test\nlogin: ws@example.test\nauth_type: basic\n",
			"utf8",
		);
		let createdPayload: Record<string, unknown> | undefined;
		const request = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			if (init?.method === "POST") {
				createdPayload = JSON.parse(String(init.body)) as Record<string, unknown>;
				return new Response(JSON.stringify({ id: "10001" }), {
					status: 201,
					headers: { "Content-Type": "application/json" },
				});
			}
			const properties = Array.isArray(createdPayload?.properties) ? createdPayload.properties : [];
			return new Response(JSON.stringify({
				startAt: 0,
				maxResults: 100,
				total: 1,
				comments: [{ id: "10001", body: createdPayload?.body, properties }],
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		};
		const repositoryIdentity = resolveRepositoryIdentity({ root });
		const store = createJiraCommentPropertyStore(root, repositoryIdentity, "WCM", {
			configPath,
			apiToken: "test-token",
			request,
		});
		const correlationId = await store.resolve("d".repeat(64));
		const exactText = "  Exact visible comment  \n";

		expect(await store.create("WCM-1", exactText, correlationId)).toBe("10001");
		expect(createdPayload?.body).toBe(exactText);
		expect(String(createdPayload?.body)).not.toContain(correlationId);
		expect(await store.correlations("WCM-1")).toEqual([{
			correlationId,
			commentId: "10001",
			text: exactText,
		}]);
	});

	test("paginates comment properties through the reported Jira total", async () => {
		const configPath = path.join(root, "jira-cli.yml");
		await fs.writeFile(
			configPath,
			"server: https://jira.example.test\nlogin: ws@example.test\nauth_type: basic\n",
			"utf8",
		);
		const repositoryIdentity = resolveRepositoryIdentity({ root });
		const correlationId = createJiraCorrelation(repositoryIdentity, "WCM", "e".repeat(64)).id;
		const offsets: number[] = [];
		const request = async (input: string | URL | Request): Promise<Response> => {
			const startAt = Number(new URL(String(input)).searchParams.get("startAt"));
			offsets.push(startAt);
			const comments = startAt === 0
				? Array.from({ length: 100 }, (_, index) => ({
					id: String(index + 1),
					body: `Comment ${index + 1}`,
					properties: [],
				}))
				: [{
					id: "101",
					body: "Recovered beyond page one",
					properties: [{
						key: "ws.agency.comment-correlation",
						value: {
							schemaVersion: 1,
							correlationId,
							repositoryIdentity,
							project: "WCM",
						},
					}],
				}];
			return new Response(JSON.stringify({
				startAt,
				maxResults: 100,
				total: 101,
				comments,
			}), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		};
		const store = createJiraCommentPropertyStore(root, repositoryIdentity, "WCM", {
			configPath,
			apiToken: "test-token",
			request,
		});

		expect(await store.correlations("WCM-1")).toEqual([{
			correlationId,
			commentId: "101",
			text: "Recovered beyond page one",
		}]);
		expect(offsets).toEqual([0, 100]);
	});

	test("recovers an owned comment missing from jira-cli's bounded comment list", async () => {
		const jira = new FakeJiraCli(issue());
		const repositoryIdentity = resolveRepositoryIdentity({ root });
		const sourceCorrelationId = "older-comment";
		const correlationId = createJiraCorrelation(repositoryIdentity, "WCM", sourceCorrelationId).id;
		const adapter = createJiraAdapter(root, CONFIG, jira.run, {
			resolve: () => correlationId,
			correlations: async () => [{
				correlationId,
				commentId: "older-101",
				text: "  Older exact comment  \n",
			}],
			create: async () => {
				throw new Error("must not create a duplicate comment");
			},
		});

		expect(await adapter.addComment("WCM-1", "  Older exact comment  \n", sourceCorrelationId))
			.toEqual({ id: "older-101", version: jira.issue!.fields.updated });
		expect(jira.issue?.fields.comment.comments).toEqual([]);
	});

	test("scopes search and create markers to the repository contract", async () => {
		const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ws-ticket-sync-second-"));
		try {
			const sourceCorrelationId = "b".repeat(64);
			const jira = new FakeJiraCli();
			const firstAdapter = createJiraAdapter(
				root,
				CONFIG,
				jira.run,
				testCommentCorrelationStore(jira, resolveRepositoryIdentity({ root })),
			);
			await firstAdapter.createTicket({ title: "First repository" }, sourceCorrelationId);
			const firstMarker = jira.calls.find(call => call.args[1] === "create")?.args.join(" ");
			const firstExpected = createJiraCorrelation(
				resolveRepositoryIdentity({ root }),
				"WCM",
				sourceCorrelationId,
			);
			expect(firstMarker).toContain(firstExpected.marker);

			const secondAdapter = createJiraAdapter(
				secondRoot,
				CONFIG,
				jira.run,
				testCommentCorrelationStore(jira, resolveRepositoryIdentity({ root: secondRoot })),
			);
			expect(await secondAdapter.findTicketByCorrelation(sourceCorrelationId)).toBeNull();
			const secondLookup = jira.calls.filter(call => call.args[1] === "list").at(-1)?.args.join(" ");
			const secondExpected = createJiraCorrelation(
				resolveRepositoryIdentity({ root: secondRoot }),
				"WCM",
				sourceCorrelationId,
			);
			expect(secondLookup).toContain(secondExpected.marker);
			expect(secondExpected.token).not.toBe(firstExpected.token);
			expect(secondExpected.marker).not.toBe(firstExpected.marker);
		} finally {
			await fs.rm(secondRoot, { recursive: true, force: true });
		}
	});
});

describe("native synchronization boundary", () => {
	test("creates Jira only after the Local mutation and persists the returned key and update time", async () => {
		const jira = new FakeJiraCli();
		const events: string[] = [];
		const runner = async (command: string, args: string[], options?: RunOptions): Promise<RunResult> => {
			events.push(`jira:${args[1]}`);
			return jira.run(command, args, options);
		};
		const localId = "native-create";
		const localPath = path.join(root, "dev-docs", "tickets", "open", `${localId}.md`);
		const perform = async () => {
			events.push("local:create");
			await fs.writeFile(localPath, renderTicket({
				title: "Native create",
				body: "Create through the durable boundary.",
				criteria: ["Identity persists"],
				blockedBy: ["private-local-ticket"],
				share: "https://private.example/session",
				jiraFields: { type: "Task" },
			}), "utf8");
			return `Created ${localPath}`;
		};

		const message = await createSynchronizedOperation(
			runner,
			testCommentCorrelationStore(jira, resolveRepositoryIdentity({ root })),
		)({
			root,
			policy: policy(root),
			operation: operation("create", localId, {
				title: "Native create",
				description: "Create through the durable boundary.",
				acceptanceCriteria: "- [ ] Identity persists",
				status: "ready-for-agent",
				type: "Task",
			}, perform),
		});

		expect(events[0]).toBe("local:create");
		expect(message).toContain("Jira synchronized");
		const create = jira.calls.find(call => call.args[1] === "create");
		expect(create?.args).toContain("--raw");
		expect(create?.args.join(" ")).not.toContain("private.example");
		expect(create?.args.join(" ")).not.toContain("private-local-ticket");
		expect(create?.args.join(" ")).toMatch(/WS-CORRELATION-WSC1-[a-f0-9]{64}-[a-f0-9]{64}/);
		const state = await createTicketPersistence(root).readSyncState();
		expect(state.pendingOperations).toEqual([]);
		expect(state.repositoryIdentity).toBe(resolveRepositoryIdentity({ root }));
		expect(state.mappings[localId]?.jiraId).toBe("WCM-101");
		expect(state.mappings[localId]?.jiraVersion).toBe(jira.issue?.fields.updated);
		expect(state.mappings[localId]?.jiraVersion).not.toBe("10001");
	});

	test("resumes a create after the Local file write without invoking the Local mutation again", async () => {
		const jira = new FakeJiraCli();
		const localId = "native-local-crash";
		const localPath = path.join(root, "dev-docs", "tickets", "open", `${localId}.md`);
		const expectedLocal = renderTicket({
			title: "Native Local recovery",
			body: "Resume from the prepared phase.",
			jiraFields: { type: "Task" },
		});
		let localCalls = 0;
		const perform = async () => {
			localCalls += 1;
			await fs.writeFile(localPath, expectedLocal, "utf8");
			throw new Error("simulated crash after Local write");
		};
		const request = {
			root,
			policy: policy(root),
			operation: {
				...operation("create", localId, {
					title: "Native Local recovery",
					description: "Resume from the prepared phase.",
					status: "ready-for-agent",
					type: "Task",
				}, perform),
				isLocalApplied: async () => await fs.readFile(localPath, "utf8") === expectedLocal,
			},
		};

		const synchronize = createSynchronizedOperation(
			jira.run,
			testCommentCorrelationStore(jira, resolveRepositoryIdentity({ root })),
		);
		await expect(synchronize(request)).rejects.toThrow(
			"simulated crash after Local write",
		);
		expect(localCalls).toBe(1);
		expect(jira.calls.some(call => call.args[1] === "create")).toBe(false);
		expect((await createTicketPersistence(root).readSyncState()).pendingOperations[0]).toMatchObject({
			localId,
			action: "create",
			phase: "prepared",
			requiresLocalVerification: true,
		});

		const resumed = await synchronize(request);
		expect(resumed).toContain("Jira synchronized");
		expect(localCalls).toBe(1);
		expect(jira.calls.filter(call => call.args[1] === "create")).toHaveLength(1);
		expect((await createTicketPersistence(root).readSyncState()).pendingOperations).toEqual([]);
	});

	test("keeps the Local write and a durable pending intent when Jira is unavailable", async () => {
		const jira = new FakeJiraCli();
		jira.outage = true;
		const localId = "offline-create";
		const localPath = path.join(root, "dev-docs", "tickets", "open", `${localId}.md`);
		const message = await createSynchronizedOperation(
			jira.run,
			testCommentCorrelationStore(jira, resolveRepositoryIdentity({ root })),
		)({
			root,
			policy: policy(root),
			operation: operation("create", localId, { title: "Offline", description: "Still local", type: "Task" }, async () => {
				await fs.writeFile(localPath, renderTicket({ title: "Offline", body: "Still local", jiraFields: { type: "Task" } }), "utf8");
				return `Created ${localPath}`;
			}),
		});

		expect(message).toContain("Jira sync pending: 1 operation(s)");
		expect(await fs.readFile(localPath, "utf8")).toContain("Still local");
		const state = await createTicketPersistence(root).readSyncState();
		expect(state.pendingOperations).toHaveLength(1);
		expect(state.pendingOperations[0]).toMatchObject({ localId, action: "create" });
		expect(state.pendingOperations[0]?.correlationId).toMatch(/^wsc1:[a-f0-9]{64}:[a-f0-9]{64}$/);
		expect(state.pendingOperations[0]?.requestCorrelationId).toMatch(/^[a-f0-9]{64}$/);
		const backfill = planBackfill(
			await createTicketPersistence(root).readLocalStore(),
			state,
			CONFIG,
			{ root },
		);
		expect(backfill.unmapped[0]?.correlationId).toBe(state.pendingOperations[0]?.correlationId);
		expect(backfill.unmapped[0]?.previousCorrelationId).toBeUndefined();
		expect(jira.calls.some(call => call.args[1] === "create")).toBe(false);
	});

	test("retries durable update and comment intents before the requested status mutation", async () => {
		const jira = new FakeJiraCli(issue());
		const localId = "pending-retry";
		const openPath = path.join(root, "dev-docs", "tickets", "open", `${localId}.md`);
		const localComments = [{ id: "local-comment", text: "Recovered comment" }];
		await fs.writeFile(openPath, renderTicket({
			title: "Recovered title",
			body: "Body",
			jiraFields: { type: "Task", priority: "Medium", comments: localComments },
		}), "utf8");
		await createTicketPersistence(root).persistSyncState({
			mappings: {
				[localId]: {
					jiraId: "WCM-1",
					jiraVersion: "2026-09-03T00:00:00.000+0000",
					fieldHashes: {
						title: hashField("Baseline"),
						description: hashField("Body"),
						status: hashField("ready-for-agent"),
						priority: hashField("Medium"),
						type: hashField("Task"),
						comments: hashField([]),
					},
				},
			},
			pendingOperations: [
				{
					correlationId: hashField({ localId, action: "update", payload: { title: "Recovered title" } }),
					localId,
					action: "update",
					payload: { title: "Recovered title" },
				},
				{
					correlationId: hashField({ localId, action: "comment", payload: { text: "Recovered comment" } }),
					localId,
					action: "comment",
					payload: { text: "Recovered comment" },
				},
			],
		});
		const donePath = path.join(root, "dev-docs", "tickets", "done", `${localId}.md`);

		await createSynchronizedOperation(
			jira.run,
			testCommentCorrelationStore(jira, resolveRepositoryIdentity({ root })),
		)({
			root,
			policy: policy(root),
			operation: operation("status", localId, { status: "done" }, async effective => {
				const status = effective?.status === "done" ? "done" : "ready-for-agent";
				await fs.writeFile(openPath, updateTicketText(await fs.readFile(openPath, "utf8"), { status }), "utf8");
				await fs.rename(openPath, donePath);
				return `Moved ${openPath} -> ${donePath}`;
			}),
		});

		expect(jira.calls.some(call => call.args[1] === "edit")).toBe(true);
		expect(jira.commentPropertyCalls).toHaveLength(1);
		expect(jira.calls.some(call => call.args[1] === "move")).toBe(true);
		const state = await createTicketPersistence(root).readSyncState();
		expect(state.pendingOperations).toEqual([]);
		const local = (await createTicketPersistence(root).readLocalStore())[localId];
		expect(local?.comments).toEqual([
			{ id: "10001", text: "Recovered comment", author: "WS Bot", createdAt: "2026-09-03T00:00:02.000+0000" },
		]);
		expect(local?.status).toBe("done");
	});


	test("recovers a remotely accepted comment when the returned identity was not journaled", async () => {
		const jira = new FakeJiraCli(issue());
		const localId = "comment-result-crash";
		const localPath = path.join(root, "dev-docs", "tickets", "open", `${localId}.md`);
		await fs.writeFile(localPath, renderTicket({
			title: "Comment recovery",
			body: "Body",
			jiraFields: { type: "Task", priority: "Medium", comments: [] },
		}), "utf8");
		const persistence = createTicketPersistence(root);
		await persistence.persistSyncState({
			mappings: {
				[localId]: {
					jiraId: "WCM-1",
					jiraVersion: "2026-09-03T00:00:00.000+0000",
					fieldHashes: {
						title: hashField("Baseline"),
						description: hashField("Body"),
						status: hashField("ready-for-agent"),
						priority: hashField("Medium"),
						type: hashField("Task"),
						comments: hashField([]),
					},
				},
			},
			pendingOperations: [],
		});
		let interruptAfterComment = true;
		const baseCommentStore = testCommentCorrelationStore(jira, resolveRepositoryIdentity({ root }));
		const interruptedCommentStore: JiraCommentCorrelationStore = {
			...baseCommentStore,
			async create(issueId, text, correlationId) {
				const id = await baseCommentStore.create(issueId, text, correlationId);
				if (interruptAfterComment) {
					interruptAfterComment = false;
					throw new Error("connection dropped after Jira accepted the comment");
				}
				return id;
			},
		};
		const adapter = createJiraAdapter(root, CONFIG, jira.run, interruptedCommentStore);

		const interrupted = await runTrackerOperation({
			config: CONFIG,
			localStore: await persistence.readLocalStore(),
			syncState: await persistence.readSyncState(),
			operation: { action: "comment", intentId: "comment-result-crash-1", localId, payload: { text: "Accepted once" } },
			jiraAdapter: adapter,
			persistence,
		});
		expect(interrupted.readiness.ready).toBe(true);
		const pending = (await persistence.readSyncState()).pendingOperations[0];
		expect(pending).toMatchObject({
			action: "comment",
			phase: "local_applied",
		});
		expect(pending?.returnedId).toBeUndefined();
		expect(jira.commentPropertyCalls).toHaveLength(1);

		const resumed = await runTrackerOperation({
			config: CONFIG,
			localStore: await persistence.readLocalStore(),
			syncState: await persistence.readSyncState(),
			operation: null,
			jiraAdapter: adapter,
			persistence,
		});
		expect(resumed.nextSyncState.pendingOperations).toEqual([]);
		expect(jira.commentPropertyCalls).toHaveLength(1);
		expect(jira.issue?.fields.comment.comments).toHaveLength(1);
		expect(jira.issue?.fields.comment.comments[0]?.body).toBe("Accepted once");
		expect((await adapter.getTicket("WCM-1"))?.comments?.[0]?.text).toBe("Accepted once");
		expect((await persistence.readLocalStore())[localId]?.comments?.[0]?.text).toBe("Accepted once");
	});
	test("blocks a same-field conflict before the requested Local mutation", async () => {
		const jira = new FakeJiraCli(issue({ summary: "Remote title" }));
		const localId = "conflict";
		const localPath = path.join(root, "dev-docs", "tickets", "open", `${localId}.md`);
		await fs.writeFile(localPath, renderTicket({
			title: "Local title",
			body: "Body",
			jiraFields: { type: "Task", priority: "Medium", comments: [] },
		}), "utf8");
		await createTicketPersistence(root).persistSyncState({
			mappings: {
				[localId]: {
					jiraId: "WCM-1",
					jiraVersion: "2026-09-02T00:00:00.000+0000",
					fieldHashes: {
						title: hashField("Baseline"),
						description: hashField("Body"),
						status: hashField("ready-for-agent"),
						priority: hashField("Medium"),
						type: hashField("Task"),
						comments: hashField([]),
					},
				},
			},
			pendingOperations: [],
		});
		let performed = false;

		const pending = createSynchronizedOperation(
			jira.run,
			testCommentCorrelationStore(jira, resolveRepositoryIdentity({ root })),
		)({
			root,
			policy: policy(root),
			operation: operation("status", localId, { status: "done" }, async () => {
				performed = true;
				return "should not run";
			}),
		});

		expect(pending).rejects.toThrow("Sync blocked: Conflict on title");
		expect(performed).toBe(false);
		expect(jira.calls.some(call => ["edit", "move", "comment", "create"].includes(call.args[1] ?? ""))).toBe(false);
		expect(await fs.readFile(localPath, "utf8")).toContain("# Local title");
	});
});
