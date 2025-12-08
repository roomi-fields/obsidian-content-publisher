# WordPress Link Footer Feature - Implementation Summary

## Overview
Added an option to include a WordPress link in the footer of Substack articles when publishing from Obsidian.

## Changes Made

### 1. Type Definitions (src/substack/types.ts)
- Added `wordpress_url?: string` to `SubstackFrontmatter` interface

### 2. Plugin Settings (main.ts)
- Added `defaultAddWordPressLink: boolean` to `SubstackPublisherSettings` interface
- Added default value `false` in `DEFAULT_SETTINGS`
- Added settings UI toggle: "Add WordPress link by default"
- Updated composer initialization to pass the new default

### 3. Post Composer (src/substack/PostComposer.ts)
- Added `defaultAddWordPressLink: boolean` to `PostComposerDefaults` interface
- Added private field `addWordPressLink: boolean` to track checkbox state
- Updated constructor to initialize `addWordPressLink` from defaults
- Updated `loadFrontmatter()` to read `wordpress_url` from frontmatter
- Added checkbox UI in `onOpen()` method:
  - Only visible when `wordpress_url` exists in frontmatter
  - Uses Obsidian's `Setting` component with toggle
  - Label: "Add WordPress link in footer"
  - Description: "Include a link to the WordPress version of this article"
- Modified `getMarkdownContent()` to append footer:
  - Checks if `addWordPressLink` is true AND `wordpress_url` exists
  - Appends formatted footer with link to WordPress article
  - Footer format: `\n\n---\n\n📖 Lire cet article sur mon site : [Mon Site](url)`

## Usage

### For Users
1. Add `wordpress_url` to your note's frontmatter:
   ```yaml
   ---
   title: My Article
   wordpress_url: https://example.com/my-article
   ---
   ```

2. When publishing to Substack:
   - The "Add WordPress link in footer" checkbox will appear
   - Check it to include the WordPress link in the article footer
   - The checkbox state defaults to the plugin setting value

### For Developers
The feature follows the existing pattern:
- Frontmatter is read during modal initialization
- UI elements are conditionally shown based on frontmatter
- Content processing happens in `getMarkdownContent()`
- Settings provide sensible defaults

## Testing
1. Build: `npm run build` ✅
2. Lint: `npm run lint` (no new errors) ✅
3. Test file created: `test-files/test-wordpress-link.md`

## Files Modified
- `src/substack/types.ts` - Added wordpress_url to frontmatter type
- `main.ts` - Added setting and default value
- `src/substack/PostComposer.ts` - Added checkbox UI and footer logic

## Files Created
- `test-files/test-wordpress-link.md` - Test file with wordpress_url
- `IMPLEMENTATION_SUMMARY.md` - This document
