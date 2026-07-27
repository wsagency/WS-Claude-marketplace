/**
 * Minimal child-process helper. Never throws for a failing command — a
 * non-zero exit, missing binary, or timeout all come back as a result the
 * caller can inspect. Mirrors the fail-soft style of the shell hooks this
 * package ports.
 */
import { execFile } from "node:child_process";

export interface RunResult {
	stdout: string;
	stderr: string;
	/** Exit code; -1 when the process could not be spawned or was killed. */
	code: number;
}

export interface RunOptions {
	cwd?: string;
	/** Milliseconds; default 5000. */
	timeout?: number;
}

export function run(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
	return new Promise(resolve => {
		execFile(
			command,
			args,
			{
				cwd: options.cwd,
				timeout: options.timeout ?? 5000,
				maxBuffer: 1024 * 1024,
			},
			(error, stdout, stderr) => {
				if (error) {
					const code = typeof (error as { code?: unknown }).code === "number" ? ((error as { code: number }).code as number) : -1;
					resolve({ stdout: stdout ?? "", stderr: stderr ?? "", code });
					return;
				}
				resolve({ stdout: stdout ?? "", stderr: stderr ?? "", code: 0 });
			},
		);
	});
}
