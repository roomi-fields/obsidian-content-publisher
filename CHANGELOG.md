# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.1] - 2026-02-27

### Fixed

- Address all Obsidian Community Plugin Store review issues (88 sentence case violations, inline styles, fetch/requestUrl, async onOpen, console statements, vault.delete, undescribed directives, unused imports)
- ESLint config updated with custom brands/acronyms for sentence case rule
- Replace all inline styles with CSS classes for better theming
- Refactor Modal.onOpen() to void wrapper pattern in all PostComposer modals

## [2.2.0] - 2025-12-28

### Added

- **LinkedIn Publishing** — Full LinkedIn integration
  - Text posts and shared article posts with link preview
  - Auto-select "Shared Article" when `wordpress_url` or `substack_url` exists in frontmatter
  - Editable preview before publishing (3000 character limit)
  - Draft support (save as draft before publishing)
  - Bilingual FR/EN support
  - Step-by-step OAuth setup guide in settings with Postman instructions
  - Test connection validates Person ID

### Changed

- LinkedIn post preview is now editable before publishing
- Blockquotes (`>`) preserved as-is in LinkedIn posts
- Settings opens external links in system default browser

### Fixed

- LinkedIn Person ID validation in test connection
- Article URL auto-population from frontmatter

## [1.2.0] - 2025-11-29

### Added

- **YAML frontmatter support** - Set `title`, `subtitle`, `audience`, `tags`, and `section` in frontmatter
- **Audience selector** - Target everyone, paid-only, free-only, or founding members
- **Tags support** - Add tags via frontmatter or modal input
- **Sections support** - Select publication sections (auto-fetched from Substack)
- **Auto-detect paid subscriptions** - Paid subscription status fetched from publication settings
- **Default settings** - Configure default publication, section, audience, and tags in settings
- **Refresh button** - Fetch publications and sections from Substack with one click

### Changed

- Settings UI reorganized with Authentication, Defaults, and Advanced sections
- Ribbon icon now positioned at bottom of ribbon
- Test coverage improved to 43.65% (173 tests)

### Fixed

- ESLint sentence-case compliance for all UI text
- Removed unused imports and debug code

## [1.1.0] - 2025-11-27

### Added

- **Local image upload** - Images in your notes are now automatically uploaded to Substack CDN
- Support for PNG, JPG, JPEG, GIF, WebP formats
- Automatic path resolution (relative paths, parent directories, absolute vault paths)
- ImageHandler class for processing and uploading images
- 41 new tests for image upload functionality (161 total)

### Changed

- API now uses base64 data URI format for image uploads
- Logger interface extracted for better type safety
- Test coverage improved to 52.7%

### Fixed

- Image upload endpoint corrected to `/api/v1/image`

## [1.0.7] - 2025-11-27

### Added

- Codecov integration for coverage tracking in CI
- CI workflow now uploads coverage reports to Codecov
- README badges for CI status and Codecov coverage
- Prettier and type-coverage dev dependencies
- 36 new unit tests (84 → 120 total tests)

### Changed

- Test coverage improved from 38% to 47%
- api.ts now has 100% test coverage
- logger.ts now has 83% test coverage
- ESLint config updated to support .cjs/.mjs files and test files

### Fixed

- ESLint errors in Node.js build scripts (console, __dirname globals)
- Security vulnerabilities in dependencies (npm audit fix)
- Code formatting with Prettier

## [1.0.6] - 2025-11-26

### Fixed

- Fix placeholder to start with capital letter (sentence case)
- Fix author text to use sentence case format
- Add eslint-plugin-obsidianmd for local validation

## [1.0.5] - 2025-11-26

### Fixed

- Fix placeholder text to use simple word without hyphen
- Fix author credit to start with capital letter (sentence case)

## [1.0.4] - 2025-11-26

### Fixed

- Use lowercase "substack" in all UI text (sentence case requirement)
- Add description to eslint-disable comment explaining its purpose
- Remove async from login() method (no await expressions needed)
- Simplify notice messages (remove brand name where unnecessary)
- Update placeholders to be more generic

## [1.0.3] - 2025-11-26

### Fixed

- Add eslint-disable comment for Electron window.require (required for desktop plugins)
- Add proper TypeScript interfaces for Electron types
- Add session validation before use in auth flow
- Remove unused requestUrl import
- Remove exclamation marks from notice messages
- Handle promises with void operator instead of async callbacks

## [1.0.2] - 2025-11-26

### Fixed

- Remove all console.\* calls from logger (write to file only)
- Remove all eslint-disable comments
- Use sentence case for all UI text
- Simplify settings headings (remove redundant words)
- Fix async method signatures

## [1.0.1] - 2025-11-26

### Fixed

- Use sentence case for UI text per Obsidian guidelines
- Replace inline styles with CSS classes for better theming
- Use `Setting().setHeading()` instead of raw HTML headings
- Add proper eslint-disable descriptions
- Fix promise handling in async callbacks
- Add eslint exception for Electron require() import

## [1.0.0] - 2025-01-26

### Added

- **Substack Authentication**
  - Automatic login via Electron BrowserWindow (desktop only)
  - Session cookie capture after user authentication
  - Manual cookie entry as fallback

- **Publishing Features**
  - Create drafts from Obsidian notes
  - Publish posts directly to Substack
  - Multi-publication support
  - Title and subtitle editing

- **Markdown Conversion**
  - Headers (H1-H6)
  - Paragraphs with inline formatting (bold, italic)
  - Links
  - Ordered and unordered lists
  - Code blocks and inline code
  - Blockquotes
  - Horizontal rules

- **User Interface**
  - Post composer modal
  - Publication selector
  - Content preview
  - Draft/Publish buttons
  - Clear error messages

- **Developer Features**
  - Dev mode with configurable log levels
  - TypeScript with strict typing
  - ESLint configuration
  - Vitest test setup

### Credits

Built upon open-source projects:

- [obsidian-content-os](https://github.com/eharris128/obsidian-content-os) by @eharris128
- [substack-mcp-plus](https://github.com/ty13r/substack-mcp-plus) by @ty13r
- [python-substack](https://github.com/ma2za/python-substack) by @ma2za

---

[2.2.0]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v2.2.0
[1.2.0]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v1.2.0
[1.1.0]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v1.1.0
[1.0.7]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v1.0.7
[1.0.6]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v1.0.6
[1.0.5]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v1.0.5
[1.0.4]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v1.0.4
[1.0.3]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v1.0.3
[1.0.2]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v1.0.2
[1.0.1]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v1.0.1
[1.0.0]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v1.0.0
