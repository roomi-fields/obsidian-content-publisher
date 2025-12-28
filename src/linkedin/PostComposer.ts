/* global HTMLTextAreaElement */
import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { LinkedInAPI } from "./api";
import { LinkedInMarkdownConverter } from "./converter";
import { LinkedInImageHandler } from "./imageHandler";
import { ILogger } from "../utils/logger";
import { LinkedInFrontmatter, LinkedInLifecycleState, LinkedInVisibility } from "./types";
import {
  isBilingualContent,
  parseBilingualContent,
  getLanguageContent
} from "../wordpress/bilingualParser";
import { BilingualContent, PolylangLanguage } from "../wordpress/types";

export interface LinkedInPostComposerOptions {
  defaultVisibility: LinkedInVisibility;
}

export class LinkedInPostComposer extends Modal {
  private api: LinkedInAPI;
  private logger: ILogger;
  private converter: LinkedInMarkdownConverter;
  private imageHandler: LinkedInImageHandler;
  private options: LinkedInPostComposerOptions;

  // Form state
  private title: string = "";
  private content: string = "";
  private visibility: LinkedInVisibility = "PUBLIC";
  private tags: string[] = [];
  private articleUrl: string = "";
  private postType: "text" | "article" | "image" = "text";
  private saveAsDraft: boolean = false;
  private existingDraftId: string | null = null;

  // UI elements
  private publishButton: HTMLButtonElement | null = null;
  private previewEl: HTMLTextAreaElement | null = null;

  // File state
  private activeFile: TFile | null = null;
  private frontmatter: LinkedInFrontmatter = {};
  private rawContent: string = "";

  // Bilingual support
  private bilingualContent: BilingualContent | null = null;
  private isBilingual: boolean = false;
  private selectedLanguage: PolylangLanguage = "en";

  constructor(
    app: App,
    api: LinkedInAPI,
    logger: ILogger,
    options?: Partial<LinkedInPostComposerOptions>
  ) {
    super(app);
    this.api = api;
    this.logger = logger;
    this.converter = new LinkedInMarkdownConverter();
    this.imageHandler = new LinkedInImageHandler(api, app.vault, logger);
    this.options = {
      defaultVisibility: options?.defaultVisibility || "PUBLIC"
    };
    this.visibility = this.options.defaultVisibility;
  }

  override async onOpen() {
    const { contentEl } = this;

    // Get active file and read frontmatter
    this.activeFile = this.app.workspace.getActiveFile();
    await this.loadContent();
    this.loadFrontmatter();

    // Detect bilingual content
    await this.detectBilingualContent();

    // Title
    const titleText = this.isBilingual
      ? "Publish to LinkedIn (Bilingual 🇫🇷/🇬🇧)"
      : "Publish to LinkedIn";
    new Setting(contentEl).setName(titleText).setHeading();

    // Language selector (only for bilingual content)
    if (this.isBilingual) {
      const langContainer = contentEl.createDiv({
        cls: "linkedin-field-container"
      });
      langContainer.createEl("label", { text: "Language to publish" });
      const langSelect = langContainer.createEl("select", {
        cls: "linkedin-select"
      });

      const langOptions: { value: PolylangLanguage; label: string }[] = [
        { value: "en", label: "🇬🇧 English" },
        { value: "fr", label: "🇫🇷 Français" }
      ];

      for (const opt of langOptions) {
        const option = langSelect.createEl("option", {
          text: opt.label,
          value: opt.value
        });
        if (opt.value === this.selectedLanguage) {
          option.selected = true;
        }
      }

      langSelect.addEventListener("change", () => {
        this.selectedLanguage = langSelect.value as PolylangLanguage;
        this.updateFieldsForLanguage();
        this.updatePreview();
      });
    }

    // Post type selector
    const typeContainer = contentEl.createDiv({
      cls: "linkedin-field-container"
    });
    typeContainer.createEl("label", { text: "Post type" });
    const typeSelect = typeContainer.createEl("select", {
      cls: "linkedin-select"
    });

    type PostType = "text" | "article" | "image";
    const typeOptions: { value: PostType; label: string }[] = [
      { value: "text", label: "📝 Text post" },
      { value: "article", label: "🔗 Share article link" },
      { value: "image", label: "🖼️ Image post" }
    ];

    for (const opt of typeOptions) {
      const option = typeSelect.createEl("option", {
        text: opt.label,
        value: opt.value
      });
      if (opt.value === this.postType) {
        option.selected = true;
      }
    }

    typeSelect.addEventListener("change", () => {
      this.postType = typeSelect.value as typeof this.postType;
      this.updateArticleUrlVisibility();
      this.updatePreview();
    });

    // Article URL input (only shown for article type)
    const articleUrlContainer = contentEl.createDiv({
      cls: "linkedin-field-container linkedin-article-url"
    });
    articleUrlContainer.createEl("label", { text: "Article URL" });
    const articleUrlInput = articleUrlContainer.createEl("input", {
      type: "url",
      placeholder: "https://...",
      cls: "linkedin-input"
    });

    // Pre-fill with frontmatter URL or WordPress URL
    if (this.isBilingual) {
      const langKey =
        this.selectedLanguage === "fr" ? "wordpress_url_fr" : "wordpress_url_en";
      const cache = this.app.metadataCache.getFileCache(this.activeFile!);
      this.articleUrl = (cache?.frontmatter?.[langKey] as string) || "";
    } else {
      const cache = this.app.metadataCache.getFileCache(this.activeFile!);
      this.articleUrl =
        (cache?.frontmatter?.wordpress_url as string) ||
        (cache?.frontmatter?.substack_url as string) ||
        "";
    }
    articleUrlInput.value = this.articleUrl;

    articleUrlInput.addEventListener("input", () => {
      this.articleUrl = articleUrlInput.value;
      this.updatePreview();
    });

    // Auto-select "Shared Article" if we have an article URL
    if (this.articleUrl) {
      this.postType = "article";
      typeSelect.value = "article";
    }

    // Show/hide article URL field based on post type
    this.updateArticleUrlVisibility();

    // Visibility selector
    const visibilityContainer = contentEl.createDiv({
      cls: "linkedin-field-container"
    });
    visibilityContainer.createEl("label", { text: "Visibility" });
    const visibilitySelect = visibilityContainer.createEl("select", {
      cls: "linkedin-select"
    });

    const visibilityOptions: { value: LinkedInVisibility; label: string }[] = [
      { value: "PUBLIC", label: "🌍 Public" },
      { value: "CONNECTIONS", label: "👥 Connections only" }
    ];

    for (const opt of visibilityOptions) {
      const option = visibilitySelect.createEl("option", {
        text: opt.label,
        value: opt.value
      });
      if (opt.value === this.visibility) {
        option.selected = true;
      }
    }

    visibilitySelect.addEventListener("change", () => {
      this.visibility = visibilitySelect.value as LinkedInVisibility;
    });

    // Check for existing draft
    this.initializeExistingDraft();

    // Draft mode section
    const draftContainer = contentEl.createDiv({
      cls: "linkedin-field-container linkedin-draft-section"
    });

    // Show existing draft notice if applicable
    if (this.existingDraftId) {
      const draftNotice = draftContainer.createDiv({
        cls: "linkedin-draft-notice"
      });
      draftNotice.createEl("span", {
        text: "A draft already exists — ",
        cls: "linkedin-draft-notice-text"
      });
      const publishDraftBtn = draftNotice.createEl("button", {
        text: "Publish it",
        cls: "linkedin-publish-draft-button"
      });
      publishDraftBtn.addEventListener("click", () => {
        void this.publishExistingDraft();
      });
      draftNotice.createEl("span", {
        text: " — or create new below",
        cls: "linkedin-draft-notice-text"
      });
    }

    // Save as draft checkbox
    const draftCheckboxContainer = draftContainer.createDiv({
      cls: "linkedin-checkbox-container"
    });
    const draftCheckbox = draftCheckboxContainer.createEl("input", {
      type: "checkbox",
      cls: "linkedin-checkbox"
    });
    draftCheckbox.id = "linkedin-save-as-draft";
    draftCheckbox.checked = this.saveAsDraft;
    const draftLabel = draftCheckboxContainer.createEl("label", {
      text: "Save as draft (don't publish yet)",
      cls: "linkedin-checkbox-label"
    });
    draftLabel.setAttribute("for", "linkedin-save-as-draft");

    draftCheckbox.addEventListener("change", () => {
      this.saveAsDraft = draftCheckbox.checked;
      this.updatePublishButtonText();
    });

    // Tags input
    const tagsContainer = contentEl.createDiv({
      cls: "linkedin-field-container"
    });
    tagsContainer.createEl("label", { text: "Hashtags" });
    const tagsInput = tagsContainer.createEl("input", {
      type: "text",
      placeholder: "#tag1, #tag2, #tag3",
      cls: "linkedin-input"
    });

    // Pre-fill with frontmatter tags
    this.initializeTags();
    if (this.tags.length > 0) {
      tagsInput.value = this.tags.join(", ");
    }

    tagsInput.addEventListener("input", () => {
      this.tags = tagsInput.value
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .map((t) => (t.startsWith("#") ? t : `#${t}`));
      this.updatePreview();
    });

    // Content preview
    const previewContainer = contentEl.createDiv({
      cls: "linkedin-field-container"
    });
    previewContainer.createEl("label", { text: "Post content (editable)" });
    this.previewEl = previewContainer.createEl("textarea", {
      cls: "linkedin-preview",
      attr: { rows: "10" }
    });

    // Update content when user edits preview
    this.previewEl.addEventListener("input", () => {
      if (this.previewEl) {
        this.content = this.previewEl.value;
        this.updateCharacterCounter();
      }
    });

    // Character counter
    previewContainer.createEl("div", {
      cls: "linkedin-counter",
      text: "0 / 3000 characters"
    });

    // Initialize preview
    this.updatePreview();

    // Buttons
    const buttonContainer = contentEl.createDiv({
      cls: "linkedin-button-container"
    });

    buttonContainer
      .createEl("button", {
        text: "Cancel",
        cls: "linkedin-cancel-button"
      })
      .addEventListener("click", () => {
        this.close();
      });

    this.publishButton = buttonContainer.createEl("button", {
      text: "Publish",
      cls: "linkedin-publish-button"
    });
    this.publishButton.addEventListener("click", () => {
      void this.publish();
    });

    // Note
    contentEl.createEl("div", {
      text: "The active note will be converted and published to LinkedIn.",
      cls: "linkedin-note-text"
    });
  }

  /**
   * Load content from active file
   */
  private async loadContent(): Promise<void> {
    if (!this.activeFile) return;
    this.rawContent = await this.app.vault.cachedRead(this.activeFile);
  }

  /**
   * Load frontmatter from active file
   */
  private loadFrontmatter(): void {
    if (!this.activeFile) return;

    const cache = this.app.metadataCache.getFileCache(this.activeFile);
    if (cache?.frontmatter) {
      const fm = cache.frontmatter;
      const parsed: LinkedInFrontmatter = {};

      if (typeof fm.title === "string") {
        parsed.title = fm.title;
      }
      if (typeof fm.subtitle === "string") {
        parsed.subtitle = fm.subtitle;
      }
      if (typeof fm.excerpt === "string") {
        parsed.excerpt = fm.excerpt;
      }
      if (
        fm.visibility === "PUBLIC" ||
        fm.visibility === "CONNECTIONS" ||
        fm.visibility === "LOGGED_IN"
      ) {
        parsed.visibility = fm.visibility;
        this.visibility = fm.visibility;
      }
      if (Array.isArray(fm.tags)) {
        parsed.tags = fm.tags.filter((t): t is string => typeof t === "string");
      }
      if (typeof fm.linkedin_url === "string") {
        parsed.linkedin_url = fm.linkedin_url;
      }
      if (typeof fm.linkedin_post_id === "string") {
        parsed.linkedin_post_id = fm.linkedin_post_id;
      }

      // Bilingual fields
      if (typeof fm.linkedin_url_fr === "string") {
        parsed.linkedin_url_fr = fm.linkedin_url_fr;
      }
      if (typeof fm.linkedin_url_en === "string") {
        parsed.linkedin_url_en = fm.linkedin_url_en;
      }
      if (typeof fm.linkedin_draft_id === "string") {
        parsed.linkedin_draft_id = fm.linkedin_draft_id;
      }
      if (typeof fm.linkedin_draft_id_fr === "string") {
        parsed.linkedin_draft_id_fr = fm.linkedin_draft_id_fr;
      }
      if (typeof fm.linkedin_draft_id_en === "string") {
        parsed.linkedin_draft_id_en = fm.linkedin_draft_id_en;
      }

      this.frontmatter = parsed;
    }

    // Set title from frontmatter or file name
    this.title = this.frontmatter.title || this.activeFile?.basename || "";
  }

  /**
   * Initialize tags from frontmatter
   */
  private initializeTags(): void {
    if (this.isBilingual && this.bilingualContent) {
      const langContent = getLanguageContent(
        this.bilingualContent,
        this.selectedLanguage
      );
      if (langContent.tags && langContent.tags.length > 0) {
        this.tags = langContent.tags.map((t) =>
          t.startsWith("#") ? t : `#${t}`
        );
      }
    } else if (this.frontmatter.tags && this.frontmatter.tags.length > 0) {
      this.tags = this.frontmatter.tags.map((t) =>
        t.startsWith("#") ? t : `#${t}`
      );
    }
  }

  /**
   * Initialize existing draft ID from frontmatter
   */
  private initializeExistingDraft(): void {
    if (this.isBilingual) {
      const draftKey =
        this.selectedLanguage === "fr"
          ? "linkedin_draft_id_fr"
          : "linkedin_draft_id_en";
      this.existingDraftId = this.frontmatter[draftKey] || null;
    } else {
      this.existingDraftId = this.frontmatter.linkedin_draft_id || null;
    }

    if (this.existingDraftId) {
      this.logger.debug("Found existing LinkedIn draft", {
        draftId: this.existingDraftId,
        language: this.isBilingual ? this.selectedLanguage : "n/a"
      });
    }
  }

  /**
   * Update the publish button text based on saveAsDraft state
   */
  private updatePublishButtonText(): void {
    if (this.publishButton) {
      this.publishButton.textContent = this.saveAsDraft
        ? "Save as Draft"
        : "Publish";
    }
  }

  /**
   * Publish an existing draft
   */
  private async publishExistingDraft(): Promise<void> {
    if (!this.existingDraftId) {
      new Notice("No existing draft found");
      return;
    }

    this.setButtonDisabled(true, "Publishing draft...");

    try {
      const result = await this.api.publishDraft(this.existingDraftId);

      if (result.success && result.data) {
        const postId = result.data.id;
        const postUrl = this.api.getPostUrl(postId);

        // Update frontmatter: move from draft to published
        await this.updateFrontmatterAfterDraftPublish(postId, postUrl);

        this.logger.info("Published draft to LinkedIn successfully", {
          postId,
          postUrl
        });

        new Notice("Draft published to LinkedIn successfully!");
        this.close();
      } else {
        throw new Error(result.error || "Failed to publish draft");
      }
    } catch (error) {
      this.logger.error("Failed to publish draft to LinkedIn", error);
      const msg = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to publish draft: ${msg}`);
      this.setButtonDisabled(false);
    }
  }

  /**
   * Update frontmatter after publishing a draft
   */
  private async updateFrontmatterAfterDraftPublish(
    postId: string,
    postUrl: string
  ): Promise<void> {
    if (!this.activeFile) return;

    try {
      await this.app.fileManager.processFrontMatter(
        this.activeFile,
        (frontmatter) => {
          if (this.isBilingual) {
            const urlKey =
              this.selectedLanguage === "fr"
                ? "linkedin_url_fr"
                : "linkedin_url_en";
            const idKey =
              this.selectedLanguage === "fr"
                ? "linkedin_post_id_fr"
                : "linkedin_post_id_en";
            const draftKey =
              this.selectedLanguage === "fr"
                ? "linkedin_draft_id_fr"
                : "linkedin_draft_id_en";

            frontmatter[urlKey] = postUrl;
            frontmatter[idKey] = postId;
            delete frontmatter[draftKey];
          } else {
            frontmatter.linkedin_url = postUrl;
            frontmatter.linkedin_post_id = postId;
            delete frontmatter.linkedin_draft_id;
          }
        }
      );
      this.logger.info("Updated frontmatter after draft publish", {
        postUrl,
        language: this.isBilingual ? this.selectedLanguage : "n/a"
      });
    } catch (error) {
      this.logger.error("Failed to update frontmatter after draft publish", error);
    }
  }

  /**
   * Detect bilingual content in the active file
   */
  private async detectBilingualContent(): Promise<void> {
    if (!this.activeFile || !this.rawContent) return;

    if (isBilingualContent(this.rawContent)) {
      this.bilingualContent = parseBilingualContent(this.rawContent);
      this.isBilingual = this.bilingualContent !== null;

      if (this.isBilingual && this.bilingualContent) {
        this.logger.info("Detected bilingual content for LinkedIn", {
          frTitle: this.bilingualContent.fr.title,
          enTitle: this.bilingualContent.en.title
        });
      }
    }
  }

  /**
   * Update fields when language selection changes
   */
  private updateFieldsForLanguage(): void {
    if (!this.bilingualContent) return;

    const langContent = getLanguageContent(
      this.bilingualContent,
      this.selectedLanguage
    );

    // Update title
    this.title = langContent.title;

    // Update tags
    if (langContent.tags && langContent.tags.length > 0) {
      this.tags = langContent.tags.map((t) =>
        t.startsWith("#") ? t : `#${t}`
      );
    }

    // Update article URL for bilingual
    if (this.activeFile) {
      const cache = this.app.metadataCache.getFileCache(this.activeFile);
      const langKey =
        this.selectedLanguage === "fr" ? "wordpress_url_fr" : "wordpress_url_en";
      this.articleUrl = (cache?.frontmatter?.[langKey] as string) || "";

      // Update input field
      const urlInput = this.contentEl.querySelector(
        ".linkedin-article-url input"
      ) as HTMLInputElement;
      if (urlInput) {
        urlInput.value = this.articleUrl;
      }
    }

    // Update tags input
    const tagsInput = this.contentEl.querySelector(
      ".linkedin-field-container input[placeholder*='tag']"
    ) as HTMLInputElement;
    if (tagsInput) {
      tagsInput.value = this.tags.join(", ");
    }

    this.logger.debug("Updated fields for language", {
      language: this.selectedLanguage,
      title: this.title,
      tags: this.tags
    });
  }

  /**
   * Show/hide article URL field based on post type
   */
  private updateArticleUrlVisibility(): void {
    const articleUrlContainer = this.contentEl.querySelector(
      ".linkedin-article-url"
    ) as HTMLElement;
    if (articleUrlContainer) {
      articleUrlContainer.style.display =
        this.postType === "article" ? "block" : "none";
    }
  }

  /**
   * Update the character counter display
   */
  private updateCharacterCounter(): void {
    const counterEl = this.contentEl.querySelector(
      ".linkedin-counter"
    ) as HTMLElement;
    if (counterEl && this.previewEl) {
      const length = this.previewEl.value.length;
      const color = length > 3000 ? "red" : length > 2700 ? "orange" : "";
      counterEl.textContent = `${length} / 3000 characters`;
      counterEl.style.color = color;
    }
  }

  /**
   * Update the preview textarea with formatted content
   */
  private async updatePreview(): Promise<void> {
    if (!this.previewEl) return;

    try {
      const content = await this.getFormattedContent();
      this.previewEl.value = content;
      this.content = content;
      this.updateCharacterCounter();
    } catch (error) {
      this.logger.error("Failed to update preview", error);
    }
  }

  /**
   * Get formatted content for LinkedIn
   */
  private async getFormattedContent(): Promise<string> {
    if (!this.activeFile) return "";

    let contentToProcess: string;

    // For bilingual content, extract the selected language's content
    if (this.isBilingual && this.bilingualContent) {
      const langContent = getLanguageContent(
        this.bilingualContent,
        this.selectedLanguage
      );
      contentToProcess = langContent.content;
    } else {
      // Non-bilingual: use full content minus frontmatter
      contentToProcess = this.rawContent.replace(/^---[\s\S]*?---\n?/, "");
    }

    // Convert markdown to LinkedIn format
    let formattedContent = this.converter.convert(contentToProcess);

    // Add article link if sharing an article
    if (this.postType === "article" && this.articleUrl) {
      formattedContent = this.converter.formatWithArticleLink(
        formattedContent,
        this.articleUrl,
        this.title
      );
    }

    // Append hashtags
    formattedContent = this.converter.appendHashtags(formattedContent, this.tags);

    // Truncate if needed
    formattedContent = this.converter.truncateToLimit(formattedContent);

    return formattedContent;
  }

  /**
   * Publish to LinkedIn
   */
  private async publish(): Promise<void> {
    // Use the edited preview content (this.content is updated by input listener)
    const content = this.previewEl?.value || this.content;

    if (!content.trim()) {
      new Notice("Post content is empty");
      return;
    }

    if (content.length > 3000) {
      new Notice("Post exceeds 3000 character limit");
      return;
    }

    const lifecycleState: LinkedInLifecycleState = this.saveAsDraft
      ? "DRAFT"
      : "PUBLISHED";
    const actionText = this.saveAsDraft ? "Saving draft..." : "Publishing...";

    this.setButtonDisabled(true, actionText);

    try {
      let result;

      if (this.postType === "article" && this.articleUrl) {
        // Share article with link
        this.logger.debug("Creating article post on LinkedIn", {
          title: this.title,
          articleUrl: this.articleUrl,
          visibility: this.visibility,
          lifecycleState
        });

        result = await this.api.createArticlePost(
          content,
          this.articleUrl,
          this.title,
          this.frontmatter.excerpt,
          this.visibility,
          lifecycleState
        );
      } else if (this.postType === "image") {
        // Image post - upload first image
        const basePath = this.activeFile?.parent?.path || "";
        const imageResult = await this.imageHandler.processFeaturedImage(
          this.rawContent,
          basePath
        );

        if (imageResult.featuredImage) {
          this.logger.debug("Creating image post on LinkedIn", {
            title: this.title,
            imageAsset: imageResult.featuredImage.asset,
            visibility: this.visibility,
            lifecycleState
          });

          result = await this.api.createImagePost(
            content,
            imageResult.featuredImage.asset,
            this.title,
            this.visibility,
            lifecycleState
          );
        } else {
          // Fallback to text post if no image found
          this.logger.warn("No image found, falling back to text post");
          result = await this.api.createTextPost(
            content,
            this.visibility,
            lifecycleState
          );
        }
      } else {
        // Text post
        this.logger.debug("Creating text post on LinkedIn", {
          visibility: this.visibility,
          contentLength: content.length,
          lifecycleState
        });

        result = await this.api.createTextPost(
          content,
          this.visibility,
          lifecycleState
        );
      }

      if (result.success && result.data) {
        const postId = result.data.id;

        if (this.saveAsDraft) {
          // Save as draft - store draft ID in frontmatter
          await this.updateFrontmatterWithDraftId(postId);

          this.logger.info("Saved draft to LinkedIn successfully", { postId });

          const draftUrl = this.api.getDraftUrl();
          new Notice(
            `Draft saved to LinkedIn! View drafts at: ${draftUrl}`,
            8000
          );
        } else {
          // Published - store URL in frontmatter
          const postUrl = this.api.getPostUrl(postId);
          await this.updateFrontmatterWithUrl(postId, postUrl);

          this.logger.info("Published to LinkedIn successfully", {
            postId,
            postUrl
          });

          new Notice("Published to LinkedIn successfully!");
        }

        this.close();
      } else {
        throw new Error(result.error || "Failed to create post");
      }
    } catch (error) {
      this.logger.error("Failed to create LinkedIn post", error);
      const msg = error instanceof Error ? error.message : String(error);
      new Notice(`Failed: ${msg}`);
      this.setButtonDisabled(false);
    }
  }

  /**
   * Update frontmatter with draft ID
   */
  private async updateFrontmatterWithDraftId(draftId: string): Promise<void> {
    if (!this.activeFile) return;

    try {
      await this.app.fileManager.processFrontMatter(
        this.activeFile,
        (frontmatter) => {
          if (this.isBilingual) {
            const draftKey =
              this.selectedLanguage === "fr"
                ? "linkedin_draft_id_fr"
                : "linkedin_draft_id_en";
            frontmatter[draftKey] = draftId;
          } else {
            frontmatter.linkedin_draft_id = draftId;
          }
        }
      );
      this.logger.info("Updated frontmatter with LinkedIn draft ID", {
        draftId,
        language: this.isBilingual ? this.selectedLanguage : "n/a"
      });
    } catch (error) {
      this.logger.error("Failed to update frontmatter with draft ID", error);
    }
  }

  /**
   * Update frontmatter with LinkedIn post URL
   */
  private async updateFrontmatterWithUrl(
    postId: string,
    postUrl: string
  ): Promise<void> {
    if (!this.activeFile) return;

    try {
      await this.app.fileManager.processFrontMatter(
        this.activeFile,
        (frontmatter) => {
          if (this.isBilingual) {
            const urlKey =
              this.selectedLanguage === "fr"
                ? "linkedin_url_fr"
                : "linkedin_url_en";
            const idKey =
              this.selectedLanguage === "fr"
                ? "linkedin_post_id_fr"
                : "linkedin_post_id_en";
            frontmatter[urlKey] = postUrl;
            frontmatter[idKey] = postId;
          } else {
            frontmatter.linkedin_url = postUrl;
            frontmatter.linkedin_post_id = postId;
          }
        }
      );
      this.logger.info("Updated frontmatter with LinkedIn URL", {
        postUrl,
        language: this.isBilingual ? this.selectedLanguage : "n/a"
      });
    } catch (error) {
      this.logger.error("Failed to update frontmatter", error);
    }
  }

  /**
   * Set publish button disabled state
   */
  private setButtonDisabled(disabled: boolean, text?: string): void {
    if (this.publishButton) {
      this.publishButton.disabled = disabled;
      this.publishButton.textContent = text || "Publish";
    }
  }

  override onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
