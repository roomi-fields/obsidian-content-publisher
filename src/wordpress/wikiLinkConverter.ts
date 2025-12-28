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

  constructor(
    app: App,
    logger: ILogger
  ) {
    this.app = app;
    this.logger = logger;
    this.linkCache = new Map();
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
   * Priority: wordpress_url > wordpress_url_fr > substack_url
   * Uses Obsidian's metadata cache for fast local resolution
   */
  findWordPressUrl(linkText: string): string | null {
    // Check cache first
    if (this.linkCache.has(linkText)) {
      return this.linkCache.get(linkText) ?? null;
    }

    this.logger.debug(`Resolving wikilink locally: ${linkText}`);

    // Find the target file in the vault
    const targetFile = this.findFileByLinkText(linkText);
    if (!targetFile) {
      this.logger.debug(`Target file not found for wikilink: ${linkText}`);
      return null;
    }

    // Get frontmatter from metadata cache
    const cache = this.app.metadataCache.getFileCache(targetFile);
    if (!cache?.frontmatter) {
      this.logger.debug(`No frontmatter for: ${targetFile.path}`);
      return null;
    }

    const fm = cache.frontmatter;

    // Priority 1: WordPress URL (single language or FR for bilingual)
    const wordpressUrl = fm.wordpress_url || fm.wordpress_url_fr;
    if (wordpressUrl && typeof wordpressUrl === "string") {
      this.logger.debug(`Found wordpress_url for "${linkText}": ${wordpressUrl}`);
      this.linkCache.set(linkText, wordpressUrl);
      return wordpressUrl;
    }

    // Priority 2: Substack URL (fallback)
    const substackUrl = fm.substack_url;
    if (substackUrl && typeof substackUrl === "string") {
      this.logger.debug(`Found substack_url for "${linkText}": ${substackUrl}`);
      this.linkCache.set(linkText, substackUrl);
      return substackUrl;
    }

    this.logger.debug(`No published URL in frontmatter for: ${linkText}`);
    return null;
  }

  /**
   * Find a file in the vault by link text
   * Handles both exact matches and partial paths
   */
  private findFileByLinkText(linkText: string): TFile | null {
    // Try exact match first (with .md extension)
    const exactPath = linkText.endsWith(".md") ? linkText : `${linkText}.md`;
    const exactFile = this.app.vault.getAbstractFileByPath(exactPath);
    if (exactFile instanceof TFile) {
      return exactFile;
    }

    // Search all markdown files for a basename match
    const allFiles = this.app.vault.getMarkdownFiles();

    // Try exact basename match
    const basenameMatch = allFiles.find(
      f => f.basename.toLowerCase() === linkText.toLowerCase()
    );
    if (basenameMatch) {
      return basenameMatch;
    }

    // Try partial path match (for links like "folder/note")
    const normalizedLink = linkText.toLowerCase().replace(/\\/g, "/");
    const pathMatch = allFiles.find(
      f => f.path.toLowerCase().replace(/\.md$/, "").endsWith(normalizedLink)
    );
    if (pathMatch) {
      return pathMatch;
    }

    return null;
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
   */
  processWikiLinks(markdown: string, outputFormat: "html" | "markdown" = "html"): {
    processed: string;
    resolved: Array<{ linkText: string; url: string }>;
    unresolved: string[];
  } {
    const wikiLinks = this.parseWikiLinks(markdown);

    if (wikiLinks.length === 0) {
      return { processed: markdown, resolved: [], unresolved: [] };
    }

    this.logger.info(`Processing ${wikiLinks.length} wikilinks`);

    let processedMarkdown = markdown;
    const resolved: Array<{ linkText: string; url: string }> = [];
    const unresolved: string[] = [];

    for (const wikiLink of wikiLinks) {
      const url = this.findWordPressUrl(wikiLink.linkText);

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
