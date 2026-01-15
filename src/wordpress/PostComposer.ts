import { App, Modal, Notice, TFile } from "obsidian";
import { WordPressAPI } from "./api";
import { WikiLinkConverter } from "./wikiLinkConverter";
import { WordPressImageHandler } from "./imageHandler";
import { ILogger } from "../utils/logger";
import {
  WordPressFrontmatter,
  WordPressCategoryMapping,
  WordPressPostStatus,
  WordPressEnluminureInfo,
  RankMathMeta,
  WordPressServer,
  BilingualContent,
  LanguageContent,
  PolylangLanguage,
  WordPressContentType
} from "./types";
import {
  isBilingualContent,
  parseBilingualContent
} from "./bilingualParser";

export interface WordPressPostComposerOptions {
  servers: WordPressServer[];
  defaultServerId: string;
}

export class WordPressPostComposer extends Modal {
  private api: WordPressAPI;
  private logger: ILogger;
  private wikiLinkConverter: WikiLinkConverter;
  private imageHandler: WordPressImageHandler;
  private title: string = "";
  private category: string = "";
  private categories: string[];
  private categoryPageIds: WordPressCategoryMapping;
  private publishButton: HTMLButtonElement | null = null;
  private draftButton: HTMLButtonElement | null = null;
  private activeFile: TFile | null = null;
  private frontmatter: WordPressFrontmatter = {};
  private servers: WordPressServer[];
  private currentServer: WordPressServer;
  private categorySelectEl: HTMLSelectElement | null = null;
  private categoryContainerEl: HTMLElement | null = null;
  // Bilingual support
  private bilingualContent: BilingualContent | null = null;
  private isBilingual: boolean = false;
  private rawContent: string = "";
  // Content type (page or article)
  private contentType: WordPressContentType | null = null;
  private contentTypeSelectEl: HTMLSelectElement | null = null;
  private existingPostId: number | null = null;
  private existingPageId: number | null = null;

  constructor(
    app: App,
    logger: ILogger,
    options: WordPressPostComposerOptions
  ) {
    super(app);
    this.logger = logger;
    this.servers = options.servers;

    // Find default server or use first one
    const selectedServer = this.servers.find(s => s.id === options.defaultServerId)
      ?? this.servers[0];
    if (!selectedServer) {
      throw new Error("No WordPress servers configured");
    }
    this.currentServer = selectedServer;

    this.categoryPageIds = this.currentServer.categoryPageIds;
    this.categories = Object.keys(this.categoryPageIds);
    this.category = this.currentServer.defaultCategory || this.categories[0] || "";

    this.api = new WordPressAPI(
      this.currentServer.baseUrl,
      this.currentServer.username,
      this.currentServer.password
    );

    this.wikiLinkConverter = new WikiLinkConverter(app, logger);
    this.imageHandler = new WordPressImageHandler(this.api, app.vault, logger);
  }

  private switchServer(server: WordPressServer): void {
    this.currentServer = server;
    this.categoryPageIds = server.categoryPageIds;
    this.categories = Object.keys(this.categoryPageIds);
    this.category = server.defaultCategory || this.categories[0] || "";

    this.api = new WordPressAPI(
      server.baseUrl,
      server.username,
      server.password
    );

    // WikiLinkConverter doesn't depend on server, no need to recreate
    this.imageHandler = new WordPressImageHandler(this.api, this.app.vault, this.logger);

    // Update category dropdown with Polylang filtering
    if (this.categorySelectEl) {
      this.categorySelectEl.empty();

      // Filter categories when Polylang is enabled
      let displayCategories = this.categories;
      if (server.polylang?.enabled) {
        const polylangCategories = Object.keys(server.polylang.categoryMapping);
        displayCategories = this.categories.filter(cat => polylangCategories.includes(cat));
      }

      for (const cat of displayCategories) {
        const option = this.categorySelectEl.createEl("option", {
          text: cat,
          value: cat
        });
        if (cat === this.category) {
          option.selected = true;
        }
      }
    }
  }

  override async onOpen() {
    const { contentEl } = this;

    // Get active file and read frontmatter
    this.activeFile = this.app.workspace.getActiveFile();
    this.loadFrontmatter();

    // Check for bilingual content
    await this.detectBilingualContent();

    // Detect content type and check for existing content
    await this.detectContentTypeAndExisting();

    // Title - indicate if bilingual and content type
    let titleText = "Publish to WordPress";
    if (this.isBilingual) {
      titleText = "Publish to WordPress (Bilingual 🇫🇷/🇬🇧)";
    }
    if (this.existingPostId || this.existingPageId) {
      titleText = "Update WordPress Content";
    }
    contentEl.createEl("h2", { text: titleText });

    // Server selector (if multiple servers)
    if (this.servers.length > 1) {
      const serverContainer = contentEl.createDiv({
        cls: "wordpress-field-container"
      });

      serverContainer.createEl("label", { text: "Server" });

      const serverSelect = serverContainer.createEl("select", {
        cls: "wordpress-select"
      });

      for (const server of this.servers) {
        const option = serverSelect.createEl("option", {
          text: server.name,
          value: server.id
        });
        if (server.id === this.currentServer.id) {
          option.selected = true;
        }
      }

      serverSelect.addEventListener("change", () => {
        const selectedServer = this.servers.find(s => s.id === serverSelect.value);
        if (selectedServer) {
          this.switchServer(selectedServer);
        }
      });
    }

    // Category selector (only visible for articles)
    if (this.categories.length > 0) {
      const categoryContainer = contentEl.createDiv({
        cls: "wordpress-field-container"
      });
      this.categoryContainerEl = categoryContainer;

      categoryContainer.createEl("label", { text: "Category" });

      const categorySelect = categoryContainer.createEl("select", {
        cls: "wordpress-select"
      });
      this.categorySelectEl = categorySelect;

      // Filter categories: when Polylang is enabled, only show base categories
      // (those in the Polylang mapping), not the _en variants
      let displayCategories = this.categories;
      if (this.currentServer.polylang?.enabled) {
        const polylangCategories = Object.keys(this.currentServer.polylang.categoryMapping);
        displayCategories = this.categories.filter(cat => polylangCategories.includes(cat));
        this.logger.debug("Filtered categories for Polylang", {
          original: this.categories,
          filtered: displayCategories
        });
      }

      // Apply frontmatter category if valid, otherwise use default
      // Support case-insensitive matching for better UX
      let matchedCategory: string | undefined;
      if (this.frontmatter.category) {
        const frontmatterCategoryLower = this.frontmatter.category.toLowerCase();
        matchedCategory = displayCategories.find(
          cat => cat.toLowerCase() === frontmatterCategoryLower
        );
      }

      this.logger.debug("Category selection logic", {
        frontmatterCategory: this.frontmatter.category,
        matchedCategory,
        defaultCategory: this.category,
        availableCategories: displayCategories,
        isValidCategory: !!matchedCategory
      });

      const effectiveCategory = matchedCategory || (displayCategories.includes(this.category) ? this.category : displayCategories[0] || "");
      this.category = effectiveCategory;

      if (this.frontmatter.category && !matchedCategory) {
        this.logger.warn("Frontmatter category not found in configured categories", {
          frontmatterCategory: this.frontmatter.category,
          availableCategories: displayCategories,
          fallbackToDefault: this.category
        });
      }

      this.logger.debug("Selected category", { effectiveCategory });

      for (const cat of displayCategories) {
        const option = categorySelect.createEl("option", {
          text: cat,
          value: cat
        });
        if (cat === effectiveCategory) {
          option.selected = true;
        }
      }

      categorySelect.addEventListener("change", () => {
        this.category = categorySelect.value;
      });
    }

    // Title input
    const titleContainer = contentEl.createDiv({
      cls: "wordpress-field-container"
    });
    titleContainer.createEl("label", { text: "Title" });
    const titleInput = titleContainer.createEl("input", {
      type: "text",
      placeholder: "Article title",
      cls: "wordpress-input"
    });

    // Pre-fill with frontmatter or file name
    if (this.frontmatter.title) {
      this.title = this.frontmatter.title;
    } else if (this.activeFile) {
      this.title = this.activeFile.basename;
    }
    titleInput.value = this.title;

    titleInput.addEventListener("input", () => {
      this.title = titleInput.value;
    });

    // Content type selector (only show if not already set and not an update)
    if (!this.frontmatter.type && !this.existingPostId && !this.existingPageId) {
      const typeContainer = contentEl.createDiv({
        cls: "wordpress-field-container"
      });
      typeContainer.createEl("label", { text: "Type" });

      const typeSelect = typeContainer.createEl("select", {
        cls: "wordpress-select"
      });
      this.contentTypeSelectEl = typeSelect;

      const articleOption = typeSelect.createEl("option", {
        text: "Article",
        value: "article"
      });
      articleOption.selected = true;
      this.contentType = "article";

      typeSelect.createEl("option", {
        text: "Page",
        value: "page"
      });

      typeSelect.addEventListener("change", () => {
        this.contentType = typeSelect.value as WordPressContentType;
        this.updateCategoryVisibility();
      });
    } else {
      // Type is already set
      this.contentType = this.frontmatter.type || (this.existingPageId ? "page" : "article");
    }

    // Hide category for pages
    this.updateCategoryVisibility();

    // Show type info if already set
    if (this.frontmatter.type || this.existingPostId || this.existingPageId) {
      const typeInfo = contentEl.createDiv({
        cls: "wordpress-type-info"
      });
      const typeLabel = this.contentType === "page" ? "Page" : "Article";
      const isUpdate = this.existingPostId || this.existingPageId;
      typeInfo.setText(`Type: ${typeLabel}${isUpdate ? " (updating existing)" : ""}`);
    }

    // Buttons
    const buttonContainer = contentEl.createDiv({
      cls: "wordpress-button-container"
    });

    buttonContainer
      .createEl("button", {
        text: "Cancel",
        cls: "wordpress-cancel-button"
      })
      .addEventListener("click", () => {
        this.close();
      });

    this.draftButton = buttonContainer.createEl("button", {
      text: "Save as draft",
      cls: "wordpress-draft-button"
    });
    this.draftButton.addEventListener("click", () => {
      void this.saveToWordPress("draft");
    });

    this.publishButton = buttonContainer.createEl("button", {
      text: "Publish",
      cls: "wordpress-publish-button"
    });
    this.publishButton.addEventListener("click", () => {
      void this.saveToWordPress("publish");
    });

    // Note
    const noteText = this.contentType === "page"
      ? "The active note will be converted and published as a WordPress page."
      : "The active note will be converted and published as a WordPress article.";
    contentEl.createEl("div", {
      text: noteText,
      cls: "wordpress-note-text"
    });
  }

  /**
   * Detect content type from frontmatter and check for existing content on WordPress
   */
  private async detectContentTypeAndExisting(): Promise<void> {
    // First, check if type is already in frontmatter
    if (this.frontmatter.type) {
      this.contentType = this.frontmatter.type;
      this.logger.debug("Content type from frontmatter", { type: this.contentType });
    }

    // Check if we have a WordPress ID (update scenario)
    if (this.frontmatter.wordpress_id) {
      // Determine type from existing content
      if (this.frontmatter.type === "page") {
        this.existingPageId = this.frontmatter.wordpress_id;
      } else {
        this.existingPostId = this.frontmatter.wordpress_id;
      }
      this.logger.debug("Found existing WordPress ID", {
        id: this.frontmatter.wordpress_id,
        type: this.frontmatter.type
      });
      return;
    }

    // If no type set, try to find existing content by title
    if (!this.frontmatter.type && this.title) {
      try {
        // Check for existing post
        const existingPost = await this.api.findPostByTitle(this.title);
        if (existingPost.success && existingPost.data) {
          this.existingPostId = existingPost.data.id;
          this.contentType = "article";
          this.logger.info("Found existing article", {
            id: existingPost.data.id,
            title: this.title
          });
          return;
        }

        // Check for existing page
        const existingPage = await this.api.findPageByTitle(this.title);
        if (existingPage.success && existingPage.data) {
          this.existingPageId = existingPage.data.id;
          this.contentType = "page";
          this.logger.info("Found existing page", {
            id: existingPage.data.id,
            title: this.title
          });
          return;
        }
      } catch (error) {
        this.logger.warn("Error checking for existing content", error);
      }
    }
  }

  /**
   * Update category selector visibility based on content type
   * Categories are only relevant for articles, not pages
   */
  private updateCategoryVisibility(): void {
    if (!this.categoryContainerEl) return;

    const effectiveType = this.contentTypeSelectEl
      ? (this.contentTypeSelectEl.value as WordPressContentType)
      : this.contentType;

    if (effectiveType === "page") {
      this.categoryContainerEl.style.display = "none";
    } else {
      this.categoryContainerEl.style.display = "";
    }
    this.logger.debug("Category visibility updated", { type: effectiveType });
  }

  /**
   * Detect if the current file contains bilingual content
   */
  private async detectBilingualContent(): Promise<void> {
    if (!this.activeFile) {
      return;
    }

    this.rawContent = await this.app.vault.cachedRead(this.activeFile);

    // Check if content has bilingual callouts
    if (isBilingualContent(this.rawContent)) {
      this.bilingualContent = parseBilingualContent(this.rawContent);
      this.isBilingual = this.bilingualContent !== null;

      if (this.isBilingual && this.bilingualContent) {
        this.logger.info("Detected bilingual content", {
          frTitle: this.bilingualContent.fr.title,
          enTitle: this.bilingualContent.en.title
        });

        // Use FR title as default display title
        this.title = this.bilingualContent.fr.title;
      }
    }
  }

  private loadFrontmatter(): void {
    if (!this.activeFile) {
      this.logger.debug("loadFrontmatter: No active file");
      return;
    }

    const cache = this.app.metadataCache.getFileCache(this.activeFile);
    this.logger.debug("loadFrontmatter: Cache state", {
      hasCache: !!cache,
      hasFrontmatter: !!cache?.frontmatter,
      frontmatterKeys: cache?.frontmatter ? Object.keys(cache.frontmatter) : []
    });

    if (cache?.frontmatter) {
      const fm = cache.frontmatter;
      const parsed: WordPressFrontmatter = {};

      if (typeof fm.title === "string") {
        parsed.title = fm.title;
      }
      // Check for both "categorie" (French) and "category" (English)
      if (typeof fm.categorie === "string") {
        parsed.category = fm.categorie;
        this.logger.debug("Found frontmatter categorie (French)", { value: fm.categorie });
      } else if (typeof fm.category === "string") {
        parsed.category = fm.category;
        this.logger.debug("Found frontmatter category (English)", { value: fm.category });
      } else {
        this.logger.debug("No category found in frontmatter", {
          categorieType: typeof fm.categorie,
          categoryType: typeof fm.category,
          categorieValue: fm.categorie,
          categoryValue: fm.category
        });
      }
      if (
        fm.status === "publish" ||
        fm.status === "draft" ||
        fm.status === "pending" ||
        fm.status === "private"
      ) {
        parsed.status = fm.status;
      }
      if (typeof fm.slug === "string") {
        parsed.slug = fm.slug;
      }
      if (typeof fm.excerpt === "string") {
        parsed.excerpt = fm.excerpt;
      }
      if (typeof fm.subtitle === "string") {
        parsed.subtitle = fm.subtitle;
      }
      if (Array.isArray(fm.tags)) {
        parsed.tags = fm.tags.filter((t): t is string => typeof t === "string");
      }
      if (typeof fm.focus_keyword === "string") {
        parsed.focus_keyword = fm.focus_keyword;
      }
      // Parse enluminure path
      if (typeof fm.enluminure === "string") {
        parsed.enluminure = fm.enluminure;
        this.logger.debug("Found frontmatter enluminure", { enluminure: fm.enluminure });
      }
      // Parse content type (page or article)
      if (fm.type === "page" || fm.type === "article") {
        parsed.type = fm.type;
        this.logger.debug("Found frontmatter type", { type: fm.type });
      }
      // Parse existing WordPress IDs (for updates)
      if (typeof fm.wordpress_id === "number") {
        parsed.wordpress_id = fm.wordpress_id;
      }
      if (typeof fm.wordpress_url === "string") {
        parsed.wordpress_url = fm.wordpress_url;
      }
      if (typeof fm.wordpress_slug === "string") {
        parsed.wordpress_slug = fm.wordpress_slug;
      }

      this.frontmatter = parsed;
      this.logger.debug("Parsed frontmatter", { parsed });
    } else {
      this.logger.debug("No frontmatter cache available");
    }

    // If no subtitle in frontmatter, try to extract from first H3 in content
    if (!this.frontmatter.subtitle && this.activeFile) {
      this.extractSubtitleFromContent();
    }
  }

  /**
   * Extract subtitle from the first H3 header in the content
   * This is useful when the subtitle is in the markdown but not in frontmatter
   */
  private extractSubtitleFromContent(): void {
    if (!this.activeFile) return;

    const cache = this.app.metadataCache.getFileCache(this.activeFile);
    if (!cache?.headings) return;

    // Find the first H3 heading (typically the subtitle after H1 title)
    const h3Heading = cache.headings.find((h) => h.level === 3);
    if (h3Heading) {
      this.frontmatter.subtitle = h3Heading.heading;
      this.logger.debug("Extracted subtitle from H3", { subtitle: h3Heading.heading });
    }
  }

  /**
   * Get HTML content with enluminure support
   * Returns { html, enluminure } where enluminure contains the uploaded image info
   */
  private async getHtmlContent(): Promise<{
    html: string;
    enluminure?: WordPressEnluminureInfo | undefined;
  } | null> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active file selected");
      return null;
    }

    const content = await this.app.vault.cachedRead(activeFile);
    // Remove frontmatter
    let cleanContent = content.replace(/^---[\s\S]*?---\n?/, "");

    // Process images - upload local images to WordPress
    // This also detects and uploads enluminure separately
    // Enluminure can be specified in frontmatter or detected in content
    const basePath = activeFile.parent?.path || "";
    const imageResult = await this.imageHandler.processMarkdownImages(
      cleanContent,
      basePath,
      this.frontmatter.enluminure
    );

    // Notify user of image upload results
    if (imageResult.uploadedImages.length > 0) {
      this.logger.info(
        `Uploaded ${imageResult.uploadedImages.length} image(s) to WordPress`
      );
    }

    if (imageResult.errors.length > 0) {
      const errorCount = imageResult.errors.length;
      new Notice(
        `Warning: ${errorCount} image(s) failed to upload. Check logs for details.`
      );
      for (const err of imageResult.errors) {
        this.logger.warn(`Image upload failed: ${err.path} - ${err.error}`);
      }
    }

    cleanContent = imageResult.processedMarkdown;

    // Process wikilinks - convert to WordPress internal links
    const wikiLinkResult = this.wikiLinkConverter.processWikiLinks(cleanContent);
    cleanContent = wikiLinkResult.processed;

    if (wikiLinkResult.unresolved.length > 0) {
      this.logger.warn(`Unresolved wikilinks: ${wikiLinkResult.unresolved.join(", ")}`);
    }

    // Convert markdown to HTML
    const html = this.markdownToHtml(cleanContent);

    return {
      html,
      enluminure: imageResult.enluminure
    };
  }

  /**
   * Generate the enluminure HTML structure
   * Creates the drop-cap effect with image floated left (styled via WordPress theme)
   *
   * Note: The H1 title has its first letter wrapped in screen-reader-text span
   * for SEO, while the enluminure image serves as the visual drop cap.
   */
  private generateEnluminureHtml(
    enluminure: WordPressEnluminureInfo,
    _title: string,
    bodyHtml: string
  ): string {
    const enluminureUrl = enluminure.wordpressUrl || "";

    // Process H1: wrap first letter in screen-reader-text span for SEO
    const processedBodyHtml = bodyHtml.replace(
      /<h1([^>]*)>(.+?)<\/h1>/i,
      (_match, attrs, content) => {
        const trimmedContent = content.trim();
        const firstLetter = trimmedContent.charAt(0);
        const restOfTitle = trimmedContent.slice(1);
        return `<h1${attrs}><span class="screen-reader-text">${firstLetter}</span>${restOfTitle}</h1>`;
      }
    );

    // Build the enluminure structure (styling handled by WordPress theme)
    return `<div class="enluminure-container">
<div class="enluminure-image-article">
<img src="${enluminureUrl}" alt="Image enluminure">
</div>
${processedBodyHtml}
</div>`;
  }

  /**
   * Simple markdown to HTML conversion
   * WordPress handles markdown rendering, but we need basic HTML for the REST API
   */
  private markdownToHtml(markdown: string): string {
    let html = markdown;

    // Remove dataviewjs and dataview code blocks entirely
    html = html.replace(/```dataviewjs[\s\S]*?```/g, "");
    html = html.replace(/```dataview[\s\S]*?```/g, "");

    // Convert markdown tables to HTML tables
    html = this.convertTablesToHtml(html);

    // Headers
    html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
    html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
    html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
    html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Code blocks
    html = html.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_, lang, code) =>
        `<pre><code class="language-${lang}">${code.trim()}</code></pre>`
    );

    // Images (already processed to WordPress URLs)
    html = html.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      '<img src="$2" alt="$1">'
    );

    // Links (including converted wikilinks which are now <a> tags)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Blockquotes
    html = html.replace(/^>\s+(.+)$/gm, "<blockquote>$1</blockquote>");
    // Merge consecutive blockquotes
    html = html.replace(/<\/blockquote>\n<blockquote>/g, "\n");

    // Unordered lists
    html = html.replace(/^[*-]\s+(.+)$/gm, "<li>$1</li>");
    html = html.replace(
      /(<li>.*<\/li>\n?)+/g,
      (match) => `<ul>\n${match}</ul>\n`
    );

    // Ordered lists
    html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");

    // Horizontal rules
    html = html.replace(/^---+$/gm, "<hr>");
    html = html.replace(/^\*\*\*+$/gm, "<hr>");
    html = html.replace(/^___+$/gm, "<hr>");

    // Paragraphs - wrap text blocks in <p> tags
    const lines = html.split("\n");
    const result: string[] = [];
    let inParagraph = false;
    let paragraphContent: string[] = [];
    let consecutiveEmptyLines = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Check if this is a block element
      const isBlockElement =
        trimmed.startsWith("<h") ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("<ol") ||
        trimmed.startsWith("<li") ||
        trimmed.startsWith("</ul") ||
        trimmed.startsWith("</ol") ||
        trimmed.startsWith("<blockquote") ||
        trimmed.startsWith("</blockquote") ||
        trimmed.startsWith("<pre") ||
        trimmed.startsWith("</pre") ||
        trimmed.startsWith("<hr") ||
        trimmed.startsWith("<img") ||
        trimmed === "";

      if (trimmed === "") {
        consecutiveEmptyLines++;
        // Close any open paragraph on first empty line
        if (inParagraph && paragraphContent.length > 0) {
          result.push(`<p>${paragraphContent.join("<br>")}</p>`);
          paragraphContent = [];
          inParagraph = false;
        }
        // Add extra line break for double+ empty lines
        if (consecutiveEmptyLines >= 2) {
          result.push("<p>&nbsp;</p>");
        }
      } else if (isBlockElement) {
        consecutiveEmptyLines = 0;
        // Close any open paragraph
        if (inParagraph && paragraphContent.length > 0) {
          result.push(`<p>${paragraphContent.join("<br>")}</p>`);
          paragraphContent = [];
          inParagraph = false;
        }
        result.push(line);
      } else {
        consecutiveEmptyLines = 0;
        // Regular text line
        inParagraph = true;
        paragraphContent.push(trimmed);
      }
    }

    // Close final paragraph if needed
    if (inParagraph && paragraphContent.length > 0) {
      result.push(`<p>${paragraphContent.join("<br>")}</p>`);
    }

    // Remove leading empty paragraphs (ensure H1 comes first)
    let finalHtml = result.join("\n");
    finalHtml = finalHtml.replace(/^(\s*<p>&nbsp;<\/p>\s*)+/, "");

    return finalHtml;
  }

  /**
   * Extract and remove the illustration image (first image after title section) from the HTML
   * Returns the illustration HTML and the modified content without it
   */
  private extractIllustration(html: string): { illustration: string | null; content: string } {
    // Find the first <img> tag in the content
    const imgMatch = html.match(/<img[^>]+>/i);
    if (!imgMatch) {
      return { illustration: null, content: html };
    }

    const imgTag = imgMatch[0];

    // Only extract if the img appears before any substantial content (within first 500 chars after H1)
    const h1Match = html.match(/<h1[^>]*>[^<]*<\/h1>/i);
    if (!h1Match) {
      return { illustration: null, content: html };
    }

    const h1End = html.indexOf(h1Match[0]) + h1Match[0].length;
    const imgPos = html.indexOf(imgTag);

    // Check if img is reasonably close after H1 (allowing for H2/H3 subtitle)
    const contentBetween = html.substring(h1End, imgPos);
    const hasOnlyHeadersBetween = /^[\s]*(<h[23][^>]*>[^<]*<\/h[23]>[\s]*)*$/i.test(contentBetween);

    if (imgPos > h1End && (imgPos - h1End < 300 || hasOnlyHeadersBetween)) {
      // Create illustration block
      const illustrationBlock = `<div class="article-illustration">
${imgTag}
</div>`;

      // Remove the img from content
      const contentWithoutIllustration = html.replace(imgTag, "");

      return {
        illustration: illustrationBlock,
        content: contentWithoutIllustration
      };
    }

    return { illustration: null, content: html };
  }

  /**
   * Convert markdown tables to HTML tables
   */
  private convertTablesToHtml(text: string): string {
    // Match markdown tables (header row, separator row, data rows)
    const tableRegex = /\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/g;

    return text.replace(tableRegex, (match) => {
      const lines = match.trim().split("\n");
      if (lines.length < 3) return match;

      // Parse header row
      const headerLine = lines[0] ?? "";
      const headers = headerLine
        .split("|")
        .map((h) => h.trim())
        .filter((h) => h);

      // Skip separator row (index 1), parse data rows
      const rows: string[][] = [];
      for (let i = 2; i < lines.length; i++) {
        const rowLine = lines[i] ?? "";
        const cells = rowLine
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c);
        if (cells.length > 0) {
          rows.push(cells);
        }
      }

      // Build HTML table (styling handled by WordPress theme)
      let html = "<table>\n<thead>\n<tr>\n";
      for (const header of headers) {
        html += `<th>${header}</th>\n`;
      }
      html += "</tr>\n</thead>\n<tbody>\n";

      for (const row of rows) {
        html += "<tr>\n";
        for (let i = 0; i < headers.length; i++) {
          const cell = row[i] ?? "";
          html += `<td>${cell}</td>\n`;
        }
        html += "</tr>\n";
      }

      html += "</tbody>\n</table>\n";
      return html;
    });
  }

  private async saveToWordPress(status: WordPressPostStatus): Promise<void> {
    if (!this.title.trim()) {
      new Notice("Please enter a title");
      return;
    }

    // Get the effective content type (from selector if shown, or from detection)
    const effectiveContentType = this.contentTypeSelectEl
      ? (this.contentTypeSelectEl.value as WordPressContentType)
      : this.contentType || "article";

    // Category is required for articles only
    if (effectiveContentType === "article" && !this.category) {
      new Notice("Please select a category");
      return;
    }

    // Disable buttons IMMEDIATELY to prevent double-clicks
    const buttonText = status === "publish" ? "Publishing..." : "Saving...";
    this.setButtonsDisabled(true, buttonText);

    // Check if this is bilingual content with Polylang enabled
    if (this.isBilingual && this.bilingualContent && this.currentServer.polylang?.enabled) {
      await this.saveBilingualToWordPress(status);
      return;
    }

    const contentResult = await this.getHtmlContent();
    if (!contentResult) {
      // Re-enable buttons if content fetch fails
      this.setButtonsDisabled(false);
      return;
    }

    try {
      // Extract illustration (first image after H1) to place it at the very top
      const { illustration, content: htmlWithoutIllustration } = this.extractIllustration(contentResult.html);

      // Build final HTML content
      let finalHtml: string;
      if (contentResult.enluminure && contentResult.enluminure.wordpressUrl) {
        // Has enluminure - wrap content in enluminure structure
        const enluminureBlock = this.generateEnluminureHtml(
          contentResult.enluminure,
          this.title,
          htmlWithoutIllustration
        );
        // Place illustration BEFORE the enluminure block
        finalHtml = illustration ? `${illustration}\n${enluminureBlock}` : enluminureBlock;
        this.logger.info("Generated enluminure HTML structure", { hasIllustration: !!illustration });
      } else {
        // No enluminure - place illustration before content
        finalHtml = illustration ? `${illustration}\n${htmlWithoutIllustration}` : htmlWithoutIllustration;
      }

      // ===== PAGE PUBLICATION =====
      if (effectiveContentType === "page") {
        await this.savePageToWordPress(finalHtml, status, contentResult.enluminure);
        return;
      }

      // ===== ARTICLE PUBLICATION =====
      const categoryId = this.categoryPageIds[this.category];
      if (categoryId === undefined) {
        throw new Error(`Invalid category: ${this.category}`);
      }

      // Prepare SEO options
      const seoOptions: {
        slug?: string;
        excerpt?: string;
        featuredMediaId?: number;
        rankMathMeta?: RankMathMeta;
        tags?: number[];
      } = {};

      if (this.frontmatter.slug) {
        seoOptions.slug = this.frontmatter.slug;
      }
      if (this.frontmatter.excerpt) {
        seoOptions.excerpt = this.frontmatter.excerpt;
      }
      // Set featured_media from enluminure if available
      // This is used for WordPress thumbnails, social sharing previews, etc.
      if (contentResult.enluminure?.mediaId) {
        seoOptions.featuredMediaId = contentResult.enluminure.mediaId;
      }

      // Build Rank Math SEO meta
      const rankMathMeta: RankMathMeta = {};
      let hasRankMathMeta = false;

      if (this.frontmatter.focus_keyword) {
        rankMathMeta.rank_math_focus_keyword = this.frontmatter.focus_keyword;
        hasRankMathMeta = true;
      }
      if (this.frontmatter.excerpt) {
        // Use excerpt as Rank Math description (meta description)
        rankMathMeta.rank_math_description = this.frontmatter.excerpt;
        hasRankMathMeta = true;
      }
      // Use enluminure URL and ID for Open Graph image if available
      if (contentResult.enluminure?.wordpressUrl) {
        rankMathMeta.rank_math_facebook_image = contentResult.enluminure.wordpressUrl;
        if (contentResult.enluminure.mediaId) {
          rankMathMeta.rank_math_facebook_image_id = String(contentResult.enluminure.mediaId);
        }
        rankMathMeta.rank_math_twitter_use_facebook = "on";
        hasRankMathMeta = true;
      }

      if (hasRankMathMeta) {
        seoOptions.rankMathMeta = rankMathMeta;
      }

      // Resolve tags to WordPress IDs
      if (this.frontmatter.tags && this.frontmatter.tags.length > 0) {
        const tagResult = await this.api.resolveTagIds(this.frontmatter.tags);
        if (tagResult.ids.length > 0) {
          seoOptions.tags = tagResult.ids;
          this.logger.info(`Resolved ${tagResult.ids.length} tag IDs`);
        }
        if (tagResult.errors.length > 0) {
          this.logger.warn("Some tags failed to resolve", { errors: tagResult.errors });
        }
      }

      this.logger.debug("Publishing article to WordPress", {
        title: this.title,
        category: this.category,
        categoryId,
        status,
        hasEnluminure: !!contentResult.enluminure,
        seoOptions
      });

      // Check if article already exists (use detected ID or search)
      let existingId = this.existingPostId;
      if (!existingId) {
        const existingPost = await this.api.findPostByTitle(this.title, categoryId);
        if (existingPost.success && existingPost.data) {
          existingId = existingPost.data.id;
        }
      }

      let result;
      if (existingId) {
        // Update existing article
        this.logger.info(`Updating existing article: ${existingId}`);
        result = await this.api.updatePost(existingId, {
          title: this.title,
          content: finalHtml,
          status,
          categories: [categoryId],
          tags: seoOptions.tags,
          slug: seoOptions.slug,
          excerpt: seoOptions.excerpt,
          meta: seoOptions.rankMathMeta
        });
      } else {
        // Create new article
        result = await this.api.createPost(
          this.title,
          finalHtml,
          [categoryId],
          status,
          seoOptions
        );
      }

      if (result.success && result.data) {
        const action = existingId ? "Updated" : "Created";
        const statusText = status === "publish" ? "published" : "draft";
        this.logger.info(
          `${action} article: ${result.data.link} (${statusText})`
        );
        new Notice(
          `${action} ${statusText}: ${this.title}\n${result.data.link}`
        );

        // Update frontmatter with WordPress info
        await this.updateFrontmatterAfterPublish(
          "article",
          result.data.id,
          result.data.link,
          result.data.slug
        );

        this.close();
      } else {
        throw new Error(result.error || "Failed to save article");
      }
    } catch (error) {
      this.logger.error("Failed to publish to WordPress", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      new Notice(`Failed to save: ${errorMessage}`);
      this.setButtonsDisabled(false);
    }
  }

  /**
   * Save content as a WordPress page
   */
  private async savePageToWordPress(
    finalHtml: string,
    status: WordPressPostStatus,
    enluminure?: WordPressEnluminureInfo
  ): Promise<void> {
    try {
      this.logger.debug("Publishing page to WordPress", {
        title: this.title,
        status,
        hasEnluminure: !!enluminure,
        existingPageId: this.existingPageId
      });

      // Check if page already exists (use detected ID or search)
      let existingId = this.existingPageId;
      if (!existingId) {
        const existingPage = await this.api.findPageByTitle(this.title);
        if (existingPage.success && existingPage.data) {
          existingId = existingPage.data.id;
        }
      }

      let result;
      if (existingId) {
        // Update existing page
        this.logger.info(`Updating existing page: ${existingId}`);
        result = await this.api.updatePage(existingId, {
          title: this.title,
          content: finalHtml,
          status,
          slug: this.frontmatter.slug,
          excerpt: this.frontmatter.excerpt
        });
      } else {
        // Create new page
        result = await this.api.createPage(
          this.title,
          finalHtml,
          undefined, // No parent ID for now
          status
        );
      }

      if (result.success && result.data) {
        const action = existingId ? "Updated" : "Created";
        const statusText = status === "publish" ? "published" : "draft";
        this.logger.info(
          `${action} page: ${result.data.link} (${statusText})`
        );
        new Notice(
          `${action} page ${statusText}: ${this.title}\n${result.data.link}`
        );

        // Update frontmatter with WordPress info
        await this.updateFrontmatterAfterPublish(
          "page",
          result.data.id,
          result.data.link,
          result.data.slug
        );

        this.close();
      } else {
        throw new Error(result.error || "Failed to save page");
      }
    } catch (error) {
      this.logger.error("Failed to publish page to WordPress", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      new Notice(`Failed to save page: ${errorMessage}`);
      this.setButtonsDisabled(false);
    }
  }

  /**
   * Update frontmatter after successful publication
   * Sets type, wordpress_id, wordpress_url, and wordpress_slug
   * Also checks for backlinks that need updating
   */
  private async updateFrontmatterAfterPublish(
    type: WordPressContentType,
    wordpressId: number,
    wordpressUrl: string,
    wordpressSlug: string
  ): Promise<void> {
    if (!this.activeFile) return;

    try {
      await this.app.fileManager.processFrontMatter(
        this.activeFile,
        (frontmatter) => {
          frontmatter.type = type;
          frontmatter.wordpress_id = wordpressId;
          frontmatter.wordpress_url = wordpressUrl;
          frontmatter.wordpress_slug = wordpressSlug;
        }
      );
      this.logger.info("Updated frontmatter with WordPress info", {
        type,
        wordpressId,
        wordpressUrl,
        wordpressSlug
      });

      // Check for published backlinks that might need updating
      await this.checkAndUpdateBacklinks();

      // Move article to category folder if configured
      await this.moveArticleAfterPublish();
    } catch (error) {
      this.logger.warn("Failed to update frontmatter", error);
      // Don't show error to user - the publish succeeded
    }
  }

  /**
   * Move article to its category folder after successful publication
   * Only applies if:
   * - articleOrganization is enabled in server config
   * - File is in the configured source folder
   * - Filename matches pipeline suffix pattern (_\d_[a-z]+.md)
   */
  private async moveArticleAfterPublish(): Promise<void> {
    if (!this.activeFile) return;

    const orgConfig = this.currentServer.articleOrganization;
    if (!orgConfig?.enabled) {
      this.logger.debug("Article organization disabled, skipping move");
      return;
    }

    const filePath = this.activeFile.path;
    const fileName = this.activeFile.basename;

    // Check if file is in the source folder
    if (!filePath.startsWith(orgConfig.sourceFolder)) {
      this.logger.debug("File not in source folder, skipping move", {
        filePath,
        sourceFolder: orgConfig.sourceFolder
      });
      return;
    }

    // Check if filename has pipeline suffix pattern: _\d_[a-z]+
    const suffixMatch = fileName.match(/_\d_[a-z]+$/i);
    if (!suffixMatch) {
      this.logger.debug("Filename has no pipeline suffix, skipping move", { fileName });
      return;
    }

    // Extract the clean name (without suffix)
    const cleanName = fileName.replace(/_\d_[a-z]+$/i, "");

    // Build destination path: destinationBase/category/cleanName.md
    const destinationPath = `${orgConfig.destinationBase}${this.category}/${cleanName}.md`;

    try {
      // Check if destination folder exists, create if not
      const destFolder = `${orgConfig.destinationBase}${this.category}`;
      const folderExists = this.app.vault.getAbstractFileByPath(destFolder);
      if (!folderExists) {
        await this.app.vault.createFolder(destFolder);
        this.logger.info(`Created destination folder: ${destFolder}`);
      }

      // Move the file
      await this.app.vault.rename(this.activeFile, destinationPath);

      this.logger.info("Moved article after publication", {
        from: filePath,
        to: destinationPath
      });

      new Notice(`Article déplacé vers:\n${destinationPath}`);
    } catch (error) {
      this.logger.error("Failed to move article after publication", error);
      // Don't fail the publication - just warn
      new Notice(`Impossible de déplacer l'article: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check for published notes that link to this file and offer to update them
   * This ensures backlinks are resolved after publishing a new article
   */
  private async checkAndUpdateBacklinks(): Promise<void> {
    if (!this.activeFile) return;

    const backlinks = this.wikiLinkConverter.findPublishedBacklinks(this.activeFile);

    if (backlinks.length === 0) {
      this.logger.debug("No published backlinks to update");
      return;
    }

    this.logger.info(`Found ${backlinks.length} published backlink(s) that may need updating`);

    // Show notice to user
    const backlinkNames = backlinks.map(b => b.file.basename).join(", ");
    new Notice(
      `${backlinks.length} article(s) publiés référencent "${this.activeFile.basename}":\n${backlinkNames}\n\nVoulez-vous les mettre à jour ?`,
      10000
    );

    // For now, just log. In a future version, we could:
    // 1. Show a modal asking if user wants to update backlinks
    // 2. Re-publish each backlinked article automatically
    // 3. Add a command to "Update all backlinks"

    // Auto-update backlinks (if they have wordpress_id)
    for (const backlink of backlinks) {
      if (!backlink.wordpressId) {
        this.logger.warn(`Backlink ${backlink.file.basename} has no wordpress_id, skipping update`);
        continue;
      }

      try {
        await this.updateBacklinkArticle(backlink.file, backlink.wordpressId);
      } catch (error) {
        this.logger.error(`Failed to update backlink ${backlink.file.basename}`, error);
      }
    }
  }

  /**
   * Update a single backlinked article on WordPress
   * Re-processes its content to resolve the newly published link
   */
  private async updateBacklinkArticle(file: TFile, wordpressId: number): Promise<void> {
    this.logger.info(`Updating backlink article: ${file.basename} (ID: ${wordpressId})`);

    // Read file content
    const content = await this.app.vault.cachedRead(file);

    // Remove frontmatter
    let cleanContent = content.replace(/^---[\s\S]*?---\n?/, "");

    // Process images - get enluminure from frontmatter if present
    const basePath = file.parent?.path || "";
    const fileCache = this.app.metadataCache.getFileCache(file);
    const fileEnluminure = fileCache?.frontmatter?.enluminure;
    const imageResult = await this.imageHandler.processMarkdownImages(
      cleanContent,
      basePath,
      typeof fileEnluminure === "string" ? fileEnluminure : undefined
    );
    cleanContent = imageResult.processedMarkdown;

    // Process wikilinks (this will now resolve the newly published link)
    const wikiLinkResult = this.wikiLinkConverter.processWikiLinks(cleanContent);
    cleanContent = wikiLinkResult.processed;

    // Convert to HTML
    let finalHtml = this.markdownToHtml(cleanContent);

    // Handle enluminure if present
    if (imageResult.enluminure?.wordpressUrl) {
      const cache = this.app.metadataCache.getFileCache(file);
      const title = cache?.frontmatter?.title || file.basename;
      finalHtml = this.generateEnluminureHtml(imageResult.enluminure, title, finalHtml);
    }

    // Get frontmatter to determine type
    const cache = this.app.metadataCache.getFileCache(file);
    const isPage = cache?.frontmatter?.type === "page";

    // Update on WordPress
    if (isPage) {
      const result = await this.api.updatePage(wordpressId, { content: finalHtml });
      if (result.success) {
        this.logger.info(`Updated backlink page: ${file.basename}`);
        new Notice(`Mis à jour: ${file.basename}`);
      } else {
        throw new Error(result.error || "Update failed");
      }
    } else {
      const result = await this.api.updatePost(wordpressId, { content: finalHtml });
      if (result.success) {
        this.logger.info(`Updated backlink article: ${file.basename}`);
        new Notice(`Mis à jour: ${file.basename}`);
      } else {
        throw new Error(result.error || "Update failed");
      }
    }
  }

  /**
   * Publish bilingual content to WordPress using Polylang
   * 1. Publish FR version first
   * 2. Publish EN version with translation link to FR
   */
  private async saveBilingualToWordPress(status: WordPressPostStatus): Promise<void> {
    if (!this.bilingualContent || !this.currentServer.polylang) {
      this.setButtonsDisabled(false);
      return;
    }

    const polylangConfig = this.currentServer.polylang;

    try {
      // Get category IDs for both languages
      const categoryMapping = polylangConfig.categoryMapping[this.category];
      if (!categoryMapping) {
        throw new Error(`No Polylang category mapping for: ${this.category}`);
      }

      this.logger.info("Starting bilingual publication", {
        category: this.category,
        frCategoryId: categoryMapping.fr,
        enCategoryId: categoryMapping.en
      });

      // ===== PUBLISH FR VERSION =====
      const frContent = this.bilingualContent.fr;
      const frHtmlResult = await this.processLanguageContent(frContent, "fr");
      if (!frHtmlResult) {
        throw new Error("Failed to process FR content");
      }

      // Resolve FR tags
      let frTagIds: number[] = [];
      if (frContent.tags && frContent.tags.length > 0) {
        const tagResult = await this.api.resolveTagIds(frContent.tags);
        frTagIds = tagResult.ids;
      }

      // Build FR SEO options
      const frSeoOptions: {
        slug?: string;
        excerpt?: string;
        rankMathMeta?: RankMathMeta;
        tags?: number[];
        lang: "fr";
      } = { lang: "fr" };

      if (frContent.slug) frSeoOptions.slug = frContent.slug;
      if (frContent.excerpt) frSeoOptions.excerpt = frContent.excerpt;
      if (frTagIds.length > 0) frSeoOptions.tags = frTagIds;

      // Build FR Rank Math meta
      if (frContent.focus_keyword || frContent.excerpt) {
        const rankMath: RankMathMeta = {};
        if (frContent.focus_keyword) rankMath.rank_math_focus_keyword = frContent.focus_keyword;
        if (frContent.excerpt) rankMath.rank_math_description = frContent.excerpt;
        if (frHtmlResult.enluminure?.wordpressUrl) {
          rankMath.rank_math_facebook_image = frHtmlResult.enluminure.wordpressUrl;
          rankMath.rank_math_twitter_use_facebook = "on";
        }
        frSeoOptions.rankMathMeta = rankMath;
      }

      // Create/Update FR post
      const frResult = await this.api.createPost(
        frContent.title,
        frHtmlResult.html,
        [categoryMapping.fr],
        status,
        frSeoOptions
      );

      if (!frResult.success || !frResult.data) {
        throw new Error(`Failed to publish FR: ${frResult.error}`);
      }

      const frPostId = frResult.data.id;
      const frUrl = frResult.data.link;
      this.logger.info(`Published FR version: ${frUrl} (ID: ${frPostId})`);

      // ===== PUBLISH EN VERSION WITH TRANSLATION LINK =====
      const enContent = this.bilingualContent.en;
      const enHtmlResult = await this.processLanguageContent(enContent, "en");
      if (!enHtmlResult) {
        throw new Error("Failed to process EN content");
      }

      // Resolve EN tags
      let enTagIds: number[] = [];
      if (enContent.tags && enContent.tags.length > 0) {
        const tagResult = await this.api.resolveTagIds(enContent.tags);
        enTagIds = tagResult.ids;
      }

      // Build EN SEO options with translation link
      const enSeoOptions: {
        slug?: string;
        excerpt?: string;
        rankMathMeta?: RankMathMeta;
        tags?: number[];
        lang: "en";
        translations: Record<string, number>;
      } = {
        lang: "en",
        translations: { fr: frPostId }
      };

      if (enContent.slug) enSeoOptions.slug = enContent.slug;
      if (enContent.excerpt) enSeoOptions.excerpt = enContent.excerpt;
      if (enTagIds.length > 0) enSeoOptions.tags = enTagIds;

      // Build EN Rank Math meta
      if (enContent.focus_keyword || enContent.excerpt) {
        const rankMath: RankMathMeta = {};
        if (enContent.focus_keyword) rankMath.rank_math_focus_keyword = enContent.focus_keyword;
        if (enContent.excerpt) rankMath.rank_math_description = enContent.excerpt;
        if (enHtmlResult.enluminure?.wordpressUrl) {
          rankMath.rank_math_facebook_image = enHtmlResult.enluminure.wordpressUrl;
          rankMath.rank_math_twitter_use_facebook = "on";
        }
        enSeoOptions.rankMathMeta = rankMath;
      }

      // Create/Update EN post
      const enResult = await this.api.createPost(
        enContent.title,
        enHtmlResult.html,
        [categoryMapping.en],
        status,
        enSeoOptions
      );

      if (!enResult.success || !enResult.data) {
        throw new Error(`Failed to publish EN: ${enResult.error}`);
      }

      const enUrl = enResult.data.link;
      this.logger.info(`Published EN version: ${enUrl}`);

      // ===== SUCCESS =====
      const statusText = status === "publish" ? "published" : "draft";
      new Notice(
        `Bilingual ${statusText}:\n🇫🇷 ${frUrl}\n🇬🇧 ${enUrl}`
      );

      // Update frontmatter with both URLs
      if (this.activeFile) {
        try {
          await this.app.fileManager.processFrontMatter(
            this.activeFile,
            (frontmatter) => {
              frontmatter.wordpress_url_fr = frUrl;
              frontmatter.wordpress_url_en = enUrl;
            }
          );
          this.logger.info("Updated frontmatter with bilingual WordPress URLs");
        } catch (error) {
          this.logger.warn("Failed to update frontmatter", error);
        }
      }

      this.close();
    } catch (error) {
      this.logger.error("Failed to publish bilingual content", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to publish bilingual: ${errorMessage}`);
      this.setButtonsDisabled(false);
    }
  }

  /**
   * Process content for a specific language
   * Handles images, wikilinks, and converts to HTML
   */
  private async processLanguageContent(
    langContent: LanguageContent,
    _lang: PolylangLanguage
  ): Promise<{ html: string; enluminure?: WordPressEnluminureInfo } | null> {
    if (!this.activeFile) return null;

    let markdown = langContent.content;

    // Process images - enluminure can be specified in the language content
    const basePath = this.activeFile.parent?.path || "";
    const imageResult = await this.imageHandler.processMarkdownImages(
      markdown,
      basePath,
      langContent.enluminure
    );
    markdown = imageResult.processedMarkdown;

    // Process wikilinks
    const wikiLinkResult = this.wikiLinkConverter.processWikiLinks(markdown);
    markdown = wikiLinkResult.processed;

    // Convert to HTML
    const html = this.markdownToHtml(markdown);

    // If there's an enluminure, wrap with enluminure HTML
    if (imageResult.enluminure?.wordpressUrl) {
      const enluminuredHtml = this.generateEnluminureHtml(
        imageResult.enluminure,
        langContent.title,
        html
      );
      return { html: enluminuredHtml, enluminure: imageResult.enluminure };
    }

    if (imageResult.enluminure) {
      return { html, enluminure: imageResult.enluminure };
    }
    return { html };
  }

  private setButtonsDisabled(disabled: boolean, text?: string) {
    if (this.draftButton) {
      this.draftButton.disabled = disabled;
      if (text) this.draftButton.textContent = text;
      else this.draftButton.textContent = "Save as draft";
    }
    if (this.publishButton) {
      this.publishButton.disabled = disabled;
      if (text) this.publishButton.textContent = text;
      else this.publishButton.textContent = "Publish";
    }
  }

  override onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
