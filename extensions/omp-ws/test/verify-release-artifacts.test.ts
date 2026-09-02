import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { generate } from "../scripts/generate";
import {
	assertInstalledSurface,
	buildVerificationSteps,
	probeClaudeRuntime,
	probeOmpRuntime,
	REMOVED_INSTALLED_ASSETS,
	REQUIRED_INSTALLED_ASSETS,
	verificationPaths,
	verifyReleaseArtifacts,
	verifySharedGeneratedSurface,
} from "../scripts/verify-release-artifacts.mjs";

const temporaryRoots: string[] = [];
const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const MARKETPLACE_COMMIT = "1111111111111111111111111111111111111111";

async function temporaryRoot(prefix: string): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	temporaryRoots.push(root);
	return root;
}

function digest(content: string | Uint8Array): string {
	return createHash("sha256").update(content).digest("hex");
}

async function parityFixture() {
	const root = await temporaryRoot("ws-parity-fixture-");
	const claudeRoot = path.join(root, "claude");
	const nativeRoot = path.join(root, "native");
	for (const surface of ["commands", "skills", "agents", "rules"]) {
		await fs.mkdir(path.join(claudeRoot, surface), { recursive: true });
		await fs.mkdir(path.join(nativeRoot, surface), { recursive: true });
	}
	const source = "---\ndescription: Setup\nallowed-tools: Read\n---\nSource body\n";
	const generated = "---\ndescription: Setup\n---\nSource body\n";
	await fs.writeFile(path.join(claudeRoot, "commands", "ws-setup.md"), source);
	await fs.writeFile(path.join(nativeRoot, "commands", "ws-setup.md"), generated);
	const manifest = {
		schemaVersion: 1,
		marketplaceCommit: MARKETPLACE_COMMIT,
		files: [{
			surface: "commands",
			source: "commands/ws-setup.md",
			target: "commands/ws-setup.md",
			sourceSha256: digest(source),
			generatedSha256: digest(generated),
		}],
	};
	await fs.writeFile(path.join(nativeRoot, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
	return { claudeRoot, nativeRoot, manifest };
}

async function ompRuntimeFixture() {
	const root = await temporaryRoot("ws-omp-runtime-");
	await fs.mkdir(path.join(root, "dist"), { recursive: true });
	await fs.mkdir(path.join(root, "rules"), { recursive: true });
	for (const rule of ["omp-edge-discipline.md", "ws-commit-format.md", "ws-generated-files.md", "ws-guard-git.md"]) {
		await fs.writeFile(path.join(root, "rules", rule), `${rule}\n`);
	}
	await fs.writeFile(
		path.join(root, "dist", "index.js"),
		[
			"export default function probe(pi) {",
			'  for (const event of ["session.compacting", "session_start", "session_start", "session_stop", "session_stop", "tool_call", "tool_call"]) pi.on(event, () => {});',
			'  for (const name of ["ws_adr", "ws_changelog", "ws_ticket"]) pi.registerTool({ name, execute() {} });',
			"}",
			"",
		].join("\n"),
	);
	return root;
}

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});


async function fakeReleaseInputs() {
	const root = await temporaryRoot("ws-verifier-inputs-");
	const marketplaceRoot = path.join(root, "marketplace");
	const tarballPath = path.join(root, "wsagency-omp-ws-0.7.0.tgz");
	await fs.mkdir(path.join(marketplaceRoot, ".claude-plugin"), { recursive: true });
	await fs.writeFile(
		path.join(marketplaceRoot, ".claude-plugin", "marketplace.json"),
		`${JSON.stringify({ plugins: [{ name: "ws", version: "5.0.0" }] }, null, 2)}\n`,
	);
	const tarballContent = "retained artifact fixture\n";
	await fs.writeFile(tarballPath, tarballContent);

	return {
		marketplaceRoot,
		tarballPath,
		options: {
			marketplaceRoot,
			tarballPath,
			expectedMarketplaceVersion: "5.0.0",
			expectedPackageName: "@wsagency/omp-ws",
			expectedPackageVersion: "0.7.0",
			expectedMarketplaceCommit: MARKETPLACE_COMMIT,
			expectedTarballSha256: createHash("sha256").update(tarballContent).digest("hex"),
		},
	};
}

describe("release verification command contract", () => {
	test("uses separate isolated homes and the retained tarball without publish or Jira commands", () => {
		process.env.WS_VERIFIER_HOST_SECRET = "must-not-leak";
		try {
			const paths = verificationPaths("/isolated/release-verification");
			const steps = buildVerificationSteps({ marketplaceRoot: "/release/marketplace", tarballPath: "/release/package.tgz", paths });
			expect(steps.map(step => step.label)).toEqual([
				"claude-marketplace-add",
				"claude-plugin-install",
				"claude-plugin-details",
				"npm-tarball-install",
				"omp-plugin-link",
				"omp-plugin-list",
				"omp-plugin-doctor",
			]);
			const rendered = steps.map(step => [step.command, ...step.args].join(" ")).join("\n");
			expect(rendered).toContain("claude plugin marketplace add /release/marketplace");
			expect(rendered).toContain("npm install --ignore-scripts --no-audit --no-fund --prefix /isolated/release-verification/omp-package /release/package.tgz");
			expect(rendered).toContain("omp plugin link /isolated/release-verification/omp-package/node_modules/@wsagency/omp-ws");
			expect(rendered).not.toContain("npm publish");
			expect(rendered.toLowerCase()).not.toContain("jira ");

			const claude = steps.find(step => step.label === "claude-plugin-install")!;
			const omp = steps.find(step => step.label === "omp-plugin-list")!;
			expect(claude.env.HOME).toBe(paths.claudeHome);
			expect(claude.env.CLAUDE_CONFIG_DIR).toBe(paths.claudeConfig);
			expect(omp.env.HOME).toBe(paths.ompHome);
			expect(omp.env.CLAUDE_CONFIG_DIR).toBeUndefined();
			expect(omp.env.OMP_PROFILE).toBe("release-verification");
			for (const step of steps) expect(step.env.WS_VERIFIER_HOST_SECRET).toBeUndefined();
		} finally {
			delete process.env.WS_VERIFIER_HOST_SECRET;
		}
	});
});

describe("installed surface inspection", () => {
	test("requires command, workers, schema, contract, fixtures and removed-surface absence", async () => {
		const root = await temporaryRoot("ws-installed-surface-");
		for (const relative of REQUIRED_INSTALLED_ASSETS) {
			const target = path.join(root, relative);
			await fs.mkdir(path.dirname(target), { recursive: true });
			await fs.writeFile(target, `${relative}\n`);
		}
		const inspected = await assertInstalledSurface(root);
		expect(inspected.required).toEqual([...REQUIRED_INSTALLED_ASSETS]);
		expect(inspected.removed).toEqual([...REMOVED_INSTALLED_ASSETS]);

		const removed = path.join(root, REMOVED_INSTALLED_ASSETS[0]);
		await fs.mkdir(path.dirname(removed), { recursive: true });
		await fs.writeFile(removed, "retired\n");
		await expect(assertInstalledSurface(root)).rejects.toThrow("removed surface");
	});
});

describe("installed generated surface parity", () => {
	test("accepts the exact Claude source and native generated checksums for one immutable commit", async () => {
		const fixture = await parityFixture();
		const evidence = await verifySharedGeneratedSurface(fixture.claudeRoot, fixture.nativeRoot, MARKETPLACE_COMMIT);
		expect(evidence).toMatchObject({
			manifest: "release-manifest.json",
			marketplaceCommit: MARKETPLACE_COMMIT,
			files: 1,
			bySurface: { commands: 1, skills: 0, agents: 0, rules: 0 },
		});
		expect(evidence.manifestSha256).toHaveLength(64);
	});

	test("rejects an artifact built for a different marketplace commit", async () => {
		const fixture = await parityFixture();
		await expect(
			verifySharedGeneratedSurface(fixture.claudeRoot, fixture.nativeRoot, "2222222222222222222222222222222222222222"),
		).rejects.toThrow("Native artifact marketplace commit mismatch");
	});

	test("rejects an altered installed native asset", async () => {
		const fixture = await parityFixture();
		await fs.writeFile(path.join(fixture.nativeRoot, "commands", "ws-setup.md"), "altered native command\n");
		await expect(
			verifySharedGeneratedSurface(fixture.claudeRoot, fixture.nativeRoot, MARKETPLACE_COMMIT),
		).rejects.toThrow("Installed native asset checksum mismatch");
	});

	test("rejects Claude/native source parity drift", async () => {
		const fixture = await parityFixture();
		await fs.writeFile(path.join(fixture.claudeRoot, "commands", "ws-setup.md"), "drifted marketplace command\n");
		await expect(
			verifySharedGeneratedSurface(fixture.claudeRoot, fixture.nativeRoot, MARKETPLACE_COMMIT),
		).rejects.toThrow("Claude/native parity drift");
	});
});

describe("isolated runtime delivery probes", () => {
	test("derives Claude hook evidence from the installed plugin assets", async () => {
		const root = await temporaryRoot("ws-claude-runtime-");
		await fs.cp(path.join(REPO_ROOT, "plugins", "ws", ".claude-plugin"), path.join(root, ".claude-plugin"), { recursive: true });
		await fs.cp(path.join(REPO_ROOT, "plugins", "ws", "hooks"), path.join(root, "hooks"), { recursive: true });
		const evidence = await probeClaudeRuntime(root);
		expect(evidence.plugin).toBe("ws");
		expect(evidence.registrations).toHaveLength(5);
		expect(evidence.assets.map(asset => asset.path)).toContain("hooks/docs-policy.mjs");
		expect(evidence.assets.every(asset => asset.sha256.length === 64)).toBe(true);
	});

	test("rejects missing Claude runtime delivery", async () => {
		const root = await temporaryRoot("ws-claude-runtime-missing-");
		await fs.cp(path.join(REPO_ROOT, "plugins", "ws", ".claude-plugin"), path.join(root, ".claude-plugin"), { recursive: true });
		await fs.cp(path.join(REPO_ROOT, "plugins", "ws", "hooks"), path.join(root, "hooks"), { recursive: true });
		await fs.rm(path.join(root, "hooks", "docs-policy.mjs"));
		await expect(probeClaudeRuntime(root)).rejects.toThrow("Claude runtime delivery is missing asset");
	});

	test("derives omp hook, tool, and rule evidence without invoking handlers", async () => {
		const root = await ompRuntimeFixture();
		const evidence = await probeOmpRuntime(root);
		expect(evidence.hookEvents).toEqual([
			"session.compacting",
			"session_start",
			"session_start",
			"session_stop",
			"session_stop",
			"tool_call",
			"tool_call",
		]);
		expect(evidence.tools).toEqual(["ws_adr", "ws_changelog", "ws_ticket"]);
		expect(evidence.rules).toEqual(["omp-edge-discipline.md", "ws-commit-format.md", "ws-generated-files.md", "ws-guard-git.md"]);
	});

	test("rejects missing omp runtime delivery", async () => {
		const root = await ompRuntimeFixture();
		await fs.rm(path.join(root, "rules", "ws-guard-git.md"));
		await expect(probeOmpRuntime(root)).rejects.toThrow("omp runtime rule delivery mismatch");
	});
});

describe("release verifier orchestration", () => {
	function successfulCommandRunner(overrides: Record<string, string> = {}) {
		return async (step: { label: string; env: Record<string, string> }) => {
			const outputs: Record<string, string> = {
				"git-status": "\n",
				"git-commit": `${MARKETPLACE_COMMIT}\n`,
				"claude-plugin-details": "ws\n  Installed plugin\n\nComponent inventory\n",
				"omp-plugin-list": JSON.stringify({
					npm: [{ name: "@wsagency/omp-ws", version: "0.7.0" }],
					marketplace: [],
				}),
				"omp-plugin-doctor": JSON.stringify([
					{ name: "package_manifest", status: "warning", message: "Not created yet" },
					{ name: "plugin:@wsagency/omp-ws", status: "ok" },
				]),
			};
			return { status: 0, stdout: overrides[step.label] ?? outputs[step.label] ?? `${step.label}\n`, stderr: "" };
		};
	}

	function installedClaude(root: string, overrides = {}) {
		return {
			root,
			version: "5.0.0",
			gitCommitSha: MARKETPLACE_COMMIT,
			...overrides,
		};
	}

	test("runs every identity, parity, and runtime gate and always removes its temporary state", async () => {
		const inputs = await fakeReleaseInputs();
		const calls: Array<{ label: string; env: Record<string, string> }> = [];
		const inspected: string[] = [];
		const parityRoots: string[] = [];
		const runtimeRoots: string[] = [];
		let verifierRoot = "";
		const claudeRoot = await temporaryRoot("fake-claude-root-");
		const baseRunner = successfulCommandRunner();
		const result = await verifyReleaseArtifacts(inputs.options, {
			runCommand: async step => {
				calls.push({ label: step.label, env: step.env });
				if (step.env?.HOME && step.label.startsWith("claude-")) verifierRoot ||= path.dirname(step.env.HOME);
				return baseRunner(step);
			},
			resolveClaudePluginInstallation: async () => installedClaude(claudeRoot),
			inspectSurface: async root => {
				inspected.push(root);
				await fs.mkdir(root, { recursive: true });
				await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "@wsagency/omp-ws", version: "0.7.0" }));
				return { root, required: [...REQUIRED_INSTALLED_ASSETS], removed: [...REMOVED_INSTALLED_ASSETS] };
			},
			verifySharedGeneratedSurface: async (claude, native) => {
				parityRoots.push(claude, native);
				return {
					manifest: "release-manifest.json",
					manifestSha256: "2".repeat(64),
					marketplaceCommit: MARKETPLACE_COMMIT,
					files: 55,
					bySurface: { commands: 7, skills: 30, agents: 14, rules: 4 },
				};
			},
			probeClaudeRuntime: async root => {
				runtimeRoots.push(root);
				return {
					plugin: "ws",
					hookManifestSha256: "3".repeat(64),
					registrations: [{ event: "SessionStart", matcher: "startup", asset: "hooks/session-start-dashboard.mjs" }],
					assets: [{ path: "hooks/session-start-dashboard.mjs", sha256: "4".repeat(64) }],
				};
			},
			probeOmpRuntime: async root => {
				runtimeRoots.push(root);
				return {
					extension: "dist/index.js",
					extensionSha256: "5".repeat(64),
					hookEvents: ["session_start"],
					tools: ["ws_ticket"],
					rules: ["ws-guard-git.md"],
				};
			},
		});
		expect(calls.map(call => call.label)).toEqual([
			"git-status",
			"git-commit",
			"claude-marketplace-add",
			"claude-plugin-install",
			"claude-plugin-details",
			"npm-tarball-install",
			"omp-plugin-link",
			"omp-plugin-list",
			"omp-plugin-doctor",
		]);
		expect(inspected).toEqual([claudeRoot, expect.stringContaining("/omp-package/node_modules/@wsagency/omp-ws")]);
		expect(parityRoots).toEqual(inspected);
		expect(runtimeRoots).toEqual(inspected);
		expect(result.parity.marketplaceCommit).toBe(MARKETPLACE_COMMIT);
		expect(result.claude.runtime.plugin).toBe("ws");
		expect(result.omp.runtime.linkedPlugin).toMatchObject({ name: "@wsagency/omp-ws", version: "0.7.0" });
		expect(result.omp.runtime.doctor).toContainEqual({ name: "plugin:@wsagency/omp-ws", status: "ok" });
		expect(result.identities).toMatchObject({
			marketplaceVersion: "5.0.0",
			packageName: "@wsagency/omp-ws",
			packageVersion: "0.7.0",
			marketplaceCommit: MARKETPLACE_COMMIT,
		});
		await expect(fs.access(verifierRoot)).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("cleans temporary homes after a command failure", async () => {
		const inputs = await fakeReleaseInputs();
		let verifierRoot = "";
		await expect(verifyReleaseArtifacts(inputs.options, {
			runCommand: async step => {
				if (step.label === "git-status" || step.label === "git-commit") return successfulCommandRunner()(step);
				verifierRoot = path.dirname(step.env.HOME);
				throw new Error("injected command failure");
			},
		})).rejects.toThrow("injected command failure");
		await expect(fs.access(verifierRoot)).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("blocks any dirty marketplace repository state", async () => {
		const inputs = await fakeReleaseInputs();
		await expect(verifyReleaseArtifacts(inputs.options, {
			runCommand: successfulCommandRunner({ "git-status": "?? unrelated-release-input\n" }),
		})).rejects.toThrow("Marketplace repository has uncommitted changes");
	});

	test("blocks marketplace commit mismatch", async () => {
		const inputs = await fakeReleaseInputs();
		await expect(verifyReleaseArtifacts(inputs.options, {
			runCommand: successfulCommandRunner({ "git-commit": "wrongcommit\n" }),
		})).rejects.toThrow("Marketplace commit mismatch");
	});

	test("blocks retained tarball substitution via SHA256 mismatch", async () => {
		const inputs = await fakeReleaseInputs();
		await expect(verifyReleaseArtifacts(
			{ ...inputs.options, expectedTarballSha256: "wronghash" },
			{ runCommand: successfulCommandRunner() },
		)).rejects.toThrow("Tarball SHA256 mismatch");
	});

	test("blocks marketplace manifest version mismatch before installation", async () => {
		const inputs = await fakeReleaseInputs();
		await fs.writeFile(
			path.join(inputs.marketplaceRoot, ".claude-plugin", "marketplace.json"),
			`${JSON.stringify({ plugins: [{ name: "ws", version: "5.0.1" }] }, null, 2)}\n`,
		);
		await expect(verifyReleaseArtifacts(inputs.options)).rejects.toThrow("Marketplace manifest version mismatch");
	});

	test("blocks Claude installation version mismatch", async () => {
		const inputs = await fakeReleaseInputs();
		const claudeRoot = await temporaryRoot("fake-claude-root-");
		await expect(verifyReleaseArtifacts(inputs.options, {
			runCommand: successfulCommandRunner(),
			resolveClaudePluginInstallation: async () => installedClaude(claudeRoot, { version: "4.9.0" }),
		})).rejects.toThrow("Claude marketplace version mismatch");
	});

	test("blocks Claude installation commit mismatch", async () => {
		const inputs = await fakeReleaseInputs();
		const claudeRoot = await temporaryRoot("fake-claude-root-");
		await expect(verifyReleaseArtifacts(inputs.options, {
			runCommand: successfulCommandRunner(),
			resolveClaudePluginInstallation: async () => installedClaude(claudeRoot, { gitCommitSha: "wrongcommit" }),
		})).rejects.toThrow("Claude marketplace commit mismatch");
	});

	test("blocks omp package version mismatch", async () => {
		const inputs = await fakeReleaseInputs();
		const claudeRoot = await temporaryRoot("fake-claude-root-");
		await expect(verifyReleaseArtifacts(inputs.options, {
			runCommand: successfulCommandRunner({
				"omp-plugin-list": JSON.stringify({ npm: [{ name: "@wsagency/omp-ws", version: "0.8.0" }] }),
			}),
			resolveClaudePluginInstallation: async () => installedClaude(claudeRoot),
		})).rejects.toThrow("omp package version mismatch");
	});

	test("blocks unhealthy omp plugin doctor status", async () => {
		const inputs = await fakeReleaseInputs();
		const claudeRoot = await temporaryRoot("fake-claude-root-");
		await expect(verifyReleaseArtifacts(inputs.options, {
			runCommand: successfulCommandRunner({
				"omp-plugin-doctor": JSON.stringify([{ name: "test", status: "error" }]),
			}),
			resolveClaudePluginInstallation: async () => installedClaude(claudeRoot),
		})).rejects.toThrow("omp plugin doctor reports unhealthy status: test");
	});

	test("blocks unexpected omp plugin doctor warnings", async () => {
		const inputs = await fakeReleaseInputs();
		const claudeRoot = await temporaryRoot("fake-claude-root-");
		await expect(verifyReleaseArtifacts(inputs.options, {
			runCommand: successfulCommandRunner({
				"omp-plugin-doctor": JSON.stringify([{ name: "plugin:@wsagency/omp-ws", status: "warning", message: "Version drift" }]),
			}),
			resolveClaudePluginInstallation: async () => installedClaude(claudeRoot),
		})).rejects.toThrow("omp plugin doctor reports unhealthy status: plugin:@wsagency/omp-ws");
	});
});

test("native generation packages the public manifest contract and released fixtures byte-identically", async () => {
	const outRoot = await temporaryRoot("ws-verifier-generated-");
	const sourceRoot = path.join(REPO_ROOT, "plugins", "ws");
	await generate(sourceRoot, outRoot, { marketplaceCommit: MARKETPLACE_COMMIT });
	for (const relative of [
		"manifest-contract.mjs",
		"manifest-contract.d.mts",
		"manifest-contract.test.mjs",
		path.join("fixtures", "released-repositories", `${["ws", "init"].join("-")}-only`, "expected", "outcome.json"),
		"fixtures/released-repositories/local/repository/dev-docs/agents/issue-tracker.md",
		"fixtures/released-repositories/local-jira/input-links.json",
		"fixtures/released-repositories/documentation-initialized/expected/config.yaml",
		"fixtures/released-repositories/customized-combined/expected/config.yaml",
		"fixtures/released-repositories/unsupported-custom-tracker/expected/config.absent",
	]) {
		const source = path.join(sourceRoot, "skills", "ws-project-bootstrap", relative);
		const generated = path.join(outRoot, "skills", "ws-project-bootstrap", relative);
		expect(await fs.readFile(generated)).toEqual(await fs.readFile(source));
	}
});
