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

export interface ClaudePluginInstallation {
	root: string;
	version: string;
	gitCommitSha: string;
}

export interface MigrationExercise {
	label: string;
	plannedItems: number;
	operations: number;
	aligned: boolean;
}

export interface VerificationDependencies {
	runCommand?: (step: VerificationStep) => CommandResult | Promise<CommandResult>;
	resolveClaudePluginInstallation?: (claudeConfig: string) => ClaudePluginInstallation | Promise<ClaudePluginInstallation>;
	inspectSurface?: (root: string) => InstalledSurface | Promise<InstalledSurface>;
	exerciseTransaction?: (
		pluginRoot: string,
		workspaceRoot: string,
		label: string,
		runCommand: (step: VerificationStep) => CommandResult | Promise<CommandResult>,
		env: VerificationEnvironment,
	) => MigrationExercise | Promise<MigrationExercise>;
}

export interface ReleaseIdentities {
	marketplaceVersion: string;
	packageName: string;
	packageVersion: string;
	marketplaceCommit: string;
	tarballSha256: string;
	tarballSize: number;
}

export interface ReleaseVerificationResult {
	identities: ReleaseIdentities;
	commands: string[];
	claude: { root: string; migration: MigrationExercise };
	omp: { root: string; migration: MigrationExercise };
}

export interface VerifyReleaseArtifactsOptions {
	marketplaceRoot: string;
	tarballPath: string;
	expectedMarketplaceVersion: string;
	expectedPackageName: string;
	expectedPackageVersion: string;
	expectedMarketplaceCommit: string;
	expectedTarballSha256: string;
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
	options: VerifyReleaseArtifactsOptions,
	dependencies?: VerificationDependencies,
): Promise<ReleaseVerificationResult>;
