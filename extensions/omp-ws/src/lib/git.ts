/**
 * Small git queries used by the changelog gate and the stop nudge.
 * Fail-soft: any git error yields an empty list, which every caller treats
 * as "nothing to enforce".
 */
import { run } from "./exec";

export async function stagedFiles(cwd: string): Promise<string[]> {
	const result = await run("git", ["diff", "--cached", "--name-only"], { cwd });
	if (result.code !== 0) return [];
	return splitLines(result.stdout);
}

/** Union of unstaged and staged changed paths (the enforce-stop.sh set). */
export async function uncommittedFiles(cwd: string): Promise<string[]> {
	const unstaged = await run("git", ["diff", "--name-only"], { cwd });
	const staged = await run("git", ["diff", "--cached", "--name-only"], { cwd });
	if (unstaged.code !== 0 && staged.code !== 0) return [];
	const all = new Set([...splitLines(unstaged.stdout), ...splitLines(staged.stdout)]);
	return [...all].sort();
}

function splitLines(text: string): string[] {
	return text
		.split("\n")
		.map(line => line.trim())
		.filter(Boolean);
}
