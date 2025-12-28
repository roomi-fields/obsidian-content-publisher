# Supported Platforms

Content Publisher supports publishing your Obsidian notes to multiple platforms. Each platform has its own configuration and frontmatter fields.

## Substack

### Setup

1. Go to Settings → Content Publisher → Authentication
2. Click "Login" to authenticate with your Substack account
3. Click "Refresh" to fetch your publications and sections

### Frontmatter Fields

```yaml
---
title: "My Article Title"
subtitle: "A compelling subtitle"
tags:
  - tag1
  - tag2
audience: everyone  # everyone | only_paid | only_free | founding
section: 12345      # Section ID (optional)
---
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Article title (defaults to filename) |
| `subtitle` | string | Article subtitle/description |
| `tags` | array | List of tags |
| `audience` | string | `everyone`, `only_paid`, `only_free`, `founding` |
| `section` | number | Section ID for categorization |

### Features

- Automatic Substack login (desktop only)
- Multi-publication support
- Local image upload to Substack CDN
- Markdown conversion (headers, lists, code blocks, etc.)
- Save as draft or publish directly
- Optional WordPress link in footer

---

## WordPress

### Setup

1. Go to Settings → Content Publisher → WordPress
2. Enable WordPress publishing
3. Add one or more WordPress servers:
   - **Name**: Friendly name (e.g., "Production", "Staging")
   - **Base URL**: Your WordPress site URL
   - **Username**: WordPress username
   - **Password**: Application password (not your login password)
4. Click "Fetch from WP" to auto-populate categories

#### Creating an Application Password

1. Go to your WordPress admin → Users → Profile
2. Scroll to "Application Passwords"
3. Enter a name (e.g., "Obsidian") and click "Add New"
4. Copy the generated password

### Frontmatter Fields

```yaml
---
title: "My Article Title"
subtitle: "Article subtitle"
categorie: philo-psycho    # WordPress category slug
slug: my-custom-url-slug
excerpt: "Meta description for SEO"
tags:
  - tag1
  - tag2
focus_keyword: "main keyword"
enluminure: _Assets/image.png  # Featured image
---
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Article title (defaults to filename) |
| `subtitle` | string | Extracted from first H3 if not specified |
| `categorie` | string | WordPress category slug |
| `slug` | string | Custom URL slug |
| `excerpt` | string | Meta description (used for SEO) |
| `tags` | array | WordPress tags (created if not exist) |
| `focus_keyword` | string | Rank Math SEO focus keyword |
| `enluminure` | string | Path to featured/header image |

### SEO Integration (Rank Math)

If you have Rank Math SEO plugin installed, the following fields are automatically populated:

- `rank_math_focus_keyword` ← from `focus_keyword`
- `rank_math_description` ← from `excerpt`
- `rank_math_facebook_image` ← from `enluminure` (uploaded image URL)

### Features

- Multi-server support (production, staging, etc.)
- Server selector in publish modal
- Auto-fetch categories from WordPress
- Tags support (lookup or create)
- Local image upload to WordPress media library
- Wikilink conversion to WordPress internal links
- Create or update existing articles (by title match)
- Rank Math SEO meta integration

---

## Cross-Platform Workflow

A typical workflow for cross-posting:

1. Write your article in Obsidian with frontmatter
2. Publish to WordPress first (to get `wordpress_url`)
3. Publish to Substack with "Add WordPress link" enabled

### Example Frontmatter (Multi-Platform)

```yaml
---
title: "My Article"
subtitle: "A great article about something"
excerpt: "This is the meta description for SEO"

# Substack
audience: everyone
tags:
  - philosophy
  - psychology

# WordPress
categorie: philo-psycho
slug: my-article-slug
focus_keyword: "main topic"
enluminure: _Assets/Enluminures/header-image.png

# Auto-populated after first publish
wordpress_url: https://example.com/my-article/
substack_url: https://yourname.substack.com/p/my-article
substack_draft_id: 123456789
---
```

---

## LinkedIn

### Setup

1. Go to Settings → Content Publisher → LinkedIn
2. Enable LinkedIn publishing
3. Follow the **Setup guide** displayed in settings:
   - Create a LinkedIn app in the Developer Portal (requires a Company Page)
   - Request "Share on LinkedIn" and "Sign In with LinkedIn" products
   - Use Postman to complete OAuth2 flow and get your access token
   - Get your Person ID from the `/v2/userinfo` endpoint
4. Click "Test connection" to verify

### Frontmatter Fields

```yaml
---
title: "My Article Title"
excerpt: "Article description for the post"
wordpress_url: https://example.com/my-article/  # Auto-used for Shared Article
substack_url: https://you.substack.com/p/article  # Fallback if no wordpress_url
---
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Used in article link preview |
| `excerpt` | string | Description for article link |
| `wordpress_url` | string | URL for Shared Article (priority) |
| `substack_url` | string | Fallback URL if no wordpress_url |

### Post Types

| Type | Description |
|------|-------------|
| **Text Post** | Plain text only (no link preview) |
| **Shared Article** | Text + article link with preview card |

When `wordpress_url` or `substack_url` exists in frontmatter, "Shared Article" is auto-selected.

### Features

- Text posts and shared article posts with link preview
- Auto-select article type when URL in frontmatter
- Editable preview before publishing (3000 character limit)
- Draft support (save as draft)
- Bilingual FR/EN support
- Character counter with warnings
