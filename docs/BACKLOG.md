# Backlog

Future features and improvements for Content Publisher.

## Planned Features

### Wikilinks to WordPress URLs
- Transform Obsidian `[[wikilinks]]` into real WordPress HTML links
- Resolve links using `wordpress_url` from frontmatter of linked files
- Support bidirectional linking: articles ↔ pages, articles ↔ articles, pages ↔ pages
- Output must be plain HTML (no JavaScript interpretation required)

### WordPress Pages Support
- Add ability to publish/update WordPress **pages** (not just posts)
- Allow creating minimal `.md` files for existing WordPress pages (frontmatter only with wordpress_url)

### Schema.org Structured Data
- Add schema.org structured data support (Article, BlogPosting, etc.)

### ActivityPub / Metamask Integration
- Add ActivityPub/Metamask integration for decentralized publishing

### Isolate Power Features
- Add settings toggles: `enableDropCapImages`, `enableBilingualPublishing` (default: true)
- Allow users to disable features they don't need
- See [ANALYSIS-POWERFEATURES-ISOLATION.md](./ANALYSIS-POWERFEATURES-ISOLATION.md) for technical details

## Ideas / To Explore

- Import existing WordPress pages to Obsidian
- Automatic related links based on tags/categories
