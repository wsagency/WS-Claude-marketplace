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

export interface SharedSurfaceEvidence {
	manifest: string;
	manifestSha256: string;
	marketplaceCommit: string;
	files: number;
	bySurface: Record<"commands" | "skills" | "agents" | "rules", number>;
}

export interface ClaudeRuntimeEvidence {
	plugin: string;
	hookManifestSha256: string;
	registrations: Array<{ event: string; matcher: string; asset: string }>;
	assets: Array<{ path: string; sha256: string }>;
}

export interface OmpRuntimeEvidence {
	extension: string;
	extensionSha256: string;
	hookEvents: string[];
	tools: string[];
	rules: string[];
}

export interface VerificationDependencies {
	runCommand?: (step: VerificationStep) => CommandResult | Promise<CommandResult>;
	resolveClaudePluginInstallation?: (claudeConfig: string) => ClaudePluginInstallation | Promise<ClaudePluginInstallation>;
	inspectSurface?: (root: string) => InstalledSurface | Promise<InstalledSurface>;
	verifySharedGeneratedSurface?: (
		claudeRoot: string,
		nativeRoot: string,
		expectedMarketplaceCommit: string,
	) => SharedSurfaceEvidence | Promise<SharedSurfaceEvidence>;
	probeClaudeRuntime?: (root: string) => ClaudeRuntimeEvidence | Promise<ClaudeRuntimeEvidence>;
	probeOmpRuntime?: (root: string) => OmpRuntimeEvidence | Promise<OmpRuntimeEvidence>;
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
	parity: SharedSurfaceEvidence;
	claude: { root: string; runtime: ClaudeRuntimeEvidence };
	omp: {
		root: string;
		runtime: OmpRuntimeEvidence & {
			linkedPlugin: Record<string, unknown>;
			doctor: Array<Record<string, unknown>>;
		};
	};
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
export function verifySharedGeneratedSurface(
	claudeRoot: string,
	nativeRoot: string,
	expectedMarketplaceCommit: string,
): Promise<SharedSurfaceEvidence>;
export function probeClaudeRuntime(pluginRoot: string): Promise<ClaudeRuntimeEvidence>;
export function probeOmpRuntime(pluginRoot: string): Promise<OmpRuntimeEvidence>;
export function verifyReleaseArtifacts(
	options: VerifyReleaseArtifactsOptions,
	dependencies?: VerificationDependencies,
): Promise<ReleaseVerificationResult>;
