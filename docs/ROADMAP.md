# Roadmap - Obsidian Substack Publisher

## v1.0.0 ✅ (Current) - MVP

- [x] Automatic Substack login (desktop only)
- [x] Session cookie capture via Electron BrowserWindow
- [x] Multi-publication support
- [x] Markdown → Substack JSON conversion
  - Headers (h1-h6)
  - Paragraphs with inline formatting (bold, italic, code, links)
  - Ordered/unordered lists
  - Code blocks with language
  - Blockquotes
  - Images (external URLs)
  - Horizontal rules
- [x] Publication modal with preview
- [x] Save as Draft / Publish directly
- [x] Clear error messages (session expired, publication not found, etc.)

---

## v1.1.0 - Image Upload (Priority)

- [ ] Upload local images to Substack CDN
- [ ] Support embedded images `![alt](path/to/image.png)`
- [ ] Auto-convert local paths → Substack URLs
- [ ] Cover image support
- [ ] Supported formats: PNG, JPG, GIF, WebP

## v1.2.0 - UX Improvements

- [ ] Audience selector (everyone, paid only, free only, founding)
- [ ] Confirmation before direct publish
- [ ] Post link display after publication
- [ ] Progress bar during upload
- [ ] Clickable success notification with link

## v1.3.0 - Draft Management

- [ ] List existing drafts
- [ ] Update existing draft (instead of creating new)
- [ ] Delete drafts
- [ ] Link note ↔ draft via frontmatter

## v1.4.0 - Metadata

- [ ] YAML frontmatter support for metadata
  - `title`, `subtitle`, `audience`
  - `tags`, `section`
  - `scheduled_date` (scheduled publishing)
- [ ] Auto-extract title from H1 or frontmatter

---

## v2.0.0 - Advanced Features

- [ ] WYSIWYG preview (side by side)
- [ ] Post templates
- [ ] Publishing statistics (views, likes, comments)
- [ ] Scheduled newsletters support
- [ ] Paywall marker in Markdown (`<!-- paywall -->`)

---

## Backlog (Unprioritized)

- [ ] Substack podcast support
- [ ] Import Substack posts → Obsidian
- [ ] Reverse conversion (Substack JSON → Markdown)
- [ ] Footnotes support
- [ ] Markdown tables support
- [ ] Integration with other platforms (Medium, Ghost, etc.)
- [ ] Offline mode with publish queue
- [ ] Publication history in dedicated note

---

## Known Limitations

- Unofficial Substack API (may change without notice)
- Cookie expires after ~30 days
- No OAuth support (Substack doesn't offer it)
- Image upload not yet supported (v1.0)
