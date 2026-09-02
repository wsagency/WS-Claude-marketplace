import path from "node:path";

const TOP_LEVEL_KEYS = new Set([
	"schema_version",
	"tracker",
	"triage",
	"domain",
	"commit",
	"changelog",
	"ui",
	"runtime",
	"jira",
	"docs",
]);

const SECTION_CONTRACTS = Object.freeze({
	tracker: {
		required: ["primary", "pull_requests"],
		allowed: ["primary", "pull_requests"],
	},
	triage: { required: ["labels"], allowed: ["labels"] },
	domain: { required: ["layout"], allowed: ["layout"] },
	commit: { required: ["jira"], allowed: ["jira"] },
	changelog: {
		required: ["update_mode", "path", "skip_types"],
		allowed: ["update_mode", "path", "skip_types"],
	},
	ui: { required: ["session_start_dashboard"], allowed: ["session_start_dashboard"] },
	runtime: {
		required: ["session_discipline", "dangerous_git_guard"],
		allowed: ["session_discipline", "dangerous_git_guard"],
	},
	jira: {
		required: ["project", "default_issue_type", "sync"],
		allowed: ["project", "board", "default_issue_type", "sync"],
	},
	docs: {
		required: ["user_track", "dev_track", "default_audience", "default_scope", "adr_for_arch_changes"],
		allowed: ["user_track", "dev_track", "default_audience", "default_scope", "adr_for_arch_changes"],
	},
});

const LABEL_KEYS = ["needs_triage", "needs_info", "ready_for_agent", "ready_for_human", "wontfix"];
const JIRA_COMMIT_KEYS = ["actions", "smart_commit_trailer", "post_commit_comment", "pr_transition"];
const SECRET_KEY = /(?:^|_)(?:token|secret|password|credential|api_key|account_id|cloud_id|site|user_identity|username)(?:_|$)/i;
const RESERVED_DOCUMENTATION_FILES = new Set([
	".wsagency/config.yaml",
	"AGENTS.md",
	"CLAUDE.md",
	"CONTEXT.md",
	"CONTEXT-MAP.md",
	"project.yaml",
]);
const RESERVED_DOCUMENTATION_DIRECTORIES = [".git", ".wsagency", "dev-docs/agents", "dev-docs/tickets"];

export class ConfigValidationError extends Error {
	constructor(code, message, configPath = "$") {
		super(message);
		this.name = "ConfigValidationError";
		this.code = code;
		this.path = configPath;
	}
}

function stripComment(line) {
	let quote = null;
	let bracketDepth = 0;
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if (quote === "\"") {
			if (char === "\\") index += 1;
			else if (char === quote) quote = null;
			continue;
		}
		if (quote === "'") {
			if (char === "'" && line[index + 1] === "'") index += 1;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === "\"" || char === "'") quote = char;
		else if (char === "[") bracketDepth += 1;
		else if (char === "]") bracketDepth -= 1;
		else if (char === "#" && bracketDepth === 0 && (index === 0 || /\s/.test(line[index - 1]))) return line.slice(0, index).trimEnd();
	}
	if (quote || bracketDepth !== 0) throw new ConfigValidationError("malformed_yaml", "Unclosed quoted value or inline array.");
	return line.trimEnd();
}

function splitInlineArray(source) {
	const items = [];
	let quote = null;
	let start = 0;
	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		if (quote === "\"") {
			if (char === "\\") index += 1;
			else if (char === quote) quote = null;
		} else if (quote === "'") {
			if (char === "'" && source[index + 1] === "'") index += 1;
			else if (char === quote) quote = null;
		} else if (char === "\"" || char === "'") quote = char;
		else if (char === ",") {
			items.push(source.slice(start, index).trim());
			start = index + 1;
		}
	}
	if (quote) throw new ConfigValidationError("malformed_yaml", "Unclosed quoted array item.");
	const tail = source.slice(start).trim();
	if (tail || source.trim()) items.push(tail);
	return items;
}

function parseScalar(source, configPath) {
	const value = source.trim();
	if (value === "" || value === "|" || value === ">" || /^[!&*]/.test(value)) {
		throw new ConfigValidationError("unsupported_yaml", `Unsupported YAML value at ${configPath}.`, configPath);
	}
	if (value.startsWith("[") || value.endsWith("]")) {
		if (!(value.startsWith("[") && value.endsWith("]"))) throw new ConfigValidationError("malformed_yaml", `Malformed inline array at ${configPath}.`, configPath);
		const body = value.slice(1, -1).trim();
		return body === "" ? [] : splitInlineArray(body).map((item, index) => parseScalar(item, `${configPath}[${index}]`));
	}
	if (value.startsWith("\"") || value.endsWith("\"")) {
		try {
			return JSON.parse(value);
		} catch {
			throw new ConfigValidationError("malformed_yaml", `Malformed quoted string at ${configPath}.`, configPath);
		}
	}
	if (value.startsWith("'") || value.endsWith("'")) {
		if (!(value.startsWith("'") && value.endsWith("'"))) throw new ConfigValidationError("malformed_yaml", `Malformed quoted string at ${configPath}.`, configPath);
		return value.slice(1, -1).replaceAll("''", "'");
	}
	if (value === "true") return true;
	if (value === "false") return false;
	if (value === "null" || value === "~") return null;
	if (/^-?(?:0|[1-9]\d*)$/.test(value)) return Number(value);
	if (/^(?:yes|no|on|off|\.nan|[-+]?\.inf)$/i.test(value)) throw new ConfigValidationError("ambiguous_yaml_scalar", `Ambiguous YAML scalar at ${configPath}.`, configPath);
	return value;
}

/** Parse the deliberately small, strict YAML subset used by WS project policy. */
export function parseCanonicalConfigYaml(source) {
	if (typeof source !== "string") throw new ConfigValidationError("wrong_type", "Configuration source must be text.");
	const root = {};
	const stack = [{ indent: -2, value: root, path: "$" }];
	const lines = source.replaceAll("\r\n", "\n").split("\n");
	for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
		const raw = lines[lineNumber];
		if (raw.includes("\t")) throw new ConfigValidationError("malformed_yaml", `Tabs are not allowed at line ${lineNumber + 1}.`);
		const line = stripComment(raw);
		if (line.trim() === "" || line.trimStart().startsWith("---") || line.trimStart().startsWith("...")) continue;
		const indent = line.length - line.trimStart().length;
		if (indent % 2 !== 0) throw new ConfigValidationError("malformed_yaml", `Indentation must use two-space levels at line ${lineNumber + 1}.`);
		const trimmed = line.trimStart();
		if (trimmed.startsWith("-") || trimmed.startsWith("?") || trimmed.startsWith("&") || trimmed.startsWith("*") || trimmed.startsWith("!")) {
			throw new ConfigValidationError("unsupported_yaml", `Unsupported YAML construct at line ${lineNumber + 1}.`);
		}
		const separator = trimmed.indexOf(":");
		if (separator <= 0) throw new ConfigValidationError("malformed_yaml", `Expected a mapping entry at line ${lineNumber + 1}.`);
		const key = trimmed.slice(0, separator).trim();
		const rest = trimmed.slice(separator + 1).trim();
		if (!/^[a-z][a-z0-9_]*$/.test(key) || key === "<<") throw new ConfigValidationError("unsupported_yaml", `Unsupported key ${key || "<empty>"} at line ${lineNumber + 1}.`);
		while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
		const parent = stack.at(-1);
		if (indent !== parent.indent + 2) throw new ConfigValidationError("malformed_yaml", `Unexpected indentation at line ${lineNumber + 1}.`);
		const configPath = `${parent.path}.${key}`;
		if (Object.hasOwn(parent.value, key)) throw new ConfigValidationError("duplicate_key", `Duplicate key ${configPath}.`, configPath);
		if (rest === "") {
			const child = {};
			parent.value[key] = child;
			stack.push({ indent, value: child, path: configPath });
		} else parent.value[key] = parseScalar(rest, configPath);
	}
	return root;
}

const SERIALIZATION_ORDER = Object.freeze({
	"$": ["schema_version", "tracker", "triage", "domain", "commit", "changelog", "ui", "runtime", "jira", "docs"],
	"$.tracker": ["primary", "pull_requests"],
	"$.triage": ["labels"],
	"$.triage.labels": LABEL_KEYS,
	"$.domain": ["layout"],
	"$.commit": ["jira"],
	"$.commit.jira": JIRA_COMMIT_KEYS,
	"$.changelog": ["update_mode", "path", "skip_types"],
	"$.ui": ["session_start_dashboard"],
	"$.runtime": ["session_discipline", "dangerous_git_guard"],
	"$.jira": ["project", "board", "default_issue_type", "sync"],
	"$.docs": ["user_track", "dev_track", "default_audience", "default_scope", "adr_for_arch_changes"],
});

function serializeScalar(value) {
	if (Array.isArray(value)) return `[${value.map(serializeScalar).join(", ")}]`;
	if (value === null || typeof value === "boolean" || typeof value === "number") return String(value);
	if (/^[A-Za-z0-9_./-]+$/.test(value) && !/^(?:true|false|null|~|yes|no|on|off)$/i.test(value)) return value;
	return JSON.stringify(value);
}

function serializeMapping(value, configPath, indent) {
	const lines = [];
	const keys = SERIALIZATION_ORDER[configPath] ?? Object.keys(value).sort();
	for (const key of keys) {
		if (!Object.hasOwn(value, key)) continue;
		const child = value[key];
		const prefix = `${" ".repeat(indent)}${key}:`;
		if (child && typeof child === "object" && !Array.isArray(child)) {
			lines.push(prefix, ...serializeMapping(child, `${configPath}.${key}`, indent + 2));
		} else lines.push(`${prefix} ${serializeScalar(child)}`);
	}
	return lines;
}

/** Serialize validated policy in the sole canonical key and whitespace order. */
export function serializeCanonicalConfig(config) {
	const errors = validateConfig(config);
	if (errors.length > 0) {
		const first = errors[0];
		throw new ConfigValidationError(first.code, first.message, first.path);
	}
	const blocks = [];
	for (const key of SERIALIZATION_ORDER.$) {
		if (!Object.hasOwn(config, key)) continue;
		const value = config[key];
		if (value && typeof value === "object" && !Array.isArray(value)) blocks.push([`${key}:`, ...serializeMapping(value, `$.${key}`, 2)].join("\n"));
		else blocks.push(`${key}: ${serializeScalar(value)}`);
	}
	return `${blocks.join("\n\n")}\n`;
}

function issue(errors, code, message, configPath) {
	errors.push({ code, message, path: configPath });
}

function requireObject(value, configPath, errors) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		issue(errors, "wrong_type", `${configPath} must be an object.`, configPath);
		return false;
	}
	return true;
}

function validateKeys(value, contract, configPath, errors) {
	if (!requireObject(value, configPath, errors)) return false;
	for (const key of Object.keys(value)) {
		if (SECRET_KEY.test(key)) issue(errors, "forbidden_secret", `${configPath}.${key} is machine-owned or secret-like and cannot be committed.`, `${configPath}.${key}`);
		else if (!contract.allowed.includes(key)) issue(errors, "unknown_key", `Unknown key ${configPath}.${key}.`, `${configPath}.${key}`);
	}
	for (const key of contract.required) {
		if (!Object.hasOwn(value, key)) issue(errors, "missing_key", `Missing required key ${configPath}.${key}.`, `${configPath}.${key}`);
	}
	return true;
}

function expectEnum(value, allowed, configPath, errors) {
	if (!allowed.includes(value)) issue(errors, "invalid_enum", `${configPath} must be one of: ${allowed.join(", ")}.`, configPath);
}

function expectBoolean(value, configPath, errors) {
	if (typeof value !== "boolean") issue(errors, "wrong_type", `${configPath} must be a boolean.`, configPath);
}

function expectNonEmpty(value, configPath, errors) {
	if (typeof value !== "string" || value.trim() === "") issue(errors, "wrong_type", `${configPath} must be a non-empty string.`, configPath);
}

function expectRelativePath(value, configPath, errors) {
	if (typeof value !== "string" || value === "" || path.isAbsolute(value) || value.includes("\\") || value.includes("//")) {
		issue(errors, "invalid_path", `${configPath} must be a normalized repository-relative path.`, configPath);
		return;
	}
	const parts = value.split("/");
	if (parts.some(part => part === "" || part === "." || part === "..") || path.posix.normalize(value) !== value) {
		issue(errors, "invalid_path", `${configPath} must not traverse or alias repository paths.`, configPath);
	}
}

function isAtOrBelow(candidate, parent) {
	return candidate === parent || candidate.startsWith(`${parent}/`);
}

function documentationPathConflicts(config) {
	const user = config.docs.user_track;
	const dev = config.docs.dev_track;
	const directories = [
		user,
		`${user}/tutorials`,
		`${user}/how-to`,
		`${user}/reference`,
		`${user}/explanation`,
		`${user}/release-notes`,
		dev,
		`${dev}/decisions`,
		`${dev}/scoping`,
		`${dev}/runbooks`,
		`${dev}/reference`,
		`${dev}/explanation`,
	];
	const files = [
		config.changelog?.path,
		"CONTRIBUTING.md",
		`${user}/contributing.md`,
		`${user}/index.md`,
		`${dev}/development.md`,
		`${dev}/index.md`,
	].filter(Boolean);
	const duplicateDirectories = new Set(directories).size !== directories.length;
	const duplicateFiles = new Set(files).size !== files.length;
	const fileDirectoryCollision = files.some(file => directories.includes(file));
	const reservedDirectory = directories.some(directory =>
		RESERVED_DOCUMENTATION_DIRECTORIES.some(reserved => isAtOrBelow(directory, reserved))
		|| RESERVED_DOCUMENTATION_FILES.has(directory),
	);
	const reservedFile = files.some(file =>
		RESERVED_DOCUMENTATION_FILES.has(file)
		|| RESERVED_DOCUMENTATION_DIRECTORIES.some(reserved => isAtOrBelow(file, reserved)),
	);
	return duplicateDirectories || duplicateFiles || fileDirectoryCollision || reservedDirectory || reservedFile;
}

function validateConfig(config) {
	const errors = [];
	if (!requireObject(config, "$", errors)) return errors;
	for (const key of Object.keys(config)) {
		if (SECRET_KEY.test(key)) issue(errors, "forbidden_secret", `$.${key} is machine-owned or secret-like and cannot be committed.`, `$.${key}`);
		else if (!TOP_LEVEL_KEYS.has(key)) issue(errors, "unknown_key", `Unknown key $.${key}.`, `$.${key}`);
	}
	if (!Object.hasOwn(config, "schema_version")) issue(errors, "missing_key", "Missing required key $.schema_version.", "$.schema_version");
	if (Object.hasOwn(config, "schema_version") && config.schema_version !== 1) return errors;

	for (const [section, contract] of Object.entries(SECTION_CONTRACTS)) {
		if (Object.hasOwn(config, section)) validateKeys(config[section], contract, `$.${section}`, errors);
	}
	if (config.tracker && typeof config.tracker === "object") {
		expectEnum(config.tracker.primary, ["local", "github", "gitlab", "jira"], "$.tracker.primary", errors);
		expectEnum(config.tracker.pull_requests, ["ignore", "triage"], "$.tracker.pull_requests", errors);
	}
	if (config.triage?.labels && validateKeys(config.triage.labels, { required: LABEL_KEYS, allowed: LABEL_KEYS }, "$.triage.labels", errors)) {
		const labels = LABEL_KEYS.map(key => config.triage.labels[key]);
		for (const key of LABEL_KEYS) expectNonEmpty(config.triage.labels[key], `$.triage.labels.${key}`, errors);
		if (labels.every(label => typeof label === "string") && new Set(labels).size !== labels.length) issue(errors, "duplicate_label", "Triage labels must be semantically distinct.", "$.triage.labels");
	}
	if (config.domain) expectEnum(config.domain.layout, ["single_context", "multi_context"], "$.domain.layout", errors);
	if (config.commit?.jira && validateKeys(config.commit.jira, { required: JIRA_COMMIT_KEYS, allowed: JIRA_COMMIT_KEYS }, "$.commit.jira", errors)) {
		expectEnum(config.commit.jira.actions, ["disabled", "ask", "always"], "$.commit.jira.actions", errors);
		expectBoolean(config.commit.jira.smart_commit_trailer, "$.commit.jira.smart_commit_trailer", errors);
		expectBoolean(config.commit.jira.post_commit_comment, "$.commit.jira.post_commit_comment", errors);
		if (config.commit.jira.pr_transition !== null) expectNonEmpty(config.commit.jira.pr_transition, "$.commit.jira.pr_transition", errors);
	}
	if (config.changelog) {
		expectEnum(config.changelog.update_mode, ["pull_request", "commit", "disabled"], "$.changelog.update_mode", errors);
		expectRelativePath(config.changelog.path, "$.changelog.path", errors);
		if (!Array.isArray(config.changelog.skip_types) || config.changelog.skip_types.some(item => typeof item !== "string" || item === "") || new Set(config.changelog.skip_types).size !== config.changelog.skip_types.length) {
			issue(errors, "wrong_type", "$.changelog.skip_types must be an array of unique non-empty strings.", "$.changelog.skip_types");
		}
	}
	if (config.ui) expectEnum(config.ui.session_start_dashboard, ["disabled", "jira_assignments"], "$.ui.session_start_dashboard", errors);
	if (config.runtime) {
		if (config.runtime.session_discipline !== "required") issue(errors, "invalid_enum", "$.runtime.session_discipline must be required.", "$.runtime.session_discipline");
		expectEnum(config.runtime.dangerous_git_guard, ["enabled", "disabled"], "$.runtime.dangerous_git_guard", errors);
	}
	if (config.jira) {
		expectNonEmpty(config.jira.project, "$.jira.project", errors);
		if (Object.hasOwn(config.jira, "board") && (!Number.isInteger(config.jira.board) || config.jira.board < 1)) issue(errors, "wrong_type", "$.jira.board must be a positive integer.", "$.jira.board");
		expectNonEmpty(config.jira.default_issue_type, "$.jira.default_issue_type", errors);
		expectEnum(config.jira.sync, ["disabled", "all_local_tickets"], "$.jira.sync", errors);
	}
	if (config.docs) {
		expectRelativePath(config.docs.user_track, "$.docs.user_track", errors);
		expectRelativePath(config.docs.dev_track, "$.docs.dev_track", errors);
		expectEnum(config.docs.default_audience, ["user", "dev", "ask"], "$.docs.default_audience", errors);
		expectEnum(config.docs.default_scope, ["repo", "product", "ask"], "$.docs.default_scope", errors);
		expectBoolean(config.docs.adr_for_arch_changes, "$.docs.adr_for_arch_changes", errors);
		if (config.docs.user_track === config.docs.dev_track || config.docs.user_track.startsWith(`${config.docs.dev_track}/`) || config.docs.dev_track.startsWith(`${config.docs.user_track}/`)) issue(errors, "path_conflict", "Documentation tracks must not overlap.", "$.docs");
		if (config.changelog?.path === config.docs.user_track || config.changelog?.path === config.docs.dev_track) issue(errors, "path_conflict", "The changelog file cannot occupy a documentation track directory.", "$.changelog.path");
		if (
			typeof config.docs.user_track === "string"
			&& typeof config.docs.dev_track === "string"
			&& typeof config.changelog?.path === "string"
			&& documentationPathConflicts(config)
		) {
			issue(errors, "path_conflict", "Documentation paths must not collide with generated or reserved setup targets.", "$.docs");
		}
	}
	if (config.tracker?.primary === "jira") {
		if (!config.jira) issue(errors, "missing_dependency", "Jira-primary tracking requires $.jira.", "$.jira");
		else if (config.jira.sync !== "disabled") issue(errors, "incompatible_values", "Jira-primary tracking requires synchronization disabled.", "$.jira.sync");
	}
	if (config.jira?.sync === "all_local_tickets" && config.tracker?.primary !== "local") issue(errors, "incompatible_values", "All-ticket Jira synchronization requires Local primary tracking.", "$.tracker.primary");
	if (["ask", "always"].includes(config.commit?.jira?.actions) && !config.jira) issue(errors, "missing_dependency", "Jira commit actions require $.jira.", "$.jira");
	if (config.ui?.session_start_dashboard === "jira_assignments" && !config.jira) issue(errors, "missing_dependency", "The Jira assignments dashboard requires $.jira.", "$.jira");
	return errors;
}

/** Validate an already-parsed canonical policy object. */
export function validateCanonicalConfigObject(config) {
	if (!config || typeof config !== "object" || Array.isArray(config) || !Number.isInteger(config.schema_version)) {
		return { status: "invalid", config: null, errors: [{ code: "wrong_type", message: "$.schema_version must be the integer 1.", path: "$.schema_version" }] };
	}
	if (config.schema_version < 1) return { status: "older", config, errors: [] };
	if (config.schema_version > 1) return { status: "future", config, errors: [] };
	const errors = validateConfig(config);
	return { status: errors.length === 0 ? "valid" : "invalid", config: errors.length === 0 ? config : null, errors };
}

export function validateCanonicalConfig(source) {
	let config;
	try {
		config = parseCanonicalConfigYaml(source);
	} catch (error) {
		if (!(error instanceof ConfigValidationError)) throw error;
		return { status: "invalid", config: null, errors: [{ code: error.code, message: error.message, path: error.path }] };
	}
	return validateCanonicalConfigObject(config);
}

function allTrue(record, keys) {
	return keys.every(key => record?.[key] === true);
}

/** Derive capability readiness from validated policy plus current artifacts and machine state. */
export function deriveSetupReadiness(validation, snapshot = {}) {
	const config = validation.status === "valid" ? validation.config : null;
	const artifacts = snapshot.artifacts ?? {};
	const integrations = snapshot.integrations ?? {};
	const runtime = snapshot.runtime ?? {};
	const engineeringSections = ["tracker", "triage", "domain", "commit", "changelog", "ui", "runtime"];
	const engineeringReady = Boolean(config && engineeringSections.every(section => config[section]) && allTrue(artifacts, ["issueTracker", "triageLabels", "domain", "agents", "claude"]));
	let trackerReady = false;
	if (engineeringReady) {
		if (config.tracker.primary === "local") trackerReady = artifacts.localTracker === true;
		else if (config.tracker.primary === "github") trackerReady = integrations.github === true;
		else if (config.tracker.primary === "gitlab") trackerReady = integrations.gitlab === true;
		else if (config.tracker.primary === "jira") trackerReady = integrations.jira === true;
		if (trackerReady && config.jira?.sync === "all_local_tickets") trackerReady = integrations.jira === true && artifacts.localMappings === true;
	}
	const docsReady = Boolean(config?.docs && artifacts.userDocs === true && artifacts.devDocs === true && artifacts.changelog === true);
	const runtimeReady = Boolean(config?.runtime && runtime.sessionDiscipline === true && (config.runtime.dangerous_git_guard === "disabled" || runtime.dangerousGitGuard === true));
	return {
		configValid: validation.status === "valid",
		engineeringReady,
		trackerReady,
		docsReady,
		runtimeReady,
	};
}
