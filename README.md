<div align="center">

# Obsidian Content Publisher

**Publish your Obsidian notes to multiple platforms: Substack, WordPress, and more**

<!-- Badges -->
[![CI](https://github.com/roomi-fields/obsidian-content-publisher/actions/workflows/ci.yml/badge.svg)](https://github.com/roomi-fields/obsidian-content-publisher/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/roomi-fields/obsidian-content-publisher/branch/master/graph/badge.svg)](https://codecov.io/gh/roomi-fields/obsidian-content-publisher) [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/) [![Obsidian](https://img.shields.io/badge/Obsidian-1.0+-purple.svg)](https://obsidian.md/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Node.js](https://img.shields.io/badge/Node.js->=18-green.svg)](https://nodejs.org/)
<!-- End Badges -->

[Installation](#installation) • [Platforms](./docs/PLATFORMS.md) • [Usage](#usage) • [Roadmap](./docs/ROADMAP.md)

</div>

---

## Supported Platforms

| Platform | Status | Features |
|----------|--------|----------|
| **Substack** | ✅ | Draft/publish, images, audience targeting, sections |
| **WordPress** | ✅ | Multi-server, categories, tags, Rank Math SEO, Polylang |
| **LinkedIn** | 🚧 | Coming soon |

See [PLATFORMS.md](./docs/PLATFORMS.md) for detailed setup and frontmatter documentation.

---

## Features

### Substack
- **One-Click Login** — Automatic Substack authentication (desktop only)
- **Draft & Publish** — Save as draft or publish immediately
- **Multi-Publication** — Manage multiple Substack publications
- **Audience Control** — Target everyone, paid-only, free-only, or founding members
- **Tags & Sections** — Organize posts with tags and publication sections

### WordPress
- **Multi-Server** — Configure multiple WordPress sites (production, staging, etc.)
- **Server Selector** — Choose which server to publish to
- **Categories & Tags** — Auto-fetch categories, create tags on the fly
- **SEO Integration** — Rank Math meta fields support
- **Wikilinks** — Automatic conversion to WordPress internal links
- **Drop Cap Images** — Decorative initial images (see [Advanced Features](#advanced-features))
- **Bilingual Publishing** — FR/EN with Polylang (see [Advanced Features](#advanced-features))

### General
- **Markdown Conversion** — Full conversion to platform formats
- **Image Upload** — Local images auto-uploaded to platform CDN
- **Frontmatter Support** — Configure per-post settings via YAML
- **Cross-Platform** — Publish to WordPress first, then Substack with link

---

## Installation

### From Community Plugins (Coming Soon)

1. Open **Settings → Community plugins**
2. Search for "Content Publisher"
3. Install and enable

### Manual Installation

1. Download `main.js`, `manifest.json`, `styles.css` from [latest release](https://github.com/roomi-fields/obsidian-content-publisher/releases)
2. Create folder: `.obsidian/plugins/content-publisher/`
3. Copy files into the folder
4. Restart Obsidian → Enable plugin

---

## Quick Start

### Substack

1. Go to **Settings → Content Publisher → Authentication**
2. Click **"Login"** to authenticate with Substack
3. Click **"Refresh"** to fetch your publications

### WordPress

1. Go to **Settings → Content Publisher → WordPress**
2. Enable WordPress publishing
3. Add a server with your WordPress URL and [Application Password](./docs/PLATFORMS.md#creating-an-application-password)
4. Click **"Fetch from WP"** to load categories

---

## Usage

1. **Open** any Markdown note
2. **Add frontmatter** (optional) for platform-specific settings
3. **Click** the ribbon icon or use command palette
4. **Select** platform and options
5. **Publish** or save as draft

See [PLATFORMS.md](./docs/PLATFORMS.md) for frontmatter examples and platform-specific options.

---

## Advanced Features

These optional features activate automatically when specific patterns are detected in your content.

### Drop Cap Images (WordPress)

Add decorative initial images (medieval manuscript style) to your WordPress posts. The image floats left as a visual drop cap while the first letter remains in the HTML for SEO.

**Usage:** Name your image file with `enluminure` in the path:

```markdown
![[Assets/enluminure-A.png]]

Your article content starts here...
```

Or specify in frontmatter:

```yaml
---
enluminure: Assets/drop-caps/letter-A.png
---
```

The image will be:
- Uploaded to WordPress
- Positioned as a floating drop cap (200px max-width)
- Set as the featured image and Open Graph image (Rank Math)
- Removed from inline content to avoid duplication

> **Note:** This feature only activates when "enluminure" appears in an image path. Regular images are unaffected.

### Bilingual Publishing (WordPress + Polylang)

Publish French and English versions of your content simultaneously using the [Polylang](https://polylang.pro/) plugin.

**1. Enable in Settings:**
- Go to WordPress server settings
- Enable "Polylang" in the Multilingual section
- Configure category mappings for each language

**2. Write bilingual content using callouts:**

```markdown
> [!info]- 🇫🇷 Titre français
> Votre contenu en français ici.
>
> Plusieurs paragraphes sont supportés.

> [!info]- 🇬🇧 English Title
> Your English content here.
>
> Multiple paragraphs are supported.
```

**3. Publish:** The plugin will create two linked WordPress posts (one FR, one EN) with proper Polylang language tags.

> **Note:** This feature only activates when both 🇫🇷 and 🇬🇧 callouts are present and Polylang is enabled.

---

## Privacy & Security

- Credentials stored **locally** in your vault
- **No telemetry** or data collection
- WordPress uses [Application Passwords](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) (not your login)
- Open source — audit the code yourself

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| "Session expired" (Substack) | Re-login via Settings → Login |
| "Publication not found" | Check subdomain spelling |
| "401 Unauthorized" (WordPress) | Check Application Password |
| Plugin not loading | Enable in Community plugins, restart Obsidian |

---

## Roadmap

See [ROADMAP.md](./docs/ROADMAP.md) for planned features.

**Coming soon:**
- LinkedIn publishing
- Cover image support
- Scheduled publishing

---

## Credits

Built upon these open-source projects:

- [obsidian-content-os](https://github.com/eharris128/obsidian-content-os) by @eharris128
- [substack-mcp-plus](https://github.com/ty13r/substack-mcp-plus) by @ty13r
- [python-substack](https://github.com/ma2za/python-substack) by @ma2za

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) for details.

---

## License

MIT License — See [LICENSE](LICENSE) for details.

---

## Contributing

Found a bug? Have an idea? [Open an issue](https://github.com/roomi-fields/obsidian-content-publisher/issues) or submit a PR!

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

<div align="center">

**Disclaimer**: This plugin uses unofficial APIs. Not affiliated with Substack or WordPress.

[Star on GitHub](https://github.com/roomi-fields/obsidian-content-publisher) if this helps you!

</div>
