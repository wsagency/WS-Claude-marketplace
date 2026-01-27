# Changelog Format Reference

## File Structure

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New feature description

### Changed
- Change description

## [1.0.0] - 2024-01-15

### Added
- Initial release features

[Unreleased]: https://github.com/user/repo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/user/repo/releases/tag/v1.0.0
```

## Section Order

Sections must appear in this order (omit empty sections):

1. Added
2. Changed
3. Deprecated
4. Removed
5. Fixed
6. Security

## Entry Format

Each entry should be a bullet point starting with a past-tense verb:

```markdown
### Added
- Add user authentication system
- Add password reset functionality via email

### Changed
- Change default timeout from 30s to 60s
- Update dashboard layout for better mobile support

### Deprecated
- Deprecate `oldFunction()` in favor of `newFunction()`

### Removed
- Remove legacy API endpoints `/v1/*`

### Fixed
- Fix memory leak in image processing module
- Fix incorrect calculation in billing totals

### Security
- Fix XSS vulnerability in comment rendering
- Update dependencies to patch CVE-2024-1234
```

## Version Links

At the bottom of the changelog, include comparison links:

```markdown
[Unreleased]: https://github.com/user/repo/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/user/repo/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/user/repo/releases/tag/v1.0.0
```

## Date Format

Always use ISO 8601 format: **YYYY-MM-DD**

Examples:
- `## [1.0.0] - 2024-01-15` ✓
- `## [1.0.0] - January 15, 2024` ✗
- `## [1.0.0] - 15/01/2024` ✗

## Yanked Releases

Mark yanked (withdrawn) releases with `[YANKED]`:

```markdown
## [1.0.1] - 2024-01-16 [YANKED]
```

## Pre-release Versions

Use SemVer pre-release identifiers:

```markdown
## [2.0.0-alpha.1] - 2024-02-01
## [2.0.0-beta.1] - 2024-02-15
## [2.0.0-rc.1] - 2024-02-28
## [2.0.0] - 2024-03-01
```

## Breaking Changes

Highlight breaking changes prominently:

```markdown
### Changed
- **BREAKING:** Rename `config.timeout` to `config.requestTimeout`
- **BREAKING:** Remove support for Node.js 14
```

## Issue/PR References

Include references to issues or PRs when helpful:

```markdown
### Fixed
- Fix login redirect loop ([#123](https://github.com/user/repo/issues/123))
- Fix data export timeout ([#456](https://github.com/user/repo/pull/456))
```

## Multiple Contributors

Credit contributors when appropriate:

```markdown
### Added
- Add dark mode support (thanks @contributor)
```
