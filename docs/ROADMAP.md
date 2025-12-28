# Roadmap - Obsidian Content Publisher

## Released

### v2.2.0 ✅ (2025-12-28)
- [x] **LinkedIn Publishing**
  - Text posts and shared article posts
  - Auto-select "Shared Article" when URL in frontmatter
  - Editable preview (3000 char limit)
  - Draft support
  - Bilingual FR/EN support
  - Step-by-step OAuth setup guide in settings
  - Test connection validates Person ID

### v2.1.0 ✅ (2025-12-12)
- [x] **Drop Cap Images (Enluminures)** for WordPress
- [x] Wikilinks conversion to WordPress internal links
- [x] Improved image handling

### v2.0.0 ✅ (2025-12-05)
- [x] **WordPress Multi-Server** support
- [x] **Polylang Bilingual** publishing (FR/EN)
- [x] Server selector in publish modal
- [x] Category mappings per language

### v1.2.0 ✅
- [x] YAML frontmatter support (`title`, `subtitle`, `audience`, `tags`, `section`)
- [x] Audience selector (everyone, paid only, free only, founding)
- [x] Tags support via frontmatter and modal input
- [x] Section support (fetched from publication)
- [x] Default settings for publication, section, audience, tags

### v1.1.0 ✅
- [x] Upload local images to Substack CDN
- [x] Support embedded images
- [x] Auto-convert local paths → Substack URLs

### v1.0.x ✅
- [x] Automatic Substack login (desktop only)
- [x] Multi-publication support
- [x] Markdown → Substack JSON conversion
- [x] Save as Draft / Publish directly
- [x] CI/CD with GitHub Actions

---

## Planned

### v2.3.0 - Enhancements
- [ ] Cover image support for Substack
- [ ] Post link display after publication
- [ ] Update existing draft via frontmatter link

### Future
- [ ] Scheduled publishing
- [ ] Paywall marker in Markdown
- [ ] Medium/Ghost integration
- [ ] Substack podcast support

---

## Backlog

### WordPress
- [ ] og:image via Rank Math improvements

### Substack
- [ ] Import Substack posts → Obsidian
- [ ] Footnotes support
- [ ] Markdown tables support

---

## Known Limitations

- Unofficial Substack API (may change without notice)
- Substack cookie expires after ~30 days
- LinkedIn tokens expire (need refresh)
