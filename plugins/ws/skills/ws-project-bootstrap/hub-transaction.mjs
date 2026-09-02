import fs from "node:fs/promises";
import path from "node:path";
import { realpath } from "node:fs/promises";
import { discoverStandaloneRepository, runSetupTransaction, RECOMMENDED_LOCAL_CHOICES, CANONICAL_CONFIG_YAML } from "./transaction.mjs";
import { parseCanonicalConfigYaml, serializeCanonicalConfig } from "./config.mjs";
import { createHash } from "node:crypto";

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function transactionFailed(transaction) {
	return transaction.report.startsWith("Transaction stopped")
		|| transaction.report.includes("verification failed")
		|| transaction.report.includes("Authorization is stale");
}

export function parseProjectYaml(content) {
	const repos = [];
	const lines = content.split('\n');
	let currentRepo = null;
	let inRepos = false;

	for (let line of lines) {
		if (line.trim().startsWith('repos:')) {
			inRepos = true;
			continue;
		}
		if (!inRepos) continue;

		if (line.trim().startsWith('- ')) {
			if (currentRepo) repos.push(currentRepo);
			currentRepo = {};
			line = line.replace('-', ' ');
		}

		if (currentRepo) {
			const match = line.match(/^\s*([a-z_]+):\s*(.+?)\s*$/);
			if (match) {
				let val = match[2];
				if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
					val = val.slice(1, -1);
				}
				currentRepo[match[1]] = val;
			}
		}
	}
	if (currentRepo) repos.push(currentRepo);
	return repos;
}

export function mergeConfig(hubConfigStr, explicitConfigStr) {
	if (!explicitConfigStr && !hubConfigStr) return CANONICAL_CONFIG_YAML;
	let hubConfig;
	try { hubConfig = parseCanonicalConfigYaml(hubConfigStr || CANONICAL_CONFIG_YAML); } catch { return explicitConfigStr || hubConfigStr; }
	let explicitConfig;
	if (explicitConfigStr) {
		try { explicitConfig = parseCanonicalConfigYaml(explicitConfigStr); } catch { return explicitConfigStr; }
	} else {
		explicitConfig = {};
	}

	const merged = { ...hubConfig, ...explicitConfig };
	for (const key of Object.keys(merged)) {
		if (hubConfig[key] && explicitConfig[key] && typeof hubConfig[key] === 'object' && !Array.isArray(hubConfig[key])) {
			merged[key] = { ...hubConfig[key], ...explicitConfig[key] };
		}
	}
	try {
		return serializeCanonicalConfig(merged);
	} catch {
		return explicitConfigStr || hubConfigStr || CANONICAL_CONFIG_YAML;
	}
}

export async function discoverHubTransaction(root, machine) {
	const absoluteRoot = await realpath(path.resolve(root));
	const hubDiscovery = await discoverStandaloneRepository(absoluteRoot, machine);
	
	let projectYaml;
	try { projectYaml = await fs.readFile(path.join(absoluteRoot, "project.yaml"), "utf8"); } catch {}

	let registryError = null;
	const working = [];
	const excluded = [];
	
	if (!projectYaml) {
		registryError = "Missing project.yaml in hub root.";
	} else {
		try {
			const repos = parseProjectYaml(projectYaml);
			for (const repo of repos) {
				if (repo.type !== 'working') {
					excluded.push({ name: repo.name, type: repo.type || 'unknown', reason: `Explicitly excluded input/output repository (type: ${repo.type || 'unknown'}).` });
					continue;
				}
				const repoAbsPath = path.resolve(absoluteRoot, repo.path);
				let isPresent = false;
				try {
					const stat = await fs.stat(repoAbsPath);
					isPresent = stat.isDirectory();
				} catch {
					isPresent = false;
				}
				if (!isPresent) {
					excluded.push({ name: repo.name, type: 'working', reason: "Repository path is not locally present." });
					continue;
				}
				const repoDiscovery = await discoverStandaloneRepository(repoAbsPath, machine);
				// A hub sub-repository should have projectShape: "hub_subrepository"
				repoDiscovery.projectShape = "hub_subrepository";
				// Store the repo name for easy correlation
				repoDiscovery.name = repo.name;
				working.push(repoDiscovery);
			}
		} catch (e) {
			registryError = `Failed to parse project.yaml: ${e.message}`;
		}
	}

	return {
		root: absoluteRoot,
		machine,
		hub: hubDiscovery,
		working,
		excluded,
		registryError
	};
}

export async function runHubTransaction(request) {
	const choices = request.choices || {};
	const removed = new Set(choices.removedRepositories || []);
	const injectedFailureRoot = request.injectedFailure?.targetRoot
		? await realpath(path.resolve(request.injectedFailure.targetRoot))
		: null;
	const injectedFailureFor = root => injectedFailureRoot === root ? request.injectedFailure : undefined;
	
	const hubChoices = choices.hub || RECOMMENDED_LOCAL_CHOICES;
	const hubTxReq = {
		root: request.discovery.hub.root,
		discovery: request.discovery.hub,
		choices: hubChoices,
		injectedOriginValidation: request.injectedOriginValidation,
		injectedFailure: injectedFailureFor(request.discovery.hub.root),
	};
	const hubTx = await runSetupTransaction(hubTxReq);
	
	const hubTargetConfig = hubTx.plan?.effects.find(e => e.target === '.wsagency/config.yaml')?.after || 
		request.discovery.hub.entries['.wsagency/config.yaml']?.content || CANONICAL_CONFIG_YAML;

	const workingPlans = [];
	const questions = [...(hubTx.questions || [])];
	let requiresConfirmation = hubTx.requiresConfirmation;
	const operations = [];

	for (const repo of request.discovery.working) {
		if (removed.has(repo.name)) continue;

		const explicitConfig = repo.entries['.wsagency/config.yaml']?.content;
		const targetConfig = mergeConfig(hubTargetConfig, explicitConfig);
		
		const repoChoices = choices.working?.[repo.name] || {};
		const txReq = {
			root: repo.root,
			discovery: repo,
			choices: { profile: "recommended_local", ...repoChoices, targetConfig },
			injectedOriginValidation: request.injectedOriginValidation,
			injectedFailure: injectedFailureFor(repo.root),
		};
		const tx = await runSetupTransaction(txReq);
		if (tx.questions) questions.push(...tx.questions);
		requiresConfirmation = requiresConfirmation || tx.requiresConfirmation;
		if (tx.plan) {
			workingPlans.push({ name: repo.name, plan: tx.plan, transaction: tx });
		}
	}

	const hashPayload = {
		hubHash: hubTx.plan?.hash,
		workingHashes: workingPlans.map(wp => wp.plan.hash)
	};
	const hash = sha256(JSON.stringify(hashPayload));

	const hubPlan = {
		hash,
		scope: { root: request.discovery.root, projectShape: "hub_root" },
		hub: hubTx.plan,
		working: workingPlans
	};

	if (request.authorization && request.authorization !== hash) {
		throw new Error("Authorization hash does not match the planned cross-repository manifest.");
	}

	if (!request.authorization && !requiresConfirmation) {
			const readiness = {
				hub: hubTx.readiness,
				working: Object.fromEntries(workingPlans.map(entry => [entry.name, entry.transaction.readiness])),
			};
			return {
				discovery: request.discovery,
				questions,
				plan: hubPlan,
				requiresConfirmation: false,
				operations: [],
				readiness,
				report: [
					`Hub: ${hubTx.report}`,
					...workingPlans.map(entry => `Working ${entry.name}: ${entry.transaction.report}`),
				].join("\n"),
			};
		}
	if (!request.authorization) {
		return {
			discovery: request.discovery,
			questions,
			plan: hubPlan,
			requiresConfirmation,
			operations: [],
			report: "Hub transaction planned. Awaiting authorization."
		};
	}

	// EXECUTE sequentially
	// First Hub
	const hubApplyReq = { ...hubTxReq, authorization: hubTx.plan.hash };
	const hubApplyTx = await runSetupTransaction(hubApplyReq);
	operations.push(...hubApplyTx.operations);
	
	let failureOccurred = transactionFailed(hubApplyTx);
	
	const readiness = {
		hub: hubApplyTx.readiness,
		working: {}
	};
	let report = `Hub: ${hubApplyTx.report}\n`;

	// Then Working repos in registry order
	for (const wp of workingPlans) {
		if (failureOccurred) {
			report += `Working ${wp.name}: skipped due to previous failure.\n`;
			continue;
		}
		const repoChoices = choices.working?.[wp.name] || {};
		const explicitConfig = request.discovery.working.find(w => w.name === wp.name)?.entries['.wsagency/config.yaml']?.content;
		const targetConfig = mergeConfig(hubTargetConfig, explicitConfig);
		
		const txReq = {
			root: request.discovery.working.find(w => w.name === wp.name).root,
			discovery: request.discovery.working.find(w => w.name === wp.name),
			choices: { profile: "recommended_local", ...repoChoices, targetConfig },
			authorization: wp.plan.hash,
			injectedOriginValidation: request.injectedOriginValidation,
			injectedFailure: injectedFailureFor(request.discovery.working.find(w => w.name === wp.name).root),
		};
		const tx = await runSetupTransaction(txReq);
		operations.push(...tx.operations);
		readiness.working[wp.name] = tx.readiness;
		report += `Working ${wp.name}: ${tx.report}\n`;
		
		if (transactionFailed(tx)) {
			failureOccurred = true;
		}
	}

	return {
		discovery: request.discovery,
		questions: [],
		plan: hubPlan,
		requiresConfirmation: false,
		operations,
		readiness,
		report: report.trim()
	};
}
