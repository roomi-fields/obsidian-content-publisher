---
name: release
description: Automates the complete release process for this Obsidian plugin. This skill should be used when the user requests to publish a new version, bump version numbers, sync versions across files, update changelog, build, tag, and publish to GitHub.
---

# Release Management Skill - Obsidian Plugin

## Overview

This skill automates the complete release workflow for this Obsidian plugin, ensuring consistent versioning, changelog updates, and proper publication to GitHub.

**IMPORTANT**: This project uses **manual releases** (not automated CI). The GitHub Actions release workflow is disabled to avoid conflicts.

## Project Structure

Files that need version updates:

- `package.json` - Source of truth for version (ALWAYS update first)
- `manifest.json` - Obsidian plugin manifest (MUST match package.json)
- `versions.json` - Obsidian version compatibility mapping
- `CHANGELOG.md` - Release history

## Pre-Release Checklist

Before starting a release:

1. Ensure all tests pass: `npm test`
2. Ensure build succeeds: `npm run build`
3. Ensure working directory is clean: `git status`
4. Ensure you're on the master branch: `git branch --show-current`

## Release Workflow

### 1. Determine Version Bump

Follow semantic versioning (SemVer):

- **MAJOR** (x.0.0): Breaking changes, incompatible API changes
- **MINOR** (0.x.0): New features, backward compatible
- **PATCH** (0.0.x): Bug fixes, backward compatible

### 2. Update Versions

Update version in ALL these files:

- `package.json`
- `manifest.json`
- `versions.json` (add new entry if minAppVersion changes)

### 3. Update CHANGELOG.md

Add a new section at the top:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added

- New features

### Changed

- Changes in existing functionality

### Fixed

- Bug fixes
```

### 4. Build and Test

```bash
npm run build
npm test
```

### 5. Commit and Tag

**Tag = exact manifest version, NO `v` prefix** (e.g. `2.4.1`). The Obsidian community
directory requires a release whose tag equals `manifest.json` version.

```bash
git add package.json package-lock.json manifest.json versions.json CHANGELOG.md
git commit -m "chore: release X.Y.Z"
git tag -a X.Y.Z -m "Release X.Y.Z"
```

### 6. Push to GitHub

```bash
git push origin master
git push origin X.Y.Z
```

### 7. Create GitHub Release (MANUAL)

**IMPORTANT**: Create the release manually with `gh` CLI. Do NOT rely on GitHub Actions.

```bash
gh release create X.Y.Z \
  --repo roomi-fields/obsidian-content-publisher \
  --title "X.Y.Z" --latest \
  --notes "Release notes here..." \
  main.js manifest.json styles.css
```

The release MUST include these files as assets:

- `main.js` - Compiled plugin code
- `manifest.json` - Plugin manifest
- `styles.css` - Plugin styles

### 8. Deploy to Vault (D:\Obsidian\Articles on PC1)

```bash
cp main.js manifest.json styles.css /mnt/pc1/Obsidian/Articles/.obsidian/plugins/content-publisher/
```

Then reload the plugin in Obsidian (disable + enable).

## Troubleshooting

### Release already exists

If creating a release fails because it already exists:

```bash
# Delete existing release
gh release delete X.Y.Z --repo roomi-fields/obsidian-content-publisher --yes

# Delete and recreate tag
git tag -d X.Y.Z
git push origin :refs/tags/X.Y.Z
git tag -a X.Y.Z -m "Release X.Y.Z"
git push origin X.Y.Z

# Create release again
gh release create X.Y.Z ...
```

### Tag already exists

```bash
git tag -d X.Y.Z
git push origin :refs/tags/X.Y.Z
```

### Version mismatch

Always update ALL version files:

- package.json
- manifest.json
- versions.json

## Why Manual Releases?

The GitHub Actions release workflow (`.github/workflows/release.yml`) is **disabled** because:

1. We create releases manually with specific release notes
2. Automated releases would conflict with manually created ones
3. Manual control allows better release note customization

To re-enable automated releases, edit `.github/workflows/release.yml` and uncomment the `on: push: tags:` section.
