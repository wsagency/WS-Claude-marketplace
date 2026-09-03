/**
 * Repository-relative file classification shared by canonical changelog
 * enforcement and stop reminders.
 */

/**
 * True for paths the changelog rules treat as documentation: docs/,
 * dev-docs/, any *.md (CHANGELOG.md included). Same case list as the hooks.
 */
export function isDocsPath(file: string): boolean {
	if (file.startsWith("docs/") || file.startsWith("dev-docs/")) return true;
	if (file.endsWith(".md") || file.endsWith(".MD")) return true;
	return file === "CHANGELOG.md";
}

/** Any non-docs file in the set? (The "has_code" test of the shell hooks.) */
export function hasCodeChanges(files: string[]): boolean {
	return files.some(file => !isDocsPath(file));
}

export function touchesChangelog(files: string[], changelogPath = "CHANGELOG.md"): boolean {
	return files.some(file => file === changelogPath);
}
