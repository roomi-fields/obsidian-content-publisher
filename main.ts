import {
  App,
  Modal,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder
} from "obsidian";
import { Logger, LogLevel, createLogger } from "./src/utils/logger";
import { SubstackAPI } from "./src/substack/api";
import { SubstackPostComposer } from "./src/substack/PostComposer";
import { SubstackAuth } from "./src/substack/auth";
import { SubstackAudience, SubstackSection } from "./src/substack/types";
import { WordPressAPI } from "./src/wordpress/api";
import { WordPressPostComposer } from "./src/wordpress/PostComposer";
import { WordPressCategoryMapping, WordPressServer, WordPressEnluminureInfo, RankMathMeta } from "./src/wordpress/types";
import { WordPressImageHandler } from "./src/wordpress/imageHandler";
import { WikiLinkConverter } from "./src/wordpress/wikiLinkConverter";
import { convertMarkdownToHtml } from "./src/wordpress/markdownConverter";
import { LinkedInAPI } from "./src/linkedin/api";
import { LinkedInPostComposer } from "./src/linkedin/PostComposer";
import { LinkedInVisibility } from "./src/linkedin/types";
import { StaticSitePostComposer } from "./src/staticsite/PostComposer";
import { normalizeFolder } from "./src/staticsite/converter";
import { renderStaticSiteSettings } from "./src/staticsite/settingsTab";
import { DEFAULT_STATIC_SITE, StaticSiteConfig } from "./src/staticsite/types";

interface SubstackPublisherSettings {
  devMode: boolean;
  logLevel: LogLevel;
  substackCookie: string;
  publications: string[];
  defaultPublication: string;
  sections: SubstackSection[];
  defaultSectionId: number | null;
  defaultAudience: SubstackAudience;
  defaultTags: string[];
  paidSubscribersEnabled: boolean;
  defaultAddWordPressLink: boolean;
  // WordPress settings (legacy - single server)
  wordpressEnabled: boolean;
  wordpressBaseUrl: string;
  wordpressUsername: string;
  wordpressPassword: string;
  wordpressCategoryPageIds: WordPressCategoryMapping;
  wordpressDefaultCategory: string;
  // WordPress multi-server settings
  wordpressServers: WordPressServer[];
  wordpressDefaultServerId: string;
  // LinkedIn settings
  linkedinEnabled: boolean;
  linkedinAccessToken: string;
  linkedinPersonId: string;
  linkedinDefaultVisibility: LinkedInVisibility;
  // Static site (vault folder) settings
  staticSite: StaticSiteConfig;
}

const DEFAULT_SETTINGS: SubstackPublisherSettings = {
  devMode: false,
  logLevel: LogLevel.ERROR,
  substackCookie: "",
  publications: [],
  defaultPublication: "",
  sections: [],
  defaultSectionId: null,
  defaultAudience: "everyone",
  defaultTags: [],
  paidSubscribersEnabled: false,
  defaultAddWordPressLink: false,
  // WordPress defaults - Category IDs for articles
  wordpressEnabled: false,
  wordpressBaseUrl: "",
  wordpressUsername: "",
  wordpressPassword: "",
  wordpressCategoryPageIds: {},
  wordpressDefaultCategory: "",
  // Multi-server defaults
  wordpressServers: [],
  wordpressDefaultServerId: "",
  // LinkedIn defaults
  linkedinEnabled: false,
  linkedinAccessToken: "",
  linkedinPersonId: "",
  linkedinDefaultVisibility: "PUBLIC",
  staticSite: DEFAULT_STATIC_SITE
};

export default class SubstackPublisherPlugin extends Plugin {
  settings!: SubstackPublisherSettings;
  logger!: Logger | ReturnType<typeof createLogger>;

  override async onload() {
    await this.loadSettings();

    this.logger = createLogger(
      "Content Publisher",
      this.settings.devMode,
      this.settings.logLevel
    );

    if ("setApp" in this.logger) {
      this.logger.setApp(this.app);
    }

    this.logger.logPluginLoad();

    const ribbonIconEl = this.addRibbonIcon(
      "send",
      "Publish to Substack",
      () => {
        this.publishToSubstack();
      }
    );

    ribbonIconEl.addClass("substack-ribbon-class");

    // WordPress ribbon icon (only if enabled)
    if (this.settings.wordpressEnabled) {
      const wpRibbonIconEl = this.addRibbonIcon(
        "globe",
        "Publish to WordPress",
        () => {
          this.publishToWordPress();
        }
      );
      wpRibbonIconEl.addClass("wordpress-ribbon-class");

      // Move WordPress icon to bottom too
      this.app.workspace.onLayoutReady(() => {
        activeWindow.setTimeout(() => {
          wpRibbonIconEl.parentElement?.appendChild(wpRibbonIconEl);
        }, 100);
      });
    }

    // LinkedIn ribbon icon (only if enabled)
    if (this.settings.linkedinEnabled) {
      const liRibbonIconEl = this.addRibbonIcon(
        "linkedin",
        "Publish to LinkedIn",
        () => {
          this.publishToLinkedIn();
        }
      );
      liRibbonIconEl.addClass("linkedin-ribbon-class");

      // Move LinkedIn icon to bottom too
      this.app.workspace.onLayoutReady(() => {
        activeWindow.setTimeout(() => {
          liRibbonIconEl.parentElement?.appendChild(liRibbonIconEl);
        }, 100);
      });
    }

    // Static site ribbon icon (only if enabled)
    if (this.settings.staticSite.enabled) {
      const siteRibbonIconEl = this.addRibbonIcon(
        "book-open",
        "Publish to static site",
        () => {
          this.publishToStaticSite();
        }
      );
      this.app.workspace.onLayoutReady(() => {
        activeWindow.setTimeout(() => {
          siteRibbonIconEl.parentElement?.appendChild(siteRibbonIconEl);
        }, 100);
      });
    }

    // Move icon to bottom of ribbon after layout is ready
    this.app.workspace.onLayoutReady(() => {
      activeWindow.setTimeout(() => {
        ribbonIconEl.parentElement?.appendChild(ribbonIconEl);
      }, 100);
    });

    this.addCommand({
      id: "publish-to-substack",
      name: "Publish to Substack",
      callback: () => {
        this.publishToSubstack();
      }
    });

    this.addCommand({
      id: "publish-to-wordpress",
      name: "Publish to WordPress",
      callback: () => {
        this.publishToWordPress();
      }
    });

    this.addCommand({
      id: "publish-to-linkedin",
      name: "Publish to LinkedIn",
      callback: () => {
        this.publishToLinkedIn();
      }
    });

    this.addCommand({
      id: "publish-to-static-site",
      name: "Publish to static site",
      callback: () => {
        this.publishToStaticSite();
      }
    });

    this.addCommand({
      id: "republish-all-articles",
      name: "Republish all blog articles",
      callback: () => {
        void this.republishAllArticles();
      }
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        // Context menu: batch publish folder to WordPress
        if (file instanceof TFolder && this.settings.wordpressEnabled) {
          menu.addItem((item) => {
            item
              .setTitle("Publish folder to WordPress")
              .setIcon("upload")
              .onClick(() => this.batchPublishFolder(file));
          });
        }
      })
    );

    this.addSettingTab(new SubstackPublisherSettingTab(this.app, this));
  }

  override onunload() {
    this.logger.logPluginUnload();
  }

  async loadSettings() {
    const data = ((await this.loadData()) ?? {}) as Partial<SubstackPublisherSettings>;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    // Nested settings: fresh copy of the defaults, completed field by field
    const defaults = structuredClone(DEFAULT_STATIC_SITE);
    this.settings.staticSite = {
      ...defaults,
      ...data.staticSite,
      fields: { ...defaults.fields, ...data.staticSite?.fields }
    };

    // Migration: convert old single-server config to multi-server
    if (
      this.settings.wordpressBaseUrl &&
      this.settings.wordpressServers.length === 0
    ) {
      const legacyServer: WordPressServer = {
        id: "legacy",
        name: "WordPress",
        baseUrl: this.settings.wordpressBaseUrl,
        username: this.settings.wordpressUsername,
        password: this.settings.wordpressPassword,
        categoryPageIds: this.settings.wordpressCategoryPageIds,
        defaultCategory: this.settings.wordpressDefaultCategory
      };
      this.settings.wordpressServers = [legacyServer];
      this.settings.wordpressDefaultServerId = "legacy";
      // Clear legacy fields
      this.settings.wordpressBaseUrl = "";
      this.settings.wordpressUsername = "";
      this.settings.wordpressPassword = "";
      this.settings.wordpressCategoryPageIds = {};
      this.settings.wordpressDefaultCategory = "";
      await this.saveData(this.settings);
    }

    if (this.logger) {
      this.logger = createLogger(
        "Content Publisher",
        this.settings.devMode,
        this.settings.logLevel
      );
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);

    if (this.logger) {
      this.logger = createLogger(
        "Content Publisher",
        this.settings.devMode,
        this.settings.logLevel
      );
    }
  }

  private publishToSubstack(): void {
    this.logger.logCommandExecution("publish-to-substack");

    if (!this.settings.substackCookie) {
      new Notice(
        "Please configure your Substack authentication in settings first."
      );
      return;
    }

    if (this.settings.publications.length === 0) {
      new Notice(
        "Please click 'refresh' in settings to fetch your publications."
      );
      return;
    }

    const api = new SubstackAPI(this.settings.substackCookie);

    const composer = new SubstackPostComposer(
      this.app,
      api,
      this.settings.publications,
      this.logger,
      {
        defaultPublication:
          this.settings.defaultPublication ||
          this.settings.publications[0] ||
          "",
        defaultSectionId: this.settings.defaultSectionId,
        defaultAudience: this.settings.defaultAudience,
        defaultTags: this.settings.defaultTags,
        paidSubscribersEnabled: this.settings.paidSubscribersEnabled,
        defaultAddWordPressLink: this.settings.defaultAddWordPressLink,
        onWordPressLinkPreferenceChange: (value: boolean) => {
          this.settings.defaultAddWordPressLink = value;
          void this.saveSettings();
        }
      }
    );
    composer.open();
  }

  private publishToWordPress(): void {
    this.logger.logCommandExecution("publish-to-wordpress");

    if (!this.settings.wordpressEnabled) {
      new Notice("WordPress publishing is not enabled. Enable it in settings.");
      return;
    }

    if (this.settings.wordpressServers.length === 0) {
      new Notice("Please configure at least one WordPress server in settings.");
      return;
    }

    // Check all servers have passwords
    const serversWithoutPassword = this.settings.wordpressServers.filter(s => !s.password);
    if (serversWithoutPassword.length > 0) {
      new Notice(`Please configure passwords for: ${serversWithoutPassword.map(s => s.name).join(", ")}`);
      return;
    }

    const composer = new WordPressPostComposer(this.app, this.logger, {
      servers: this.settings.wordpressServers,
      defaultServerId: this.settings.wordpressDefaultServerId
    });
    composer.open();
  }

  private publishToLinkedIn(): void {
    this.logger.logCommandExecution("publish-to-linkedin");

    if (!this.settings.linkedinEnabled) {
      new Notice("LinkedIn publishing is not enabled. Enable it in settings.");
      return;
    }

    if (!this.settings.linkedinAccessToken) {
      new Notice("Please configure your LinkedIn access token in settings.");
      return;
    }

    if (!this.settings.linkedinPersonId) {
      new Notice("Please configure your LinkedIn person ID in settings.");
      return;
    }

    const api = new LinkedInAPI(
      this.settings.linkedinAccessToken,
      this.settings.linkedinPersonId
    );

    const composer = new LinkedInPostComposer(this.app, api, this.logger, {
      defaultVisibility: this.settings.linkedinDefaultVisibility
    });
    composer.open();
  }

  private publishToStaticSite(): void {
    this.logger.logCommandExecution("publish-to-static-site");

    const config = this.settings.staticSite;
    if (!config.enabled) {
      new Notice("Static site publishing is not enabled. Enable it in settings.");
      return;
    }
    const missing = config.sections.filter(
      (s) => s.name && !(this.app.vault.getAbstractFileByPath(normalizeFolder(s.folder)) instanceof TFolder)
    );
    if (!config.sections.some((s) => s.name && s.folder)) {
      new Notice("Add at least one section of the static site in settings.");
      return;
    }
    if (missing.length) {
      new Notice(`Section folder not found in the vault: ${missing.map((s) => s.folder).join(", ")}`);
      return;
    }

    new StaticSitePostComposer(this.app, config).open();
  }

  /**
   * Get all configured WordPress servers
   */
  getWordPressServers(): WordPressServer[] {
    return this.settings.wordpressServers;
  }

  /**
   * Get the default WordPress server
   */
  getDefaultWordPressServer(): WordPressServer | undefined {
    return this.settings.wordpressServers.find(
      (s) => s.id === this.settings.wordpressDefaultServerId
    );
  }

  /**
   * Batch publish all markdown files in a folder to WordPress
   * - Publishes each file only once (no duplicate updates from backlinks)
   * - Shows progress during batch
   * - Handles errors gracefully
   */
  private async batchPublishFolder(folder: TFolder): Promise<void> {
    if (!this.settings.wordpressEnabled || this.settings.wordpressServers.length === 0) {
      new Notice("WordPress is not configured");
      return;
    }

    // Collect all markdown files in folder (non-recursive)
    const mdFiles: TFile[] = [];
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === "md") {
        // Only include files that have wordpress_id (already published)
        // or have the required frontmatter for publishing
        const cache = this.app.metadataCache.getFileCache(child);
        if (cache?.frontmatter) {
          mdFiles.push(child);
        }
      }
    }

    if (mdFiles.length === 0) {
      new Notice(`No markdown files in ${folder.name}`);
      return;
    }

    // Show confirmation modal
    const confirmed = await new Promise<boolean>((resolve) => {
      new BatchPublishConfirmModal(this.app, folder.name, mdFiles.length, resolve).open();
    });

    if (!confirmed) {
      new Notice("Publishing cancelled");
      return;
    }

    // Get default server
    const server = this.settings.wordpressServers.find(s => s.id === this.settings.wordpressDefaultServerId)
      ?? this.settings.wordpressServers[0];

    if (!server) {
      new Notice("No WordPress server configured");
      return;
    }

    // Initialize handlers (same as PostComposer)
    const api = new WordPressAPI(server.baseUrl, server.username, server.password);
    const imageHandler = new WordPressImageHandler(api, this.app, this.logger);
    const wikiLinkConverter = new WikiLinkConverter(this.app, this.logger);

    // Track published files to avoid duplicate updates
    const publishedPaths = new Set<string>();
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Create ONE persistent notice with all articles listed
    const noticeFragment = createFragment();
    const noticeContainer = activeDocument.createElement("div");
    noticeContainer.classList.add("batch-notice-container");

    // Header
    const header = activeDocument.createElement("div");
    header.classList.add("batch-notice-header");
    header.textContent = `Publishing ${mdFiles.length} articles from ${folder.name}`;
    noticeContainer.appendChild(header);

    // Create a line for each article
    const articleLines: Map<string, HTMLSpanElement> = new Map();
    for (const file of mdFiles) {
      const line = activeDocument.createElement("div");
      line.classList.add("batch-notice-line");
      const statusSpan = activeDocument.createElement("span");
      statusSpan.textContent = `📄 ${file.basename}`;
      line.appendChild(statusSpan);
      noticeContainer.appendChild(line);
      articleLines.set(file.path, statusSpan);
    }

    noticeFragment.appendChild(noticeContainer);

    // Show the persistent notice (0 = no auto-hide)
    const batchNotice = new Notice(noticeFragment, 0);

    for (let i = 0; i < mdFiles.length; i++) {
      const file = mdFiles[i];
      if (!file) continue;

      // Skip if already published in this batch
      if (publishedPaths.has(file.path)) {
        this.logger.debug(`Skipping already published: ${file.basename}`);
        continue;
      }

      // Update status to show current article is being processed
      const statusSpan = articleLines.get(file.path);
      if (statusSpan) {
        statusSpan.textContent = `📄 ${file.basename} ⏳`;
      }

      try {
        await this.batchPublishSingleFile(file, api, server, imageHandler, wikiLinkConverter);
        publishedPaths.add(file.path);
        successCount++;
        // Update to checkmark
        if (statusSpan) {
          statusSpan.textContent = `📄 ${file.basename} ✓`;
        }
        this.logger.info(`✓ ${file.basename}`);
      } catch (error) {
        errorCount++;
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${file.basename}: ${msg}`);
        if (statusSpan) {
          statusSpan.textContent = `📄 ${file.basename} ✗ ${msg.substring(0, 80)}`;
        }
      }
    }

    // Update header with final summary
    header.textContent = `✅ Publish complete: ${successCount} succeeded${errorCount > 0 ? `, ${errorCount} error(s)` : ""}`;
    if (errorCount > 0) {
      this.logger.warn("Batch errors:", errors);
    }

    // Auto-hide after 5 seconds
    activeWindow.setTimeout(() => batchNotice.hide(), 5000);
  }

  /**
   * Republish all articles already published on the default WordPress blog.
   * Scans the entire vault for files with wordpress_id matching the default server's baseUrl.
   */
  private async republishAllArticles(): Promise<void> {
    if (!this.settings.wordpressEnabled || this.settings.wordpressServers.length === 0) {
      new Notice("WordPress is not configured");
      return;
    }

    const server = this.settings.wordpressServers.find(s => s.id === this.settings.wordpressDefaultServerId)
      ?? this.settings.wordpressServers[0];

    if (!server) {
      new Notice("No WordPress server configured");
      return;
    }

    // Scan the entire vault recursively for .md files with wordpress_id
    const allFiles = this.app.vault.getMarkdownFiles();
    const matchingFiles: TFile[] = [];

    for (const file of allFiles) {
      // Exclude files in _en/ directories (handled via bilingual mechanism from FR parent)
      if (file.path.includes("/_en/")) continue;

      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache?.frontmatter) continue;

      const fm = cache.frontmatter;
      if (!fm.wordpress_id) continue;

      // If wordpress_url exists, match it against the server's baseUrl
      if (fm.wordpress_url) {
        const wpUrl = String(fm.wordpress_url);
        const serverHost = new URL(server.baseUrl).hostname;
        try {
          const articleHost = new URL(wpUrl).hostname;
          if (articleHost !== serverHost) continue;
        } catch {
          continue;
        }
      }

      matchingFiles.push(file);
    }

    if (matchingFiles.length === 0) {
      new Notice("No published articles found in the vault");
      return;
    }

    // Sort by name for consistent ordering
    matchingFiles.sort((a, b) => a.basename.localeCompare(b.basename));

    // Show confirmation modal
    const confirmed = await new Promise<boolean>((resolve) => {
      new BatchPublishConfirmModal(this.app, `blog ${server.name}`, matchingFiles.length, resolve).open();
    });

    if (!confirmed) {
      new Notice("Republishing cancelled");
      return;
    }

    // Initialize handlers (same as batchPublishFolder)
    const api = new WordPressAPI(server.baseUrl, server.username, server.password);
    const imageHandler = new WordPressImageHandler(api, this.app, this.logger);
    const wikiLinkConverter = new WikiLinkConverter(this.app, this.logger);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Create ONE persistent notice with all articles listed
    const noticeFragment = createFragment();
    const noticeContainer = activeDocument.createElement("div");
    noticeContainer.classList.add("batch-notice-container");

    const header = activeDocument.createElement("div");
    header.classList.add("batch-notice-header");
    header.textContent = `Republishing ${matchingFiles.length} articles — ${server.name}`;
    noticeContainer.appendChild(header);

    const articleLines: Map<string, HTMLSpanElement> = new Map();
    for (const file of matchingFiles) {
      const line = activeDocument.createElement("div");
      line.classList.add("batch-notice-line");
      const statusSpan = activeDocument.createElement("span");
      statusSpan.textContent = `📄 ${file.basename}`;
      line.appendChild(statusSpan);
      noticeContainer.appendChild(line);
      articleLines.set(file.path, statusSpan);
    }

    noticeFragment.appendChild(noticeContainer);
    const batchNotice = new Notice(noticeFragment, 0);

    for (const file of matchingFiles) {
      const statusSpan = articleLines.get(file.path);
      if (statusSpan) {
        statusSpan.textContent = `📄 ${file.basename} ⏳`;
      }

      try {
        await this.batchPublishSingleFile(file, api, server, imageHandler, wikiLinkConverter);
        successCount++;
        if (statusSpan) {
          statusSpan.textContent = `📄 ${file.basename} ✓`;
        }
        this.logger.info(`✓ ${file.basename}`);
      } catch (error) {
        errorCount++;
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${file.basename}: ${msg}`);
        if (statusSpan) {
          statusSpan.textContent = `📄 ${file.basename} ✗ ${msg.substring(0, 80)}`;
        }
      }
    }

    // Update header with final summary
    header.textContent = `✅ Republish complete: ${successCount} succeeded${errorCount > 0 ? `, ${errorCount} error(s)` : ""}`;
    if (errorCount > 0) {
      this.logger.warn("Republish errors:", errors);
    }

    // Auto-hide after 5 seconds
    activeWindow.setTimeout(() => batchNotice.hide(), 5000);
  }

  /**
   * Publish a single file during batch operation
   * Uses full image processing and wikilink conversion (same as PostComposer)
   * Does NOT trigger backlink updates (to avoid cascading republishes)
   */
  private async batchPublishSingleFile(
    file: TFile,
    api: WordPressAPI,
    server: WordPressServer,
    imageHandler: WordPressImageHandler,
    wikiLinkConverter: WikiLinkConverter
  ): Promise<void> {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache?.frontmatter) {
      throw new Error("No frontmatter");
    }

    const fm = cache.frontmatter;
    const title = fm.title || file.basename;
    const wordpressId = fm.wordpress_id as number | undefined;
    const contentType = fm.type === "page" ? "page" : "article";
    const enluminurePath = typeof fm.enluminure === "string" ? fm.enluminure : undefined;

    // Detect correct server from wordpress_url (may differ from default)
    let actualApi = api;
    let actualServer = server;
    let actualImageHandler = imageHandler;
    if (fm.wordpress_url && wordpressId) {
      try {
        const articleHost = new URL(String(fm.wordpress_url)).hostname;
        const serverHost = new URL(server.baseUrl).hostname;
        if (articleHost !== serverHost) {
          const matched = this.settings.wordpressServers.find(s => {
            try { return new URL(s.baseUrl).hostname === articleHost; } catch { return false; }
          });
          if (matched) {
            actualServer = matched;
            actualApi = new WordPressAPI(matched.baseUrl, matched.username, matched.password);
            actualImageHandler = new WordPressImageHandler(actualApi, this.app, this.logger);
          }
        }
      } catch { /* invalid URL, use default */ }
    }

    // Read content
    let content = await this.app.vault.cachedRead(file);

    // Remove frontmatter
    content = content.replace(/^---[\s\S]*?---\n?/, "");

    // Remove dataviewjs blocks
    content = content.replace(/```dataviewjs[\s\S]*?```\n*/g, "");

    // Convert TikZ blocks to PNG images (must run before processMarkdownImages)
    content = await actualImageHandler.processTikzBlocks(content);

    // Process images - upload to WordPress (including enluminure)
    const basePath = file.parent?.path || "";
    const imageResult = await actualImageHandler.processMarkdownImages(content, basePath, enluminurePath);
    content = imageResult.processedMarkdown;

    if (imageResult.errors.length > 0) {
      this.logger.warn(`Image errors for ${file.basename}:`, imageResult.errors);
    }

    // Process wikilinks - convert to WordPress internal links
    const wikiLinkResult = wikiLinkConverter.processWikiLinks(content);
    content = wikiLinkResult.processed;

    if (wikiLinkResult.unresolved.length > 0) {
      this.logger.debug(`Unresolved wikilinks in ${file.basename}:`, wikiLinkResult.unresolved);
    }

    // Convert markdown to HTML (full conversion)
    const html = convertMarkdownToHtml(content);

    // Extract illustration (first image after H1)
    const { illustration, content: htmlWithoutIllustration } = this.extractIllustrationForBatch(html);

    // Build final HTML - illustration ALWAYS at top, then title
    let finalHtml: string;
    if (imageResult.enluminure?.wordpressUrl) {
      // Has enluminure - wrap content in enluminure structure
      const enluminureBlock = this.generateEnluminureHtmlForBatch(
        imageResult.enluminure,
        title,
        htmlWithoutIllustration
      );
      finalHtml = illustration ? `${illustration}\n${enluminureBlock}` : enluminureBlock;
    } else {
      // No enluminure - still ensure illustration is above title
      // Wrap content in article-body div for consistent styling
      const wrappedContent = `<div class="article-body">\n${htmlWithoutIllustration}\n</div>`;
      finalHtml = illustration ? `${illustration}\n${wrappedContent}` : wrappedContent;
    }

    // Get category for articles
    let categoryId: number | undefined;
    if (contentType === "article") {
      const category = fm.categorie || fm.category || actualServer.defaultCategory;
      if (category && actualServer.categoryPageIds[category]) {
        categoryId = actualServer.categoryPageIds[category];
      }
    }

    // Build SEO options
    const seoOptions: {
      slug?: string;
      excerpt?: string;
      featuredMediaId?: number;
      rankMathMeta?: RankMathMeta;
      tags?: number[];
    } = {};

    if (fm.slug) seoOptions.slug = fm.slug;
    if (fm.excerpt) seoOptions.excerpt = fm.excerpt;
    if (imageResult.enluminure?.mediaId) {
      seoOptions.featuredMediaId = imageResult.enluminure.mediaId;
    }

    // Rank Math meta
    if (fm.focus_keyword || fm.excerpt || imageResult.enluminure?.wordpressUrl) {
      const rankMath: RankMathMeta = {};
      if (fm.focus_keyword) rankMath.rank_math_focus_keyword = fm.focus_keyword;
      if (fm.excerpt) rankMath.rank_math_description = fm.excerpt;
      if (imageResult.enluminure?.wordpressUrl) {
        rankMath.rank_math_facebook_image = imageResult.enluminure.wordpressUrl;
        rankMath.rank_math_twitter_use_facebook = "on";
      }
      seoOptions.rankMathMeta = rankMath;
    }

    // Resolve tags
    if (Array.isArray(fm.tags) && fm.tags.length > 0) {
      const tagResult = await actualApi.resolveTagIds(fm.tags.filter((t: unknown): t is string => typeof t === "string"));
      if (tagResult.ids.length > 0) {
        seoOptions.tags = tagResult.ids;
      }
    }

    this.logger.debug(`Batch publishing: ${title}`, { wordpressId, contentType, categoryId, hasEnluminure: !!imageResult.enluminure });

    let result;
    if (wordpressId) {
      // Update existing
      if (contentType === "page") {
        result = await actualApi.updatePage(wordpressId, {
          title,
          content: finalHtml,
          slug: seoOptions.slug,
          excerpt: seoOptions.excerpt
        });
      } else {
        result = await actualApi.updatePost(wordpressId, {
          title,
          content: finalHtml,
          categories: categoryId ? [categoryId] : undefined,
          tags: seoOptions.tags,
          slug: seoOptions.slug,
          excerpt: seoOptions.excerpt,
          meta: seoOptions.rankMathMeta
        });
      }
    } else {
      // Create new
      if (contentType === "page") {
        result = await actualApi.createPage(title, finalHtml, undefined, "publish");
      } else if (categoryId) {
        result = await actualApi.createPost(title, finalHtml, [categoryId], "publish", seoOptions);
      } else {
        throw new Error(`No category for article: ${title}`);
      }
    }

    if (!result.success) {
      throw new Error(result.error || "Publication failed");
    }

    // Update frontmatter with WordPress info (if new)
    if (!wordpressId && result.data) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter.type = contentType;
        frontmatter.wordpress_id = result.data!.id;
        frontmatter.wordpress_url = result.data!.link;
        frontmatter.wordpress_slug = result.data!.slug;
      });
    }
  }

  /**
   * Extract illustration for batch publishing
   */
  private extractIllustrationForBatch(html: string): { illustration: string | null; content: string } {
    const h1Match = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i);
    if (!h1Match) return { illustration: null, content: html };

    const h1End = html.indexOf(h1Match[0]) + h1Match[0].length;
    const htmlAfterH1 = html.substring(h1End);
    const imgMatch = htmlAfterH1.match(/<img[^>]+>/i);
    if (!imgMatch) return { illustration: null, content: html };

    const imgTag = imgMatch[0];
    const imgPosAfterH1 = htmlAfterH1.indexOf(imgTag);
    const contentBetween = htmlAfterH1.substring(0, imgPosAfterH1);
    const hasOnlyHeadersBetween = /^[\s]*(<h[23][^>]*>[\s\S]*?<\/h[23]>[\s]*)*$/i.test(contentBetween);

    if (imgPosAfterH1 < 300 || hasOnlyHeadersBetween) {
      const illustrationBlock = `<div class="article-illustration">\n${imgTag}\n</div>`;
      const imgPosInFull = h1End + imgPosAfterH1;
      const contentWithoutIllustration = html.substring(0, imgPosInFull) + html.substring(imgPosInFull + imgTag.length);
      return { illustration: illustrationBlock, content: contentWithoutIllustration };
    }

    return { illustration: null, content: html };
  }

  /**
   * Generate enluminure HTML structure for batch
   */
  private generateEnluminureHtmlForBatch(
    enluminure: WordPressEnluminureInfo,
    _title: string,
    bodyHtml: string
  ): string {
    const enluminureUrl = enluminure.wordpressUrl || "";

    // Process H1: wrap first letter in screen-reader-text
    const processedBodyHtml = bodyHtml.replace(
      /<h1([^>]*)>(.+?)<\/h1>/i,
      (_match, attrs, content) => {
        const trimmedContent = content.trim();
        const firstLetter = trimmedContent.charAt(0);
        const restOfTitle = trimmedContent.slice(1);
        return `<h1${attrs}><span class="screen-reader-text">${firstLetter}</span>${restOfTitle}</h1>`;
      }
    );

    return `<div class="enluminure-container">
<div class="enluminure-image-article">
<img src="${enluminureUrl}" alt="Image enluminure">
</div>
${processedBodyHtml}
</div>`;
  }
}

class SubstackPublisherSettingTab extends PluginSettingTab {
  plugin: SubstackPublisherPlugin;

  constructor(app: App, plugin: SubstackPublisherPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl).setName("Authentication").setHeading();

    // Login button (desktop only)
    if (Platform.isDesktop) {
      const authStatus = this.plugin.settings.substackCookie
        ? "✓ Logged in"
        : "Not logged in";

      new Setting(containerEl)
        .setName("Login")
        .setDesc(
          `${authStatus}. Click to open Substack login window and automatically capture your session`
        )
        .addButton((button) => {
          button
            .setButtonText(
              this.plugin.settings.substackCookie ? "Re-login" : "Login"
            )
            .setCta()
            .onClick(() => {
              const auth = new SubstackAuth((cookie) => {
                this.plugin.settings.substackCookie = cookie;
                void this.plugin.saveSettings().then(() => {
                  this.display(); // Refresh UI
                });
              });
              auth.login();
            });
        });
    }

    // Manual cookie input (always available as fallback)
    const manualSetting = new Setting(containerEl)
      .setName("Manual cookie entry")
      .setDesc(
        Platform.isDesktop
          ? "Alternative: paste your cookie manually if auto-login doesn't work"
          : "Paste your Substack session cookie (substack.sid) from browser DevTools → Application → Cookies"
      )
      .addText((text) => {
        text
          .setPlaceholder("Enter cookie value")
          .setValue(this.plugin.settings.substackCookie)
          .onChange(async (value) => {
            this.plugin.settings.substackCookie = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.addClass("substack-input-full-width");
      });

    // On desktop, make manual entry less prominent
    if (Platform.isDesktop) {
      manualSetting.settingEl.addClass("substack-setting-muted");
    }

    new Setting(containerEl).setName("Defaults").setHeading();

    // Refresh button to fetch publications and sections
    new Setting(containerEl)
      .setName("Refresh from Substack")
      .setDesc("Fetch your publications and sections from Substack")
      .addButton((button) => {
        button.setButtonText("↻ refresh").onClick(async () => {
          if (!this.plugin.settings.substackCookie) {
            new Notice("Please login first.");
            return;
          }

          button.setButtonText("...");
          button.setDisabled(true);

          try {
            const api = new SubstackAPI(this.plugin.settings.substackCookie);

            // Fetch publications with paid status info
            const publicationsInfo = await api.getUserPublicationsWithInfo();
            if (publicationsInfo.length > 0) {
              this.plugin.settings.publications = publicationsInfo.map(
                (p) => p.subdomain
              );

              // Auto-detect paid subscriptions for the default publication
              const defaultPubInfo =
                publicationsInfo.find(
                  (p) =>
                    p.subdomain === this.plugin.settings.defaultPublication
                ) || publicationsInfo[0];

              if (defaultPubInfo) {
                this.plugin.settings.paidSubscribersEnabled =
                  defaultPubInfo.hasPaidSubscriptions;
              }

              // Set default publication if not set or invalid
              if (
                !this.plugin.settings.defaultPublication ||
                !this.plugin.settings.publications.includes(
                  this.plugin.settings.defaultPublication
                )
              ) {
                this.plugin.settings.defaultPublication =
                  publicationsInfo[0]?.subdomain || "";
              }
            }

            // Fetch sections for default publication
            if (this.plugin.settings.defaultPublication) {
              const sections = await api.getSections(
                this.plugin.settings.defaultPublication
              );
              this.plugin.settings.sections = sections;
              // Set default section if not set or invalid
              const validSectionIds = sections
                .filter((s) => s.is_live)
                .map((s) => s.id);
              if (
                this.plugin.settings.defaultSectionId === null ||
                !validSectionIds.includes(this.plugin.settings.defaultSectionId)
              ) {
                // Default to first live section
                const firstLive = sections.find((s) => s.is_live);
                this.plugin.settings.defaultSectionId = firstLive?.id ?? null;
              }
            }

            await this.plugin.saveSettings();
            this.display(); // Refresh UI

            const paidStatus = this.plugin.settings.paidSubscribersEnabled
              ? "paid enabled"
              : "free only";
            new Notice(
              `Refreshed: ${this.plugin.settings.publications.length} publication(s), ${this.plugin.settings.sections.length} section(s), ${paidStatus}`
            );
          } catch (error) {
            const msg =
              error instanceof Error ? error.message : "Unknown error";
            new Notice(`Refresh failed: ${msg}`);
          } finally {
            button.setButtonText("↻ refresh");
            button.setDisabled(false);
          }
        });
      });

    // Default Publication dropdown
    const publicationSetting = new Setting(containerEl)
      .setName("Default publication")
      .setDesc(
        this.plugin.settings.publications.length === 0
          ? "Click 'refresh' above to load your publications"
          : "Publication used by default when publishing"
      );

    if (this.plugin.settings.publications.length > 0) {
      publicationSetting.addDropdown((dropdown) => {
        for (const pub of this.plugin.settings.publications) {
          dropdown.addOption(pub, pub);
        }
        dropdown.setValue(this.plugin.settings.defaultPublication || "");
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultPublication = value;
          // Reload sections for new publication
          if (this.plugin.settings.substackCookie) {
            const api = new SubstackAPI(this.plugin.settings.substackCookie);
            this.plugin.settings.sections = await api.getSections(value);
            const firstLive = this.plugin.settings.sections.find(
              (s) => s.is_live
            );
            this.plugin.settings.defaultSectionId = firstLive?.id ?? null;
          }
          await this.plugin.saveSettings();
          this.display(); // Refresh to update sections dropdown
        });
      });
    }

    // Default Section dropdown
    const liveSections = this.plugin.settings.sections.filter((s) => s.is_live);
    const sectionSetting = new Setting(containerEl)
      .setName("Default section")
      .setDesc(
        liveSections.length === 0
          ? "Click 'refresh' above to load your sections"
          : "Section used by default when publishing"
      );

    if (liveSections.length > 0) {
      sectionSetting.addDropdown((dropdown) => {
        for (const section of liveSections) {
          dropdown.addOption(section.id.toString(), section.name);
        }
        dropdown.setValue(
          this.plugin.settings.defaultSectionId?.toString() || ""
        );
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultSectionId = value
            ? parseInt(value)
            : null;
          await this.plugin.saveSettings();
        });
      });
    }

    // Paid subscribers toggle (informational, auto-detected)
    new Setting(containerEl)
      .setName("Paid subscribers enabled")
      .setDesc("Auto-detected from Substack. Toggle manually if incorrect.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.paidSubscribersEnabled)
          .onChange(async (value) => {
            this.plugin.settings.paidSubscribersEnabled = value;
            // Reset to "everyone" if disabling paid
            if (!value) {
              this.plugin.settings.defaultAudience = "everyone";
            }
            await this.plugin.saveSettings();
            this.display(); // Refresh to update audience options
          })
      );

    // Default Audience dropdown - only show if paid subscribers enabled
    if (this.plugin.settings.paidSubscribersEnabled) {
      new Setting(containerEl)
        .setName("Default audience")
        .setDesc("Audience used by default when publishing")
        .addDropdown((dropdown) => {
          dropdown.addOption("everyone", "Everyone");
          dropdown.addOption("only_paid", "Paid subscribers only");
          dropdown.addOption("founding", "Founding members only");
          dropdown.addOption("only_free", "Free subscribers only");
          dropdown.setValue(this.plugin.settings.defaultAudience);
          dropdown.onChange(async (value) => {
            this.plugin.settings.defaultAudience = value as SubstackAudience;
            await this.plugin.saveSettings();
          });
        });
    }

    // Default Tags
    new Setting(containerEl)
      .setName("Default tags")
      .setDesc("Tags added by default when publishing (comma-separated)")
      .addText((text) => {
        text
          .setPlaceholder("Enter tags")
          .setValue(this.plugin.settings.defaultTags.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.defaultTags = value
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          });
      });

    // Add WordPress link in footer (default)
    new Setting(containerEl)
      .setName("Add WordPress link by default")
      .setDesc("When enabled, the WordPress link checkbox will be checked by default (if WordPress_URL exists in frontmatter)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.defaultAddWordPressLink)
          .onChange(async (value) => {
            this.plugin.settings.defaultAddWordPressLink = value;
            await this.plugin.saveSettings();
          })
      );

    // WordPress Section
    new Setting(containerEl).setName("WordPress").setHeading();

    new Setting(containerEl)
      .setName("Enable WordPress")
      .setDesc("Enable publishing to WordPress (shows WordPress button in ribbon)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.wordpressEnabled)
          .onChange(async (value) => {
            this.plugin.settings.wordpressEnabled = value;
            await this.plugin.saveSettings();
            new Notice(
              value
                ? "WordPress enabled. Reload Obsidian to see the ribbon button."
                : "WordPress disabled."
            );
            this.display();
          })
      );

    if (this.plugin.settings.wordpressEnabled) {
      // Default server dropdown (if multiple servers)
      const servers = this.plugin.settings.wordpressServers;
      if (servers.length > 1) {
        new Setting(containerEl)
          .setName("Default server")
          .setDesc("Server used by default when publishing")
          .addDropdown((dropdown) => {
            for (const server of servers) {
              dropdown.addOption(server.id, server.name);
            }
            dropdown.setValue(this.plugin.settings.wordpressDefaultServerId || "");
            dropdown.onChange(async (value) => {
              this.plugin.settings.wordpressDefaultServerId = value;
              await this.plugin.saveSettings();
            });
          });
      }

      // Add server button
      new Setting(containerEl)
        .setName("Add server")
        .setDesc("Add a new WordPress server configuration")
        .addButton((button) => {
          button.setButtonText("+ add server").onClick(() => {
            const newServer: WordPressServer = {
              id: `server-${Date.now()}`,
              name: `WordPress ${servers.length + 1}`,
              baseUrl: "",
              username: "",
              password: "",
              categoryPageIds: {},
              defaultCategory: ""
            };
            this.plugin.settings.wordpressServers.push(newServer);
            if (servers.length === 0) {
              this.plugin.settings.wordpressDefaultServerId = newServer.id;
            }
            void this.plugin.saveSettings().then(() => {
              // Open edit modal directly instead of refreshing page
              this.showServerEditModal(newServer);
            });
          });
        });

      // Display each server
      for (const server of servers) {
        const serverContainer = containerEl.createDiv({ cls: "wordpress-server-container" });

        new Setting(serverContainer)
          .setName(server.name)
          .setDesc(server.baseUrl || "Not configured")
          .addButton((button) => {
            button.setButtonText("Edit").onClick(() => {
              this.showServerEditModal(server);
            });
          })
          .addButton((button) => {
            button
              .setButtonText("Test")
              .onClick(async () => {
                if (!server.baseUrl || !server.username || !server.password) {
                  new Notice("Please configure all server settings first.");
                  return;
                }
                button.setButtonText("...");
                button.setDisabled(true);
                try {
                  const api = new WordPressAPI(server.baseUrl, server.username, server.password);
                  const result = await api.testConnection();
                  if (result.success) {
                    new Notice(`${server.name}: Connection successful!`);
                  } else {
                    new Notice(`${server.name}: ${result.error}`);
                  }
                } catch (error) {
                  const msg = error instanceof Error ? error.message : "Unknown error";
                  new Notice(`${server.name}: ${msg}`);
                } finally {
                  button.setButtonText("Test");
                  button.setDisabled(false);
                }
              });
          })
          .addButton((button) => {
            button
              .setButtonText("Delete")
              .setWarning()
              .onClick(async () => {
                this.plugin.settings.wordpressServers = servers.filter((s) => s.id !== server.id);
                if (this.plugin.settings.wordpressDefaultServerId === server.id) {
                  this.plugin.settings.wordpressDefaultServerId =
                    this.plugin.settings.wordpressServers[0]?.id || "";
                }
                await this.plugin.saveSettings();
                this.display();
              });
          });
      }
    }

    // LinkedIn Section
    new Setting(containerEl).setName("LinkedIn").setHeading();

    new Setting(containerEl)
      .setName("Enable LinkedIn")
      .setDesc("Enable publishing to LinkedIn (shows LinkedIn button in ribbon)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.linkedinEnabled)
          .onChange(async (value) => {
            this.plugin.settings.linkedinEnabled = value;
            await this.plugin.saveSettings();
            new Notice(
              value
                ? "LinkedIn enabled. Reload Obsidian to see the ribbon button."
                : "LinkedIn disabled."
            );
            this.display();
          })
      );

    // Setup instructions - always visible so users know how to get credentials
    new Setting(containerEl)
      .setName("Step 1: create LinkedIn app")
      .setDesc("Create an app (requires a company page - create an empty one if needed)")
      .addButton((btn) => btn
        .setButtonText("Open LinkedIn developer portal")
        .onClick(() => {
          window.open("https://www.linkedin.com/developers/apps");
        }));

    new Setting(containerEl)
      .setName("Step 2: request API access")
      .setDesc("In 'products' tab, request 'share on LinkedIn' and 'sign in with LinkedIn using OpenID Connect'");

    new Setting(containerEl)
      .setName("Step 3: add redirect URL")
      .setDesc("In 'auth' tab, add this redirect URL (select and copy):")
      .addText((text) => {
        text.setValue("https://oauth.pstmn.io/v1/callback");
        text.inputEl.readOnly = true;
        text.inputEl.addClass("substack-input-full-width");
        text.inputEl.addClass("settings-cursor-text");
      });

    new Setting(containerEl)
      .setName("Step 4: note credentials")
      .setDesc("Copy your client ID and client secret from the 'auth' tab");

    new Setting(containerEl)
      .setName("Step 5: get access token with Postman")
      .setDesc("In Postman: new → HTTP, then go to 'auth' tab, select type 'OAuth 2.0', fill in the fields below:")
      .addButton((btn) => btn
        .setButtonText("Download Postman")
        .onClick(() => {
          window.open("https://www.postman.com/downloads/");
        }));

    new Setting(containerEl)
      .setName("Auth URL (copy to Postman)")
      .addText((text) => {
        text.setValue("https://www.linkedin.com/oauth/v2/authorization");
        text.inputEl.readOnly = true;
        text.inputEl.addClass("substack-input-full-width");
      });

    new Setting(containerEl)
      .setName("Access token URL (copy to Postman)")
      .addText((text) => {
        text.setValue("https://www.linkedin.com/oauth/v2/accessToken");
        text.inputEl.readOnly = true;
        text.inputEl.addClass("substack-input-full-width");
      });

    new Setting(containerEl)
      .setName("Callback URL (copy to Postman)")
      .addText((text) => {
        text.setValue("https://oauth.pstmn.io/v1/callback");
        text.inputEl.readOnly = true;
        text.inputEl.addClass("substack-input-full-width");
      });

    new Setting(containerEl)
      .setName("Scope (copy to Postman)")
      .addText((text) => {
        text.setValue("openid profile w_member_social");
        text.inputEl.readOnly = true;
        text.inputEl.addClass("substack-input-full-width");
      });

    new Setting(containerEl)
      .setName("Client authentication (important!)")
      .setDesc("In Postman OAuth 2.0 config, set 'client authentication' to 'send client credentials in body' (not header)");

    new Setting(containerEl)
      .setName("Step 6: complete OAuth")
      .setDesc("Enter client ID & secret, click 'get new access token', login to LinkedIn, authorize. Then click 'use token' and copy the access token value.");

    new Setting(containerEl)
      .setName("Step 7: get person ID (different from client ID!)")
      .setDesc("New → HTTP GET request. In 'auth' tab: type 'bearer token', paste your access token. Send request, copy the 'sub' value (not client ID).")
      .addText((text) => {
        text.setValue("https://api.linkedin.com/v2/userinfo");
        text.inputEl.readOnly = true;
        text.inputEl.addClass("substack-input-full-width");
      });

    if (this.plugin.settings.linkedinEnabled) {
      // Access token field
      const tokenDesc = createFragment();
      tokenDesc.appendText("Your OAuth2 access token (starts with 'AQ...')");
      new Setting(containerEl)
        .setName("Access token")
        .setDesc(tokenDesc)
        .addText((text) => {
          text
            .setPlaceholder("Aqv...")
            .setValue(this.plugin.settings.linkedinAccessToken)
            .onChange(async (value) => {
              this.plugin.settings.linkedinAccessToken = value;
              await this.plugin.saveSettings();
            });
          text.inputEl.type = "password";
          text.inputEl.addClass("substack-input-full-width");
        });

      // Person ID field
      const personIdDesc = createFragment();
      personIdDesc.appendText("Your LinkedIn member ID (from /v2/userinfo 'sub' field, e.g., 'abc123XYZ')");
      new Setting(containerEl)
        .setName("Person ID")
        .setDesc(personIdDesc)
        .addText((text) => {
          text
            .setPlaceholder("Abc123xyz")
            .setValue(this.plugin.settings.linkedinPersonId)
            .onChange(async (value) => {
              this.plugin.settings.linkedinPersonId = value;
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName("Default visibility")
        .setDesc("Default visibility for LinkedIn posts")
        .addDropdown((dropdown) => {
          dropdown
            .addOption("PUBLIC", "Public")
            .addOption("CONNECTIONS", "Connections only")
            .setValue(this.plugin.settings.linkedinDefaultVisibility)
            .onChange(async (value) => {
              this.plugin.settings.linkedinDefaultVisibility = value as LinkedInVisibility;
              await this.plugin.saveSettings();
            });
        });

      // Test connection button
      new Setting(containerEl)
        .setName("Test connection")
        .setDesc("Test your LinkedIn API connection")
        .addButton((button) => {
          button.setButtonText("Test").onClick(async () => {
            if (!this.plugin.settings.linkedinAccessToken || !this.plugin.settings.linkedinPersonId) {
              new Notice("Please enter access token and person ID first.");
              return;
            }
            button.setButtonText("...");
            button.setDisabled(true);
            try {
              const api = new LinkedInAPI(
                this.plugin.settings.linkedinAccessToken,
                this.plugin.settings.linkedinPersonId
              );
              const result = await api.testConnection();
              if (result.success && result.data) {
                // Check if Person ID matches the returned sub
                if (result.data.id !== this.plugin.settings.linkedinPersonId) {
                  new Notice(`Warning: Person ID mismatch! Expected: ${result.data.id}`, 10000);
                } else {
                  new Notice(`Connected as: ${result.data.localizedFirstName} ${result.data.localizedLastName}`);
                }
              } else {
                new Notice(`Connection failed: ${result.error}`);
              }
            } catch (error) {
              const msg = error instanceof Error ? error.message : "Unknown error";
              new Notice(`Error: ${msg}`);
            } finally {
              button.setButtonText("Test");
              button.setDisabled(false);
            }
          });
        });
    }

    renderStaticSiteSettings(
      containerEl,
      this.plugin.settings.staticSite,
      () => this.plugin.saveSettings(),
      () => this.display()
    );

    new Setting(containerEl).setName("Advanced").setHeading();

    new Setting(containerEl)
      .setName("Dev mode")
      .setDesc(
        "Enable detailed logging for debugging. Only enable when troubleshooting issues."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.devMode)
          .onChange(async (value) => {
            this.plugin.settings.devMode = value;
            await this.plugin.saveSettings();

            const status = value ? "enabled" : "disabled";
            const message =
              status === "enabled" ? "Check console for detailed logs." : "";
            new Notice(`dev mode ${status}. ${message}`);

            this.display();
          })
      );

    if (this.plugin.settings.devMode) {
      new Setting(containerEl)
        .setName("Log level")
        .setDesc("Set the minimum log level to display")
        .addDropdown((dropdown) =>
          dropdown
            .addOption(LogLevel.DEBUG.toString(), "Debug")
            .addOption(LogLevel.INFO.toString(), "Info")
            .addOption(LogLevel.WARN.toString(), "Warning")
            .addOption(LogLevel.ERROR.toString(), "Error")
            .setValue(this.plugin.settings.logLevel.toString())
            .onChange(async (value) => {
              this.plugin.settings.logLevel = parseInt(value) as LogLevel;
              await this.plugin.saveSettings();

              if (this.plugin.logger && "setLogLevel" in this.plugin.logger) {
                this.plugin.logger.setLogLevel(this.plugin.settings.logLevel);
              }
            })
        );
    }

    // Version info
    const versionSection = containerEl.createDiv();
    versionSection.addClass("substack-version-wrapper");

    const versionContent = versionSection.createEl("div", {
      attr: { class: "substack-version-content" }
    });

    versionContent.createEl("p", {
      text: "Content publisher",
      attr: { class: "substack-version-name" }
    });

    versionContent.createEl("a", {
      text: "Roomi-fields",
      href: "https://github.com/roomi-fields",
      attr: { class: "substack-version-author" }
    });

    versionContent.createEl("span", {
      text: `v${this.plugin.manifest.version}`,
      attr: { class: "substack-version-number" }
    });
  }

  private showServerEditModal(server: WordPressServer): void {
    const modal = new WordPressServerEditModal(
      this.app,
      server,
      async (updatedServer) => {
        // Update the server in the list
        const index = this.plugin.settings.wordpressServers.findIndex(
          (s) => s.id === updatedServer.id
        );
        if (index !== -1) {
          this.plugin.settings.wordpressServers[index] = updatedServer;
          await this.plugin.saveSettings();
          this.display();
        }
      }
    );
    modal.open();
  }
}

/**
 * Confirmation modal for batch publishing a folder
 */
class BatchPublishConfirmModal extends Modal {
  private folderName: string;
  private fileCount: number;
  private resolve: (confirmed: boolean) => void;

  constructor(
    app: App,
    folderName: string,
    fileCount: number,
    resolve: (confirmed: boolean) => void
  ) {
    super(app);
    this.folderName = folderName;
    this.fileCount = fileCount;
    this.resolve = resolve;
  }

  override onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h3", { text: "Publish folder to WordPress" });

    contentEl.createEl("p", {
      text: `You are about to publish ${this.fileCount} file(s) from folder "${this.folderName}" to WordPress.`
    });

    contentEl.createEl("p", {
      text: "Already published articles will be updated, new ones will be created.",
      cls: "batch-publish-info"
    });

    contentEl.createEl("p", {
      text: "Backlink updates are disabled during batch to avoid duplicates.",
      cls: "batch-publish-warning"
    });

    const buttonsDiv = contentEl.createDiv({ cls: "batch-publish-buttons" });

    const cancelBtn = buttonsDiv.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.resolve(false);
      this.close();
    });

    const confirmBtn = buttonsDiv.createEl("button", {
      text: `Publish ${this.fileCount} files`,
      cls: "mod-cta"
    });
    confirmBtn.addEventListener("click", () => {
      this.resolve(true);
      this.close();
    });
  }

  override onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class WordPressServerEditModal extends Modal {
  private server: WordPressServer;
  private onSave: (server: WordPressServer) => Promise<void>;
  private editedServer: WordPressServer;
  private defaultCategoryInput: HTMLInputElement | null = null;

  constructor(
    app: App,
    server: WordPressServer,
    onSave: (server: WordPressServer) => Promise<void>
  ) {
    super(app);
    this.server = server;
    this.onSave = onSave;
    // Deep copy to avoid modifying the original server before save
    this.editedServer = JSON.parse(JSON.stringify(server));
  }

  override onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h2", { text: "Edit WordPress server" });

    new Setting(contentEl)
      .setName("Server name")
      .setDesc("A friendly name for this server")
      .addText((text) => {
        text
          .setPlaceholder("My WordPress")
          .setValue(this.editedServer.name)
          .onChange((value) => {
            this.editedServer.name = value;
          });
      });

    new Setting(contentEl)
      .setName("Base URL")
      .setDesc("WordPress site URL (e.g., https://example.com)")
      .addText((text) => {
        text
          .setPlaceholder("https://example.com")
          .setValue(this.editedServer.baseUrl)
          .onChange((value) => {
            this.editedServer.baseUrl = value;
          });
        text.inputEl.addClass("substack-input-full-width");
      });

    new Setting(contentEl)
      .setName("Username")
      .setDesc("WordPress username")
      .addText((text) => {
        text
          .setPlaceholder("Username")
          .setValue(this.editedServer.username)
          .onChange((value) => {
            this.editedServer.username = value;
          });
      });

    new Setting(contentEl)
      .setName("Application password")
      .setDesc("WordPress application password (not your login password)")
      .addText((text) => {
        text
          .setPlaceholder("Xxxx xxxx xxxx xxxx")
          .setValue(this.editedServer.password)
          .onChange((value) => {
            this.editedServer.password = value;
          });
        text.inputEl.type = "password";
      });

    new Setting(contentEl)
      .setName("Default category")
      .setDesc("Category used by default when publishing")
      .addText((text) => {
        text
          .setPlaceholder("Category-name")
          .setValue(this.editedServer.defaultCategory)
          .onChange((value) => {
            this.editedServer.defaultCategory = value;
          });
        this.defaultCategoryInput = text.inputEl;
      });

    // Category IDs with fetch button
    const categoryContainer = contentEl.createDiv();

    const categorySetting = new Setting(categoryContainer)
      .setName("Category IDs")
      .setDesc("JSON mapping of category names to WordPress category IDs");

    const categoryTextArea = categoryContainer.createEl("textarea", {
      cls: "wordpress-category-textarea",
      attr: { rows: "4", cols: "40", placeholder: '{"category": 123}' }
    });
    categoryTextArea.value = JSON.stringify(this.editedServer.categoryPageIds, null, 2);
    categoryTextArea.addEventListener("change", () => {
      try {
        this.editedServer.categoryPageIds = JSON.parse(categoryTextArea.value);
      } catch {
        // Invalid JSON, ignore
      }
    });

    categorySetting.addButton((button) => {
      button.setButtonText("Fetch from WP").onClick(async () => {
        if (!this.editedServer.baseUrl || !this.editedServer.username || !this.editedServer.password) {
          new Notice("Please fill in URL, username, and password first.");
          return;
        }
        button.setButtonText("...");
        button.setDisabled(true);
        try {
          const api = new WordPressAPI(
            this.editedServer.baseUrl,
            this.editedServer.username,
            this.editedServer.password
          );
          const categories = await api.getCategories();
          if (categories.success && categories.data) {
            const catData = categories.data;
            const mapping: WordPressCategoryMapping = {};
            for (const cat of catData) {
              // Use slug as key, id as value
              mapping[cat.slug] = cat.id;
            }
            this.editedServer.categoryPageIds = mapping;
            categoryTextArea.value = JSON.stringify(mapping, null, 2);
            // Set default category to first one if empty
            const firstCat = catData[0];
            if (!this.editedServer.defaultCategory && firstCat) {
              this.editedServer.defaultCategory = firstCat.slug;
              if (this.defaultCategoryInput) {
                this.defaultCategoryInput.value = firstCat.slug;
              }
            }
            new Notice(`Fetched ${catData.length} categories`);
          } else {
            new Notice(`Failed to fetch categories: ${categories.error}`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          new Notice(`Error: ${msg}`);
        } finally {
          button.setButtonText("Fetch from WP");
          button.setDisabled(false);
        }
      });
    });

    // Polylang multilingual support section
    contentEl.createEl("h3", { text: "Polylang (multilingual)" });

    // Initialize polylang config if not present
    if (!this.editedServer.polylang) {
      this.editedServer.polylang = {
        enabled: false,
        categoryMapping: {}
      };
    }

    new Setting(contentEl)
      .setName("Enable Polylang")
      .setDesc("Enable bilingual publishing (FR/EN) with Polylang plugin")
      .addToggle((toggle) => {
        toggle
          .setValue(this.editedServer.polylang?.enabled ?? false)
          .onChange((value) => {
            if (!this.editedServer.polylang) {
              this.editedServer.polylang = { enabled: false, categoryMapping: {} };
            }
            this.editedServer.polylang.enabled = value;
          });
      });

    // Polylang category mapping
    const polylangContainer = contentEl.createDiv();

    new Setting(polylangContainer)
      .setName("Category mapping (FR/EN)")
      .setDesc("JSON mapping of category to FR and EN IDs. Example: {\"news\": {\"fr\": 2, \"en\": 17}}");

    const polylangTextArea = polylangContainer.createEl("textarea", {
      cls: "wordpress-category-textarea",
      attr: { rows: "4", cols: "40", placeholder: '{"news": {"fr": 2, "en": 17}}' }
    });
    polylangTextArea.value = JSON.stringify(
      this.editedServer.polylang?.categoryMapping ?? {},
      null,
      2
    );
    polylangTextArea.addEventListener("change", () => {
      try {
        if (!this.editedServer.polylang) {
          this.editedServer.polylang = { enabled: false, categoryMapping: {} };
        }
        this.editedServer.polylang.categoryMapping = JSON.parse(polylangTextArea.value);
      } catch {
        // Invalid JSON, ignore
      }
    });

    const buttonContainer = contentEl.createDiv({ cls: "wordpress-modal-buttons" });

    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = buttonContainer.createEl("button", { text: "Save", cls: "mod-cta" });
    saveBtn.addEventListener("click", () => {
      void this.onSave(this.editedServer).then(() => this.close());
    });
  }

  override onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
