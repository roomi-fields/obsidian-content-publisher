# Analysis: Power Features Code Isolation

Date: 2024-12-12

## Context

Before publishing to the community, we analyzed how well the "power user" features (Drop Cap Images and Bilingual Publishing) are isolated from the core plugin code.

## Features Analyzed

### 1. Drop Cap Images (Enluminure)

**Purpose:** Add decorative initial images (medieval manuscript style) to WordPress posts.

**Trigger:** Image path contains "enluminure" OR frontmatter has `enluminure:` field.

#### Code Distribution

| File | Role | Lines | Isolation |
|------|------|-------|-----------|
| `wordpress/types.ts` | Type definitions (`WordPressEnluminureInfo`) | ~15 | Good - just types |
| `wordpress/imageHandler.ts` | Detection + upload + processing | ~150 | Medium - interleaved with image handling |
| `wordpress/PostComposer.ts` | HTML generation (`generateEnluminureHtml`) + integration | ~100 | Medium - spread across multiple methods |
| `substack/imageHandler.ts` | Detection to SKIP (not supported on Substack) | ~30 | Good - isolated skip logic |
| `substack/types.ts` | Type definitions | ~10 | Good - just types |

**Total:** ~305 lines across 5 files

#### Key Functions
- `detectEnluminure()` - Pattern matching for image paths
- `processEnluminureFromFrontmatter()` - Handle frontmatter specification
- `generateEnluminureHtml()` - Generate WordPress HTML structure

#### Isolation Assessment: **MEDIUM**
The enluminure logic is spread across multiple files and interleaved with core image handling. Extracting it would require:
- Creating a dedicated `enluminureHandler.ts`
- Refactoring `imageHandler.ts` to use composition
- ~2-3 hours of work

---

### 2. Bilingual Publishing (Polylang)

**Purpose:** Publish FR/EN versions simultaneously with Polylang WordPress plugin.

**Trigger:** Content contains both 🇫🇷 and 🇬🇧 callouts AND Polylang enabled in settings.

#### Code Distribution

| File | Role | Lines | Isolation |
|------|------|-------|-----------|
| `wordpress/bilingualParser.ts` | Core parsing logic | ~220 | **Excellent - dedicated file** |
| `wordpress/types.ts` | Types (`BilingualContent`, `PolylangLanguage`, `PolylangConfig`) | ~40 | Good - just types |
| `wordpress/PostComposer.ts` | `saveBilingualToWordPress()` method | ~200 | Medium - large but contained method |
| `linkedin/PostComposer.ts` | Language selector UI | ~50 | Good - isolated section |
| `main.ts` | Polylang settings UI | ~50 | Good - dedicated section |

**Total:** ~560 lines across 5 files

#### Key Functions
- `parseBilingualContent()` - Parse callout syntax
- `isBilingualContent()` - Detection helper
- `saveBilingualToWordPress()` - Dual-post creation with Polylang linking

#### Isolation Assessment: **GOOD**
The bilingual parser is well-isolated in its own file. The integration points are clearly defined. Extracting to a separate module would be straightforward.

---

## Recommendations

### Short Term (Current Approach)
- Document features as "Advanced Features" in README
- Features are opt-in by design (pattern detection)
- No code changes required

### Medium Term (Backlog)
- Add settings toggles: `enableDropCapImages`, `enableBilingualPublishing`
- Wrap feature code in conditional checks
- ~30 lines of changes

### Long Term (If Needed)
- Extract enluminure logic to dedicated `enluminureHandler.ts`
- Create `powerFeatures/` directory structure
- Full separation with dependency injection
- ~4-6 hours of refactoring

---

## Decision

**Chosen approach:** Short Term - Document and publish as-is.

**Rationale:**
1. Features are already opt-in (no effect unless specific patterns used)
2. No negative impact on users who don't use these features
3. Code is maintainable in current state
4. Community benefit outweighs perfect isolation

---

## Related

- [BACKLOG.md](./BACKLOG.md) - "Isolate Power Features" item added
- [README.md](../README.md) - Advanced Features section added
