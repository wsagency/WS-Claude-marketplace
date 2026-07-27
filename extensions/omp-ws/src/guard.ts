/**
 * ws-guard: fail-closed `tool_call` hook on bash that blocks dangerous git
 * and rm invocations. Enforcement counterpart of the advisory ws-guard-git
 * TTSR rule (dev-docs/omp-native-improvements.md, Tier 1 item 1).
 *
 * Blocked:
 *   - `git push --force` / `-f`            (--force-with-lease stays allowed)
 *   - `git reset --hard origin/*`
 *   - `git clean -fd` / `-fdx`
 *   - `rm -rf` targeting paths outside the working-directory subtree
 *     (absolute, `~`, `..`-escapes)
 *
 * Off-switches: plugin setting `guard: false` (omp plugin settings /
 * .omp/plugin-overrides.json), `.omp/ws-guard.off` file in cwd, or env
 * OMP_WS_GUARD=off.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { readWsSettings } from "./lib/settings";

export interface GuardVerdict {
	block: true;
	reason: string;
}

/**
 * Pure decision core: inspect one bash command string against the guard
 * rules. `cwd` is the directory the command will run in (used for rm path
 * containment). Returns undefined when the command is allowed.
 */
export function evaluateGuard(command: string, cwd: string, home: string = os.homedir()): GuardVerdict | undefined {
	for (const segment of splitSegments(command)) {
		const tokens = tokenize(segment);
		const verdict = checkGitPushForce(tokens) ?? checkGitResetHard(tokens) ?? checkGitClean(tokens) ?? checkRmRf(tokens, cwd, home);
		if (verdict) return verdict;
	}
	return undefined;
}

// --- git ---------------------------------------------------------------

/** Tokens after the git subcommand, or undefined when this isn't `git <sub>`. */
function gitSubcommandArgs(tokens: string[], subcommand: string): string[] | undefined {
	const start = commandPosition(tokens);
	if (start === undefined || tokens[start] !== "git") return undefined;
	// Skip git global options (-C <dir>, -c <k=v>, --no-pager, --git-dir=..., ...).
	let index = start + 1;
	while (index < tokens.length) {
		const token = tokens[index] as string;
		if (token === "-C" || token === "-c") {
			index += 2;
			continue;
		}
		if (token.startsWith("-")) {
			index += 1;
			continue;
		}
		break;
	}
	if (tokens[index] !== subcommand) return undefined;
	return tokens.slice(index + 1);
}

function checkGitPushForce(tokens: string[]): GuardVerdict | undefined {
	const args = gitSubcommandArgs(tokens, "push");
	if (!args) return undefined;
	for (const arg of args) {
		if (arg === "--force-with-lease" || arg.startsWith("--force-with-lease=")) continue; // explicitly allowed
		if (arg === "--force" || isShortClusterWith(arg, "f")) {
			return {
				block: true,
				reason: "ws-guard: git push --force rewrites remote history. Use `git push --force-with-lease` instead (or drop the force flag).",
			};
		}
	}
	return undefined;
}

function checkGitResetHard(tokens: string[]): GuardVerdict | undefined {
	const args = gitSubcommandArgs(tokens, "reset");
	if (!args) return undefined;
	if (!args.includes("--hard")) return undefined;
	if (!args.some(arg => arg.startsWith("origin/"))) return undefined;
	return {
		block: true,
		reason: "ws-guard: git reset --hard origin/* discards local commits and changes. Inspect first (`git status`, `git log origin/..HEAD`) and use `git stash` or a new branch instead.",
	};
}

function checkGitClean(tokens: string[]): GuardVerdict | undefined {
	const args = gitSubcommandArgs(tokens, "clean");
	if (!args) return undefined;
	let force = false;
	let dirs = false;
	for (const arg of args) {
		if (arg === "--force") force = true;
		if (arg === "-d") dirs = true;
		if (isShortCluster(arg)) {
			if (arg.includes("f")) force = true;
			if (arg.includes("d")) dirs = true;
			if (arg.includes("n")) return undefined; // dry run is always fine
		}
		if (arg === "--dry-run") return undefined;
	}
	if (!(force && dirs)) return undefined;
	return {
		block: true,
		reason: "ws-guard: git clean -fd deletes untracked files irrecoverably. Preview with `git clean -nd` first, then delete specific paths explicitly.",
	};
}

// --- rm ---------------------------------------------------------------

function checkRmRf(tokens: string[], cwd: string, home: string): GuardVerdict | undefined {
	const start = commandPosition(tokens);
	if (start === undefined || tokens[start] !== "rm") return undefined;
	const args = tokens.slice(start + 1);

	let recursive = false;
	let force = false;
	const operands: string[] = [];
	let noMoreFlags = false;
	for (const arg of args) {
		if (!noMoreFlags && arg === "--") {
			noMoreFlags = true;
			continue;
		}
		if (!noMoreFlags && arg.startsWith("-") && arg !== "-") {
			if (arg === "--recursive") recursive = true;
			if (arg === "--force") force = true;
			if (isShortCluster(arg)) {
				if (arg.includes("r") || arg.includes("R")) recursive = true;
				if (arg.includes("f")) force = true;
			}
			continue;
		}
		operands.push(arg);
	}
	if (!(recursive && force)) return undefined;

	for (const operand of operands) {
		if (!isInsideCwd(operand, cwd, home)) {
			return {
				block: true,
				reason: `ws-guard: rm -rf may only target paths inside the working directory (${cwd}). Blocked operand: ${operand}. Delete a path inside the project, or ask the user to remove it manually.`,
			};
		}
	}
	return undefined;
}

/** Resolve an rm operand and check it stays within the cwd subtree. */
export function isInsideCwd(operand: string, cwd: string, home: string): boolean {
	let candidate = operand;
	if (candidate === "~" || candidate.startsWith("~/")) {
		candidate = path.join(home, candidate.slice(1));
	}
	// Variable/command substitution cannot be resolved statically — refuse.
	if (/[$`]/.test(candidate)) return false;
	// Globs expand within their directory prefix; judge the prefix instead.
	const globIndex = candidate.search(/[*?{[]/);
	if (globIndex !== -1) {
		candidate = candidate.slice(0, globIndex);
		if (candidate === "") return true; // bare glob expands inside the command cwd
	}
	const resolved = path.resolve(cwd, candidate);
	const base = path.resolve(cwd);
	return resolved === base || resolved.startsWith(base + path.sep);
}

// --- shell-ish parsing helpers ----------------------------------------

/** Split a compound command on control operators; quote-blind but adequate. */
export function splitSegments(command: string): string[] {
	return command
		.split(/(?:&&|\|\||;|\||\n)/)
		.map(segment => segment.trim())
		.filter(Boolean);
}

/** Whitespace tokens with surrounding quotes stripped. */
export function tokenize(segment: string): string[] {
	return segment
		.split(/\s+/)
		.filter(Boolean)
		.map(token => token.replace(/^["']|["']$/g, ""));
}

/**
 * Index of the actual command word: skips env assignments and the common
 * wrappers (sudo, command, env, nohup, time).
 */
function commandPosition(tokens: string[]): number | undefined {
	const wrappers = new Set(["sudo", "command", "env", "nohup", "time"]);
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index] as string;
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue; // env assignment
		if (wrappers.has(token)) continue;
		if (token.startsWith("-")) continue; // wrapper flags (e.g. env -i)
		return index;
	}
	return undefined;
}

/** True for a bundled short-option token like `-fd` (never `--force`). */
function isShortCluster(token: string): boolean {
	return /^-[A-Za-z]+$/.test(token);
}

function isShortClusterWith(token: string, letter: string): boolean {
	return isShortCluster(token) && token.includes(letter);
}

// --- omp wiring -------------------------------------------------------

const OFF_FILE = path.join(".omp", "ws-guard.off");

async function guardDisabled(cwd: string): Promise<boolean> {
	if (process.env.OMP_WS_GUARD === "off") return true;
	if (!(await readWsSettings(cwd)).guard) return true;
	try {
		await fs.stat(path.join(cwd, OFF_FILE));
		return true;
	} catch {
		return false;
	}
}

export function registerGuard(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;
		try {
			if (await guardDisabled(ctx.cwd)) return;
			const input = event.input as { command?: unknown; cwd?: unknown };
			const command = typeof input.command === "string" ? input.command : "";
			if (command === "") return;
			const cwd = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : ctx.cwd;
			return evaluateGuard(command, cwd);
		} catch (error) {
			// Never let an internal error block every bash call (tool_call is fail-closed).
			pi.logger.warn(`ws-guard: internal error, allowing command: ${String(error)}`);
			return;
		}
	});
}
