export interface VerificationPaths {
	tempRoot: string;
	claudeHome: string;
	claudeConfig: string;
	ompHome: string;
	ompXdgConfig: string;
	ompXdgData: string;
	npmPrefix: string;
	workspace: string;
	nativeRoot: string;
}

export interface VerificationEnvironment extends Record<string, string> {
	HOME: string;
}

export interface VerificationStep {
	label: string;
	command: string;
	args: string[];
	cwd: string;
	env: VerificationEnvironment;
}

export interface CommandResult {
	status: number;
	stdout: string;
	stderr: string;
}

export interface InstalledSurface {
	root: string;
	required: string[];
	removed: string[];
}

export interface MigrationExercise {
	label: string;
	plannedItems: number;
	operations: number;
	aligned: boolean;
}

export interface VerificationDependencies {
	runCommand?: (step: VerificationStep) => CommandResult | Promise<CommandResult>;
	resolveClaudePluginRoot?: (claudeConfig: string) => string | Promise<string>;
	inspectSurface?: (root: string) => InstalledSurface | Promise<InstalledSurface>;
	exerciseTransaction?: (
		pluginRoot: string,
		workspaceRoot: string,
		label: string,
		runCommand: (step: VerificationStep) => CommandResult | Promise<CommandResult>,
		env: VerificationEnvironment,
	) => MigrationExercise | Promise<MigrationExercise>;
}

export interface ReleaseVerificationResult {
	commands: string[];
	claude: { root: string; migration: MigrationExercise };
	omp: { root: string; migration: MigrationExercise };
}

export const REQUIRED_INSTALLED_ASSETS: readonly [string, ...string[]];
export const REMOVED_INSTALLED_ASSETS: readonly [string, ...string[]];
export function verificationPaths(tempRoot: string): VerificationPaths;
export function buildVerificationSteps(input: {
	marketplaceRoot: string;
	tarballPath: string;
	paths: VerificationPaths;
}): VerificationStep[];
export function assertInstalledSurface(pluginRoot: string): Promise<InstalledSurface>;
export function verifyReleaseArtifacts(
	options: { marketplaceRoot: string; tarballPath: string },
	dependencies?: VerificationDependencies,
): Promise<ReleaseVerificationResult>;
