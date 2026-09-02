import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { generate } from "../scripts/generate";
import {
	assertInstalledSurface,
	buildVerificationSteps,
	REMOVED_INSTALLED_ASSETS,
	REQUIRED_INSTALLED_ASSETS,
	verificationPaths,
	verifyReleaseArtifacts,
} from "../scripts/verify-release-artifacts.mjs";

const temporaryRoots: string[] = [];
const REPO_ROOT = path.resolve(import.meta.dir, "../../..");

async function temporaryRoot(prefix: string): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	temporaryRoots.push(root);
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
	await fs.writeFile(path.join(marketplaceRoot, ".claude-plugin", "marketplace.json"), "{}\n");
	await fs.writeFile(tarballPath, "retained artifact fixture\n");
	return { marketplaceRoot, tarballPath };
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

describe("release verifier orchestration", () => {
	test("runs every gate with fakes and always removes its temporary state", async () => {
		const inputs = await fakeReleaseInputs();
		const calls: Array<{ label: string; env: Record<string, string> }> = [];
		const inspected: string[] = [];
		const exercised: string[] = [];
		let verifierRoot = "";
		const result = await verifyReleaseArtifacts(inputs, {
			runCommand: async step => {
				calls.push({ label: step.label, env: step.env });
				verifierRoot ||= path.dirname(step.env.HOME);
				return { status: 0, stdout: `${step.label}\n`, stderr: "" };
			},
			resolveClaudePluginRoot: async () => "/installed/claude/ws",
			inspectSurface: async root => {
				inspected.push(root);
				return { root, required: [...REQUIRED_INSTALLED_ASSETS], removed: [...REMOVED_INSTALLED_ASSETS] };
			},
			exerciseTransaction: async (_root, _workspace, label) => {
				exercised.push(label);
				return { label, plannedItems: 12, operations: 8, aligned: true };
			},
		});
		expect(calls.map(call => call.label)).toEqual(result.commands);
		expect(inspected).toEqual(["/installed/claude/ws", expect.stringContaining("/omp-package/node_modules/@wsagency/omp-ws")]);
		expect(exercised.sort()).toEqual(["claude", "omp"]);
		expect(result.claude.migration.aligned).toBe(true);
		await expect(fs.access(verifierRoot)).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("cleans temporary homes after a command failure", async () => {
		const inputs = await fakeReleaseInputs();
		let verifierRoot = "";
		await expect(verifyReleaseArtifacts(inputs, {
			runCommand: async step => {
				verifierRoot = path.dirname(step.env.HOME);
				throw new Error("injected command failure");
			},
		})).rejects.toThrow("injected command failure");
		await expect(fs.access(verifierRoot)).rejects.toMatchObject({ code: "ENOENT" });
	});
});

test("native generation packages the public manifest contract and released fixtures byte-identically", async () => {
	const outRoot = await temporaryRoot("ws-verifier-generated-");
	const sourceRoot = path.join(REPO_ROOT, "plugins", "ws");
	await generate(sourceRoot, outRoot);
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
