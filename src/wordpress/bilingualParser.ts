/**
 * Parser for bilingual content in Obsidian callout format
 *
 * Expected format:
 * > [!info]- 🇫🇷 Version française
 * > **title:** Mon titre
 * > **subtitle:** Mon sous-titre
 * > **excerpt:** Ma description
 * > **slug:** mon-slug
 * > **focus_keyword:** mot-clé
 * > **tags:** tag1, tag2, tag3
 * > **enluminure:** _Assets/Enluminures/image.png
 * >
 * > ---
 * > # Contenu de l'article...
 *
 * > [!info]- 🇬🇧 English version
 * > **title:** My title
 * > ...
 */

import { BilingualContent, LanguageContent, PolylangLanguage } from "./types";

/**
 * Check if the content contains bilingual callouts
 */
export function isBilingualContent(content: string): boolean {
  // Look for both FR and EN callouts
  const hasFrCallout = />\s*\[!info\][+-]?\s*🇫🇷/i.test(content);
  const hasEnCallout = />\s*\[!info\][+-]?\s*🇬🇧/i.test(content);
  return hasFrCallout && hasEnCallout;
}

/**
 * Parse bilingual content from Obsidian callouts
 * Returns null if content is not bilingual
 */
export function parseBilingualContent(content: string): BilingualContent | null {
  if (!isBilingualContent(content)) {
    return null;
  }

  const frContent = parseLanguageCallout(content, "fr");
  const enContent = parseLanguageCallout(content, "en");

  if (!frContent || !enContent) {
    return null;
  }

  return { fr: frContent, en: enContent };
}

/**
 * Parse a single language callout
 */
function parseLanguageCallout(
  content: string,
  lang: PolylangLanguage
): LanguageContent | null {
  // Match the callout for this language
  const flag = lang === "fr" ? "🇫🇷" : "🇬🇧";
  const otherFlag = lang === "fr" ? "🇬🇧" : "🇫🇷";

  // Find the start of this language's callout
  const calloutRegex = new RegExp(
    `>\\s*\\[!info\\][+-]?\\s*${flag}[^\\n]*\\n`,
    "i"
  );
  const match = content.match(calloutRegex);

  if (!match || match.index === undefined) {
    return null;
  }

  const startIndex = match.index + match[0].length;

  // Find the end of this callout (next callout or end of content)
  const otherCalloutRegex = new RegExp(
    `>\\s*\\[!info\\][+-]?\\s*${otherFlag}`,
    "i"
  );
  const otherMatch = content.slice(startIndex).match(otherCalloutRegex);

  const endIndex = otherMatch?.index
    ? startIndex + otherMatch.index
    : content.length;

  // Extract the callout content
  const calloutContent = content.slice(startIndex, endIndex);

  // Remove the leading "> " from each line (callout quote markers)
  const lines = calloutContent.split("\n");
  const cleanLines = lines.map((line) => {
    // Remove "> " prefix from callout lines
    if (line.startsWith("> ")) {
      return line.slice(2);
    }
    if (line.startsWith(">")) {
      return line.slice(1);
    }
    return line;
  });

  const cleanContent = cleanLines.join("\n").trim();

  // Parse metadata and content
  return parseCalloutContent(cleanContent);
}

/**
 * Parse the content of a single language callout
 * Extracts metadata fields and the actual content
 */
function parseCalloutContent(calloutContent: string): LanguageContent | null {
  const lines = calloutContent.split("\n");

  let title: string | undefined;
  let subtitle: string | undefined;
  let excerpt: string | undefined;
  let slug: string | undefined;
  let focus_keyword: string | undefined;
  let tags: string[] | undefined;
  let enluminure: string | undefined;

  let contentStartIndex = 0;
  let foundSeparator = false;

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    if (currentLine === undefined) continue;

    const line = currentLine.trim();

    // Check for separator (--- or empty line after metadata)
    if (line === "---" || line === "***") {
      foundSeparator = true;
      contentStartIndex = i + 1;
      continue;
    }

    // Parse metadata fields (before separator)
    if (!foundSeparator) {
      const metaMatch = line.match(/^\*\*(\w+):\*\*\s*(.+)$/);
      if (metaMatch && metaMatch[1] && metaMatch[2]) {
        const key = metaMatch[1];
        const value = metaMatch[2];
        switch (key.toLowerCase()) {
        case "title":
          title = value.trim();
          break;
        case "subtitle":
          subtitle = value.trim();
          break;
        case "excerpt":
        case "description":
          excerpt = value.trim();
          break;
        case "slug":
          slug = value.trim();
          break;
        case "focus_keyword":
          focus_keyword = value.trim();
          break;
        case "tags":
          tags = value
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
          break;
        case "enluminure":
          enluminure = value.trim();
          break;
        }
        contentStartIndex = i + 1;
      }
    }
  }

  // Extract the actual content (after metadata and separator)
  const contentLines = lines.slice(contentStartIndex);
  const articleContent = contentLines.join("\n").trim();

  // Title is required
  if (!title) {
    // Try to extract title from first H1 in content
    const h1Match = articleContent.match(/^#\s+(.+)$/m);
    if (h1Match && h1Match[1]) {
      title = h1Match[1];
    }
  }

  if (!title) {
    return null;
  }

  // Build result with only defined optional properties
  const result: LanguageContent = {
    title,
    content: articleContent
  };

  if (subtitle) result.subtitle = subtitle;
  if (excerpt) result.excerpt = excerpt;
  if (slug) result.slug = slug;
  if (focus_keyword) result.focus_keyword = focus_keyword;
  if (tags) result.tags = tags;
  if (enluminure) result.enluminure = enluminure;

  return result;
}

/**
 * Get the content for a specific language from bilingual content
 * Falls back to FR content if the requested language is not available
 */
export function getLanguageContent(
  bilingual: BilingualContent,
  lang: PolylangLanguage
): LanguageContent {
  return lang === "en" ? bilingual.en : bilingual.fr;
}

/**
 * Extract common frontmatter that applies to both languages
 * (category, date, type, etc.)
 */
export function extractCommonFrontmatter(
  frontmatter: Record<string, unknown>
): Record<string, unknown> {
  const commonKeys = ["type", "date", "category", "categorie", "source", "conversation_url"];
  const common: Record<string, unknown> = {};

  for (const key of commonKeys) {
    if (frontmatter[key] !== undefined) {
      common[key] = frontmatter[key];
    }
  }

  return common;
}
