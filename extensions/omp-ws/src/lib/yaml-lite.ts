/**
 * yaml-lite: the same line-based YAML scraping the WS shell hooks use (awk
 * "enter section, stop at the next column-0 key, take the first matching
 * key"). NOT a YAML parser — just enough to read docs-config.yaml and
 * ws-project.yaml the way enforce-changelog.sh / enforce-stop.sh do.
 */

/**
 * Value of `key:` inside the block opened by a line whose trimmed content is
 * `<section>:`. Scanning stops at the next column-0 (top-level) key, exactly
 * like the awk in the shell hooks, so nested sections still resolve.
 * Returns undefined when the section or key is absent.
 */
export function sectionValue(text: string, section: string, key: string): string | undefined {
	const lines = text.split("\n");
	let inSection = false;
	for (const line of lines) {
		if (!inSection) {
			if (stripComment(line).trim() === `${section}:`) inSection = true;
			continue;
		}
		if (/^[^\s]/.test(line)) break; // next top-level key ends the section
		const trimmed = line.trim();
		if (trimmed.startsWith(`${key}:`)) {
			return cleanValue(trimmed.slice(key.length + 1));
		}
	}
	return undefined;
}

/**
 * Flow-list value of `key:` inside `<section>:` — e.g.
 * `skip_types: [docs, chore, "test"]` → ["docs", "chore", "test"].
 * Also tolerates a plain space-separated scalar. Returns undefined when absent.
 */
export function sectionList(text: string, section: string, key: string): string[] | undefined {
	const raw = sectionValue(text, section, key);
	if (raw === undefined || raw === "") return undefined;
	const items = raw
		.replace(/[[\]"']/g, "")
		.split(/[\s,]+/)
		.filter(Boolean);
	return items.length > 0 ? items : undefined;
}

function stripComment(line: string): string {
	// Good enough for config files that never put '#' inside quoted values.
	const hash = line.indexOf(" #");
	return hash === -1 ? line : line.slice(0, hash);
}

function cleanValue(rest: string): string {
	let value = rest.trim();
	const hash = value.search(/\s+#/);
	if (hash !== -1) value = value.slice(0, hash).trim();
	return value.replace(/^["']|["']$/g, "");
}
