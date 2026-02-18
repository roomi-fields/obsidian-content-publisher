import { App, TFile } from "obsidian";
import { WordPressWikiLink } from "./types";
import { ILogger } from "../utils/logger";

/**
 * Converts Obsidian wikilinks to WordPress internal links
 * Uses local Obsidian vault metadata to resolve links via frontmatter wordpress_url
 */
export class WikiLinkConverter {
  private app: App;
  private logger: ILogger;
  private linkCache: Map<string, string>;
  private basePath = "";

  constructor(
    app: App,
    logger: ILogger
  ) {
    this.app = app;
    this.logger = logger;
    this.linkCache = new Map();
  }

  /** Set the publication base directory (limits file search scope to the site root) */
  setBasePath(filePath: string): void {
    // Go up to the site root: file.md → Articles/ → roomi-fields.com/
    const parts = filePath.split("/");
    parts.pop(); // remove filename
    parts.pop(); // remove Articles/
    this.basePath = parts.join("/");
    this.logger.debug(`WikiLink search scope: ${this.basePath}`);
  }

  /**
   * Parse wikilinks from markdown content
   * Matches: [[Link]] or [[Link|Display Text]]
   * Does NOT match image wikilinks: ![[image.png]]
   */
  parseWikiLinks(markdown: string): WordPressWikiLink[] {
    const links: WordPressWikiLink[] = [];

    // Match [[...]] but not ![[...]] (images)
    // Use negative lookbehind to exclude image wikilinks
    const wikiLinkRegex = /(?<!!)\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

    let match;
    while ((match = wikiLinkRegex.exec(markdown)) !== null) {
      const linkText = match[1]?.trim() ?? "";
      const displayText = match[2]?.trim();

      // Skip if this looks like an image reference (has extension)
      if (this.isImageFile(linkText)) {
        continue;
      }

      links.push({
        fullMatch: match[0],
        linkText,
        displayText: displayText || undefined
      });
    }

    return links;
  }

  /**
   * Check if a path looks like an image file
   */
  private isImageFile(path: string): boolean {
    const imageExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".svg",
      ".bmp"
    ];
    const lowerPath = path.toLowerCase();
    return imageExtensions.some((ext) => lowerPath.endsWith(ext));
  }

  /**
   * Find published URL for a wikilink by looking up the target note's frontmatter
   * Uses Obsidian's metadata cache for fast local resolution
   * @param linkText The link text to resolve
   * @param lang Optional language code ('fr' or 'en') for bilingual sites
   */
  findWordPressUrl(linkText: string, lang?: "fr" | "en"): string | null {
    // Check cache first (include lang in cache key)
    const cacheKey = lang ? `${linkText}:${lang}` : linkText;
    if (this.linkCache.has(cacheKey)) {
      return this.linkCache.get(cacheKey) ?? null;
    }

    this.logger.debug(`Resolving wikilink locally: ${linkText} (lang: ${lang || "default"})`);

    // Find ALL matching files (multiple files may share the same basename)
    const candidates = this.findAllFilesByLinkText(linkText, lang);
    if (candidates.length === 0) {
      this.logger.debug(`Target file not found for wikilink: ${linkText}`);
      return null;
    }

    // Try each candidate until one has a published URL
    for (const targetFile of candidates) {
      const cache = this.app.metadataCache.getFileCache(targetFile);
      if (!cache?.frontmatter) continue;

      const fm = cache.frontmatter;
      const wordpressUrl = fm.wordpress_url || fm.wordpress_url_fr || fm.wordpress_url_en;

      if (wordpressUrl && typeof wordpressUrl === "string") {
        this.logger.debug(`Found wordpress_url for "${linkText}" (${lang || "default"}): ${wordpressUrl}`);
        this.linkCache.set(cacheKey, wordpressUrl);
        return wordpressUrl;
      }

      // Fallback: Substack URL
      const substackUrl = fm.substack_url;
      if (substackUrl && typeof substackUrl === "string") {
        this.logger.debug(`Found substack_url for "${linkText}": ${substackUrl}`);
        this.linkCache.set(cacheKey, substackUrl);
        return substackUrl;
      }
    }

    this.logger.debug(`No published URL in frontmatter for: ${linkText}`);
    return null;
  }

  /**
   * Find a file in the vault by link text
   * Handles both exact matches and partial paths
   * @param linkText The link text to find
   * @param lang Optional language - "en" searches only in _en/, "fr" searches only outside _en/
   */
  private findAllFilesByLinkText(linkText: string, lang?: "fr" | "en"): TFile[] {
    // Limit search to publication directory if set
    const allFiles = this.app.vault.getMarkdownFiles().filter(
      f => !this.basePath || f.path.startsWith(this.basePath)
    );
    const linkLower = linkText.toLowerCase();

    // Helper to check if file is in _en/ folder (handles both root and nested)
    const isInEnFolder = (path: string): boolean => {
      const p = path.toLowerCase();
      return p.includes("/_en/") || p.startsWith("_en/");
    };

    if (lang === "en") {
      return allFiles.filter(f =>
        isInEnFolder(f.path) && f.basename.toLowerCase() === linkLower
      );
    }

    if (lang === "fr") {
      return allFiles.filter(f =>
        !isInEnFolder(f.path) && f.basename.toLowerCase() === linkLower
      );
    }

    // No language specified: try exact path, then all basename matches
    const exactPath = linkText.endsWith(".md") ? linkText : `${linkText}.md`;
    const exactFile = this.app.vault.getAbstractFileByPath(exactPath);
    if (exactFile instanceof TFile) {
      return [exactFile];
    }

    // All basename matches, preferring non-_en/ files first
    const frFiles = allFiles.filter(f =>
      !isInEnFolder(f.path) && f.basename.toLowerCase() === linkLower
    );
    const enFiles = allFiles.filter(f =>
      isInEnFolder(f.path) && f.basename.toLowerCase() === linkLower
    );

    if (frFiles.length > 0 || enFiles.length > 0) {
      return [...frFiles, ...enFiles];
    }

    // Try partial path match
    const normalizedLink = linkLower.replace(/\\/g, "/");
    return allFiles.filter(
      f => f.path.toLowerCase().replace(/\.md$/, "").endsWith(normalizedLink)
    );
  }

  /**
   * Convert a single wikilink to HTML anchor tag or markdown link
   * @param wikiLink The parsed wikilink
   * @param outputFormat 'html' for <a href>, 'markdown' for [text](url)
   */
  convertWikiLink(wikiLink: WordPressWikiLink, outputFormat: "html" | "markdown" = "html"): string {
    const url = this.findWordPressUrl(wikiLink.linkText);

    if (url) {
      const displayText = wikiLink.displayText || wikiLink.linkText;
      if (outputFormat === "markdown") {
        return `[${displayText}](${url})`;
      }
      return `<a href="${url}">${displayText}</a>`;
    }

    // If page not found, return just the display text (or link text)
    // This allows the content to be readable even if the link is broken
    return wikiLink.displayText || wikiLink.linkText;
  }

  /**
   * Process all wikilinks in markdown content
   * Returns the markdown with wikilinks replaced by links or plain text
   * Also returns info about unresolved links for potential backlink updates
   * @param markdown The content to process
   * @param outputFormat 'html' for <a href>, 'markdown' for [text](url)
   * @param lang Optional language code ('fr' or 'en') for bilingual sites
   */
  processWikiLinks(markdown: string, outputFormat: "html" | "markdown" = "html", lang?: "fr" | "en"): {
    processed: string;
    resolved: Array<{ linkText: string; url: string }>;
    unresolved: string[];
  } {
    const wikiLinks = this.parseWikiLinks(markdown);

    if (wikiLinks.length === 0) {
      return { processed: markdown, resolved: [], unresolved: [] };
    }

    this.logger.info(`Processing ${wikiLinks.length} wikilinks (lang: ${lang || "default"})`);

    let processedMarkdown = markdown;
    const resolved: Array<{ linkText: string; url: string }> = [];
    const unresolved: string[] = [];

    for (const wikiLink of wikiLinks) {
      const url = this.findWordPressUrl(wikiLink.linkText, lang);

      if (url) {
        resolved.push({ linkText: wikiLink.linkText, url });
        const displayText = wikiLink.displayText || wikiLink.linkText;
        const replacement = outputFormat === "markdown"
          ? `[${displayText}](${url})`
          : `<a href="${url}">${displayText}</a>`;
        processedMarkdown = processedMarkdown.replace(
          wikiLink.fullMatch,
          replacement
        );
      } else {
        unresolved.push(wikiLink.linkText);
        // Replace with plain text
        processedMarkdown = processedMarkdown.replace(
          wikiLink.fullMatch,
          wikiLink.displayText || wikiLink.linkText
        );
      }
    }

    if (unresolved.length > 0) {
      this.logger.warn(`Unresolved wikilinks (no wordpress_url): ${unresolved.join(", ")}`);
    }

    return { processed: processedMarkdown, resolved, unresolved };
  }

  /**
   * Clear the link cache
   */
  clearCache(): void {
    this.linkCache.clear();
  }

  /**
   * Find all published notes that have a backlink to the given file
   * These are notes that reference this file AND have a wordpress_url
   * Used to detect which published articles need updating when this file is published
   */
  findPublishedBacklinks(file: TFile): Array<{
    file: TFile;
    wordpressUrl: string;
    wordpressId?: number;
  }> {
    const backlinks: Array<{
      file: TFile;
      wordpressUrl: string;
      wordpressId?: number;
    }> = [];

    // Get all files that link to this file
    // We need to search through all files and check their links
    const allFiles = this.app.vault.getMarkdownFiles();
    const targetBasename = file.basename.toLowerCase();

    for (const sourceFile of allFiles) {
      // Skip the file itself
      if (sourceFile.path === file.path) continue;

      const cache = this.app.metadataCache.getFileCache(sourceFile);
      if (!cache) continue;

      // Check if this file links to our target
      const hasLink = cache.links?.some(link => {
        const linkPath = link.link.toLowerCase();
        return linkPath === targetBasename ||
               linkPath === file.basename.toLowerCase() ||
               linkPath.endsWith(`/${targetBasename}`);
      });

      if (!hasLink) continue;

      // Check if source file is published (has wordpress_url)
      const fm = cache.frontmatter;
      if (!fm) continue;

      const wordpressUrl = fm.wordpress_url || fm.wordpress_url_fr;
      if (!wordpressUrl || typeof wordpressUrl !== "string") continue;

      const backlinkEntry: {
        file: TFile;
        wordpressUrl: string;
        wordpressId?: number;
      } = {
        file: sourceFile,
        wordpressUrl
      };

      if (typeof fm.wordpress_id === "number") {
        backlinkEntry.wordpressId = fm.wordpress_id;
      }

      backlinks.push(backlinkEntry);
    }

    this.logger.debug(`Found ${backlinks.length} published backlinks for ${file.basename}`);
    return backlinks;
  }
}
