import { expect, test } from "bun:test";
import {
	deriveSetupReadiness,
	serializeCanonicalConfig,
	validateCanonicalConfig,
	validateCanonicalConfigObject,
} from "../../../plugins/ws/skills/ws-project-bootstrap/config.mjs";
import { CANONICAL_CONFIG_YAML } from "../../../plugins/ws/skills/ws-project-bootstrap/transaction.mjs";

test("canonical Local policy validates without persisted readiness defaults", () => {
	const result = validateCanonicalConfig(CANONICAL_CONFIG_YAML);

	if (result.status !== "valid") throw new Error("Expected canonical Local policy to validate.");
	expect(result.config.tracker?.primary).toBe("local");
	expect(result.config).not.toHaveProperty("ready");
});

test("canonical object validation distinguishes migration and package-update gates", () => {
	expect(validateCanonicalConfigObject({ schema_version: 1 }).status).toBe("valid");
	expect(validateCanonicalConfigObject({ schema_version: 0 }).status).toBe("older");
	expect(validateCanonicalConfigObject({ schema_version: 2 }).status).toBe("future");
	expect(validateCanonicalConfigObject({ tracker: "local" }).status).toBe("invalid");
});

test("canonical config serializes deterministically for transaction planning", () => {
	const result = validateCanonicalConfig(CANONICAL_CONFIG_YAML);
	if (result.status !== "valid") throw new Error("Expected canonical Local policy to validate.");

	expect(serializeCanonicalConfig(result.config)).toBe(CANONICAL_CONFIG_YAML);
});

test("docs-only canonical policy is valid but not engineering-ready", () => {
	const source = `schema_version: 1

docs:
  user_track: docs
  dev_track: dev-docs
  default_audience: ask
  default_scope: repo
  adr_for_arch_changes: true
`;
	const validation = validateCanonicalConfig(source);
	const readiness = deriveSetupReadiness(validation, {
		artifacts: {},
		integrations: {},
		runtime: {},
	});

	expect(validation.status).toBe("valid");
	expect(readiness).toEqual({
		configValid: true,
		engineeringReady: false,
		trackerReady: false,
		docsReady: false,
		runtimeReady: false,
	});
});

test("strict canonical parsing rejects ambiguous YAML before policy evaluation", () => {
	const cases: ReadonlyArray<readonly [string, string]> = [
		["duplicate_key", "schema_version: 1\nschema_version: 1\n"],
		["unsupported_yaml", "schema_version: 1\njira: !include jira.yaml\n"],
		["ambiguous_yaml_scalar", "schema_version: 1\nruntime:\n  session_discipline: on\n  dangerous_git_guard: enabled\n"],
	];

	for (const [code, source] of cases) {
		const result = validateCanonicalConfig(source);
		expect(result.status).toBe("invalid");
		expect(result.errors[0]?.code).toBe(code);
	}
});

test("canonical paths reject traversal, absolutes, and overlapping ownership", () => {
	const traversing = validateCanonicalConfig(`schema_version: 1
docs:
  user_track: ../docs
  dev_track: dev-docs
  default_audience: ask
  default_scope: repo
  adr_for_arch_changes: true
`);
	const overlapping = validateCanonicalConfig(`schema_version: 1
changelog:
  update_mode: pull_request
  path: docs
  skip_types: [docs]
docs:
  user_track: docs
  dev_track: dev-docs
  default_audience: ask
  default_scope: repo
  adr_for_arch_changes: true
`);

	expect(traversing.errors.some(error => error.code === "invalid_path")).toBe(true);
	expect(overlapping.errors.some(error => error.code === "path_conflict")).toBe(true);
});
