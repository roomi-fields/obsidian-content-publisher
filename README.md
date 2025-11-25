<div align="center">

# Obsidian Substack Publisher

**Publish your Obsidian notes directly to Substack**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.0+-purple.svg)](https://obsidian.md/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/github/stars/roomi-fields/obsidian-substack?style=social)](https://github.com/roomi-fields/obsidian-substack)

[Installation](#installation) • [Setup](#setup) • [Usage](#usage) • [Roadmap](./docs/ROADMAP.md)

</div>

---

## ✨ Features

- **🔐 One-Click Login** — Automatic Substack authentication (desktop only)
- **📝 Draft & Publish** — Save as draft or publish immediately
- **📚 Multi-Publication** — Manage multiple Substack publications
- **🔄 Markdown Conversion** — Full conversion to Substack format

### Supported Markdown

| Element | Status |
|---------|--------|
| Headers (H1-H6) | ✅ |
| Bold, Italic, Links | ✅ |
| Ordered/Unordered Lists | ✅ |
| Code Blocks | ✅ |
| Blockquotes | ✅ |
| Horizontal Rules | ✅ |
| Images (URLs) | ✅ |
| Images (Local) | 🔜 v1.1 |
| Tables | ❌ |

---

## 📦 Installation

### From Community Plugins (Coming Soon)

1. Open **Settings → Community plugins**
2. Search for "Substack Publisher"
3. Install and enable

### Manual Installation

1. Download `main.js`, `manifest.json`, `styles.css` from [latest release](https://github.com/roomi-fields/obsidian-substack/releases)
2. Create folder: `.obsidian/plugins/obsidian-substack/`
3. Copy files into the folder
4. Restart Obsidian → Enable plugin

---

## 🔧 Setup

### 1. Login to Substack

<details>
<summary><strong>Desktop (Recommended)</strong></summary>

1. Open plugin settings
2. Click **"Login"** button
3. Sign in to Substack in the popup
4. Cookie captured automatically ✅

</details>

<details>
<summary><strong>Mobile / Manual</strong></summary>

1. Log in to Substack in your browser
2. Open DevTools (F12) → Application → Cookies
3. Copy `substack.sid` cookie value
4. Paste in plugin settings

</details>

### 2. Add Publications

1. Go to plugin settings
2. Enter publication subdomain(s)
   - Example: `myname` for `myname.substack.com`
   - Multiple: `pub1, pub2, pub3`

---

## 🚀 Usage

1. **Open** any Markdown note
2. **Click** the ribbon icon (📤) or use command palette: `Publish to Substack`
3. **Review** title and subtitle
4. **Select** publication
5. **Choose** "Save as Draft" or "Publish"

```
Your Note → Plugin converts → Substack Draft/Post
```

---

## 🔒 Privacy & Security

- ✅ Credentials stored **locally** in your vault
- ✅ **No telemetry** or data collection
- ✅ Cookie-based auth (no passwords stored)
- ✅ Open source — audit the code yourself

---

## 🐛 Troubleshooting

| Error | Solution |
|-------|----------|
| "Session expired" | Re-login via Settings → Login |
| "Publication not found" | Check subdomain spelling |
| Plugin not loading | Enable in Community plugins, restart Obsidian |

---

## 📋 Roadmap

See [ROADMAP.md](./docs/ROADMAP.md) for planned features.

**Coming soon:**
- 🖼️ **v1.1** — Local image upload
- 🎯 **v1.2** — Audience selector (free/paid)
- 📑 **v1.3** — Draft management

---

## 🙏 Credits

Built upon these open-source projects:

- [obsidian-content-os](https://github.com/eharris128/obsidian-content-os) by @eharris128
- [substack-mcp-plus](https://github.com/ty13r/substack-mcp-plus) by @ty13r
- [python-substack](https://github.com/ma2za/python-substack) by @ma2za

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) for details.

---

## 📄 License

MIT License — See [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Found a bug? Have an idea? [Open an issue](https://github.com/roomi-fields/obsidian-substack/issues) or submit a PR!

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

<div align="center">

**⚠️ Disclaimer**: This plugin uses unofficial Substack API. Not affiliated with Substack.

⭐ [Star on GitHub](https://github.com/roomi-fields/obsidian-substack) if this helps you!

</div>
