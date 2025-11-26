# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Remove all console.* calls from logger (write to file only)
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

[1.0.3]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v1.0.3
[1.0.2]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v1.0.2
[1.0.1]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v1.0.1
[1.0.0]: https://github.com/roomi-fields/obsidian-substack/releases/tag/v1.0.0
