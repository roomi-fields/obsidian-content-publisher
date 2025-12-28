import { App, Modal, Notice, RequestUrlResponse, Setting, TFile } from "obsidian";
import { SubstackAPI } from "./api";
import { MarkdownConverter } from "./converter";
import { ImageHandler } from "./imageHandler";
import { ILogger } from "../utils/logger";
import {
  SubstackAudience,
  SubstackSection,
  SubstackFrontmatter,
  SubstackDraftResponse,
  SubstackDraftPayload
} from "./types";
import {
  isBilingualContent,
  parseBilingualContent,
  getLanguageContent
} from "../wordpress/bilingualParser";
import { BilingualContent, PolylangLanguage } from "../wordpress/types";
import { WikiLinkConverter } from "../wordpress/wikiLinkConverter";

export interface PostComposerDefaults {
  defaultPublication: string;
  defaultSectionId: number | null;
  defaultAudience: SubstackAudience;
  defaultTags: string[];
  paidSubscribersEnabled: boolean;
  defaultAddWordPressLink: boolean;
  onWordPressLinkPreferenceChange?: (value: boolean) => void;
}

export class SubstackPostComposer extends Modal {
  private api: SubstackAPI;
  private publications: string[];
  private logger: ILogger;
  private converter: MarkdownConverter;
  private imageHandler: ImageHandler;
  private selectedPublication: string;
  private title: string = "";
  private subtitle: string = "";
  private audience: SubstackAudience = "everyone";
  private tags: string[] = [];
  private sections: SubstackSection[] = [];
  private selectedSectionId: number | null = null;
  private publishButton: HTMLButtonElement | null = null;
  private draftButton: HTMLButtonElement | null = null;
  private activeFile: TFile | null = null;
  private frontmatter: SubstackFrontmatter = {};
  private defaults: PostComposerDefaults;
  private addWordPressLink: boolean = false;

  // Bilingual support
  private bilingualContent: BilingualContent | null = null;
  private isBilingual: boolean = false;
  private selectedLanguage: PolylangLanguage = "en"; // Default to EN for Substack
  private rawContent: string = "";
  private addWordPressHeader: boolean = false;
  private wikiLinkConverter: WikiLinkConverter;

  constructor(
    app: App,
    api: SubstackAPI,
    publications: string[],
    logger: ILogger,
    defaults?: PostComposerDefaults
  ) {
    super(app);
    this.api = api;
    this.publications = publications;
    this.logger = logger;
    this.converter = new MarkdownConverter();
    this.imageHandler = new ImageHandler(api, app.vault, logger);
    this.wikiLinkConverter = new WikiLinkConverter(app, logger);
    this.defaults = defaults || {
      defaultPublication: publications[0] || "",
      defaultSectionId: null,
      defaultAudience: "everyone",
      defaultTags: [],
      paidSubscribersEnabled: false,
      defaultAddWordPressLink: false
    };

    // Apply defaults
    this.selectedPublication =
      this.defaults.defaultPublication || publications[0] || "";
    this.selectedSectionId = this.defaults.defaultSectionId;
    this.audience = this.defaults.defaultAudience || "everyone";
    this.tags = [...(this.defaults.defaultTags || [])];
    this.addWordPressLink = this.defaults.defaultAddWordPressLink;

    // Ensure we have at least one publication
    if (!this.selectedPublication) {
      throw new Error("At least one publication is required");
    }
  }

  override async onOpen() {
    const { contentEl } = this;

    // Get active file and read frontmatter
    this.activeFile = this.app.workspace.getActiveFile();
    this.loadFrontmatter();

    // Detect bilingual content
    await this.detectBilingualContent();

    // Title - indicate if bilingual
    const titleText = this.isBilingual
      ? "Publish to Substack (Bilingual 🇫🇷/🇬🇧)"
      : "Publish to Substack";
    new Setting(contentEl).setName(titleText).setHeading();

    // Publication selector (hidden if only one publication)
    if (this.publications.length > 1) {
      const pubContainer = contentEl.createDiv({
        cls: "substack-field-container"
      });

      pubContainer.createEl("label", { text: "Publication" });

      const pubSelect = pubContainer.createEl("select", {
        cls: "substack-select"
      });

      for (const pub of this.publications) {
        const option = pubSelect.createEl("option", { text: pub, value: pub });
        if (pub === this.selectedPublication) {
          option.selected = true;
        }
      }

      pubSelect.addEventListener("change", () => {
        this.selectedPublication = pubSelect.value;
        // Reload sections for new publication
        void this.loadSections(contentEl);
      });
    }

    // Section selector (right after publication, will be populated async)
    const sectionContainer = contentEl.createDiv({
      cls: "substack-field-container substack-section-container"
    });
    sectionContainer.style.display = "none"; // Hidden until sections loaded

    // Language selector (only for bilingual content)
    // eslint-disable-next-line prefer-const
    let titleInput: HTMLInputElement;
    // eslint-disable-next-line prefer-const
    let subtitleInput: HTMLInputElement;
    // eslint-disable-next-line prefer-const
    let tagsInput: HTMLInputElement;

    if (this.isBilingual) {
      const langContainer = contentEl.createDiv({
        cls: "substack-field-container"
      });
      langContainer.createEl("label", { text: "Language to publish" });
      const langSelect = langContainer.createEl("select", {
        cls: "substack-select"
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
        // Update fields with selected language content
        this.updateFieldsForLanguage(titleInput, subtitleInput, tagsInput);
      });
    }

    // WordPress header links option (when bilingual URLs exist)
    const hasWordPressUrls = this.frontmatter.wordpress_url_fr || this.frontmatter.wordpress_url_en;
    if (this.isBilingual && hasWordPressUrls) {
      new Setting(contentEl)
        .setName("Add WordPress links header")
        .setDesc("Include 🇫🇷/🇬🇧 links to WordPress versions at the top")
        .addToggle((toggle) => {
          toggle
            .setValue(this.addWordPressHeader)
            .onChange((value) => {
              this.addWordPressHeader = value;
            });
        });
    }

    // Title input
    const titleContainer = contentEl.createDiv({
      cls: "substack-field-container"
    });
    titleContainer.createEl("label", { text: "Title" });
    titleInput = titleContainer.createEl("input", {
      type: "text",
      placeholder: "Post title",
      cls: "substack-input"
    });

    // Pre-fill with bilingual content or frontmatter or file name
    if (this.isBilingual && this.bilingualContent) {
      const langContent = getLanguageContent(this.bilingualContent, this.selectedLanguage);
      this.title = langContent.title;
    } else if (this.frontmatter.title) {
      this.title = this.frontmatter.title;
    } else if (this.activeFile) {
      this.title = this.activeFile.basename;
    }
    titleInput.value = this.title;

    titleInput.addEventListener("input", () => {
      this.title = titleInput.value;
    });

    // Subtitle input
    const subtitleContainer = contentEl.createDiv({
      cls: "substack-field-container"
    });
    subtitleContainer.createEl("label", { text: "Subtitle" });
    subtitleInput = subtitleContainer.createEl("input", {
      type: "text",
      placeholder: "Post subtitle",
      cls: "substack-input"
    });

    // Pre-fill with bilingual content or frontmatter
    if (this.isBilingual && this.bilingualContent) {
      const langContent = getLanguageContent(this.bilingualContent, this.selectedLanguage);
      this.subtitle = langContent.subtitle || "";
    } else if (this.frontmatter.subtitle) {
      this.subtitle = this.frontmatter.subtitle;
    }
    subtitleInput.value = this.subtitle;

    subtitleInput.addEventListener("input", () => {
      this.subtitle = subtitleInput.value;
    });

    // Audience selector - only show if paid subscribers enabled
    if (this.defaults.paidSubscribersEnabled) {
      const audienceContainer = contentEl.createDiv({
        cls: "substack-field-container"
      });
      audienceContainer.createEl("label", { text: "Audience" });
      const audienceSelect = audienceContainer.createEl("select", {
        cls: "substack-select"
      });

      const audienceOptions: { value: SubstackAudience; label: string }[] = [
        { value: "everyone", label: "Everyone" },
        { value: "only_paid", label: "Paid subscribers only" },
        { value: "founding", label: "Founding members only" },
        { value: "only_free", label: "Free subscribers only" }
      ];

      // Determine effective audience: frontmatter > defaults
      const effectiveAudience = this.frontmatter.audience || this.audience;
      this.audience = effectiveAudience;

      this.logger.debug("Audience selection", {
        frontmatterAudience: this.frontmatter.audience,
        defaultAudience: this.defaults.defaultAudience,
        effectiveAudience
      });

      for (const opt of audienceOptions) {
        const option = audienceSelect.createEl("option", {
          text: opt.label,
          value: opt.value
        });
        if (opt.value === effectiveAudience) {
          option.selected = true;
        }
      }

      audienceSelect.addEventListener("change", () => {
        this.audience = audienceSelect.value as SubstackAudience;
      });
    } else {
      // No paid subscribers - always use "everyone"
      this.audience = "everyone";
    }

    // Tags input
    const tagsContainer = contentEl.createDiv({
      cls: "substack-field-container"
    });
    tagsContainer.createEl("label", { text: "Tags" });
    tagsInput = tagsContainer.createEl("input", {
      type: "text",
      placeholder: "tag1, tag2, tag3",
      cls: "substack-input"
    });

    // Pre-fill with bilingual content or frontmatter or defaults
    if (this.isBilingual && this.bilingualContent) {
      const langContent = getLanguageContent(this.bilingualContent, this.selectedLanguage);
      if (langContent.tags && langContent.tags.length > 0) {
        this.tags = langContent.tags;
      }
    } else if (this.frontmatter.tags && this.frontmatter.tags.length > 0) {
      this.tags = this.frontmatter.tags;
    }
    // Show tags in input (either from bilingual, frontmatter or defaults)
    if (this.tags.length > 0) {
      tagsInput.value = this.tags.join(", ");
    }

    tagsInput.addEventListener("input", () => {
      this.tags = tagsInput.value
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    });

    // WordPress link checkbox - only visible if wordpress_url exists (non-bilingual mode)
    if (!this.isBilingual && this.frontmatter.wordpress_url) {
      new Setting(contentEl)
        .setName("Add WordPress link in footer")
        .setDesc("Include a link to the WordPress version of this article")
        .addToggle((toggle) => {
          toggle
            .setValue(this.addWordPressLink)
            .onChange((value) => {
              this.addWordPressLink = value;
              // Save preference for next time
              if (this.defaults.onWordPressLinkPreferenceChange) {
                this.defaults.onWordPressLinkPreferenceChange(value);
              }
            });
        });
    }

    // Preview removed - not useful

    // Buttons
    const buttonContainer = contentEl.createDiv({
      cls: "substack-button-container"
    });

    buttonContainer
      .createEl("button", {
        text: "Cancel",
        cls: "substack-cancel-button"
      })
      .addEventListener("click", () => {
        this.close();
      });

    this.draftButton = buttonContainer.createEl("button", {
      text: "Save as draft",
      cls: "substack-draft-button"
    });
    this.draftButton.addEventListener("click", () => {
      void this.saveDraft();
    });

    this.publishButton = buttonContainer.createEl("button", {
      text: "Publish",
      cls: "substack-publish-button"
    });
    this.publishButton.addEventListener("click", () => {
      void this.publish();
    });

    // Note
    contentEl.createEl("div", {
      text: "The active note will be converted and published.",
      cls: "substack-note-text"
    });

    // Load sections async
    void this.loadSections(contentEl);
  }

  /**
   * Detect bilingual content in the active file
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
        this.logger.info("Detected bilingual content for Substack", {
          frTitle: this.bilingualContent.fr.title,
          enTitle: this.bilingualContent.en.title
        });
      }
    }
  }

  /**
   * Update form fields when language selection changes
   */
  private updateFieldsForLanguage(
    titleInput: HTMLInputElement,
    subtitleInput: HTMLInputElement,
    tagsInput: HTMLInputElement
  ): void {
    if (!this.bilingualContent) return;

    const langContent = getLanguageContent(this.bilingualContent, this.selectedLanguage);

    // Update title
    this.title = langContent.title;
    titleInput.value = this.title;

    // Update subtitle
    this.subtitle = langContent.subtitle || "";
    subtitleInput.value = this.subtitle;

    // Update tags
    if (langContent.tags && langContent.tags.length > 0) {
      this.tags = langContent.tags;
      tagsInput.value = this.tags.join(", ");
    } else {
      this.tags = [];
      tagsInput.value = "";
    }

    this.logger.debug("Updated fields for language", {
      language: this.selectedLanguage,
      title: this.title,
      subtitle: this.subtitle,
      tags: this.tags
    });
  }

  private loadFrontmatter(): void {
    if (!this.activeFile) return;

    const cache = this.app.metadataCache.getFileCache(this.activeFile);
    if (cache?.frontmatter) {
      const fm = cache.frontmatter;
      const parsed: SubstackFrontmatter = {};

      if (typeof fm.title === "string") {
        parsed.title = fm.title;
      }
      if (typeof fm.subtitle === "string") {
        parsed.subtitle = fm.subtitle;
      }
      if (
        fm.audience === "everyone" ||
        fm.audience === "only_paid" ||
        fm.audience === "only_free" ||
        fm.audience === "founding"
      ) {
        parsed.audience = fm.audience;
      }
      if (Array.isArray(fm.tags)) {
        parsed.tags = fm.tags.filter((t): t is string => typeof t === "string");
      }
      if (typeof fm.section === "string") {
        parsed.section = fm.section;
      }
      if (typeof fm.substack_url === "string") {
        parsed.substack_url = fm.substack_url;
      }
      if (typeof fm.substack_draft_id === "string") {
        parsed.substack_draft_id = fm.substack_draft_id;
      }
      if (typeof fm.wordpress_url === "string") {
        parsed.wordpress_url = fm.wordpress_url;
      }
      if (typeof fm.excerpt === "string") {
        parsed.excerpt = fm.excerpt;
      }

      // Bilingual-specific fields with _fr/_en suffixes
      if (typeof fm.substack_url_fr === "string") {
        parsed.substack_url_fr = fm.substack_url_fr;
      }
      if (typeof fm.substack_url_en === "string") {
        parsed.substack_url_en = fm.substack_url_en;
      }
      if (typeof fm.substack_draft_id_fr === "string") {
        parsed.substack_draft_id_fr = fm.substack_draft_id_fr;
      }
      if (typeof fm.substack_draft_id_en === "string") {
        parsed.substack_draft_id_en = fm.substack_draft_id_en;
      }
      if (typeof fm.wordpress_url_fr === "string") {
        parsed.wordpress_url_fr = fm.wordpress_url_fr;
      }
      if (typeof fm.wordpress_url_en === "string") {
        parsed.wordpress_url_en = fm.wordpress_url_en;
      }

      this.frontmatter = parsed;
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
      this.subtitle = h3Heading.heading;
      this.logger.debug("Extracted subtitle from H3", { subtitle: this.subtitle });
    }
  }

  private async loadSections(contentEl: HTMLElement): Promise<void> {
    try {
      this.sections = await this.api.getSections(this.selectedPublication);

      const sectionContainer = contentEl.querySelector(
        ".substack-section-container"
      ) as HTMLElement;
      if (!sectionContainer) return;

      const liveSections = this.sections.filter((s) => s.is_live);

      // Hide if no sections or only one
      if (liveSections.length <= 1) {
        sectionContainer.style.display = "none";
        // If one section, use it as default
        if (liveSections.length === 1) {
          this.selectedSectionId = liveSections[0]?.id ?? null;
        }
        return;
      }

      sectionContainer.style.display = "block";
      sectionContainer.empty();

      sectionContainer.createEl("label", { text: "Section" });
      const sectionSelect = sectionContainer.createEl("select", {
        cls: "substack-select"
      });

      // Determine which section to select:
      // 1. Frontmatter section (if specified and valid)
      // 2. Default section from settings
      // 3. First live section
      let selectedId: number | null = null;

      // Check frontmatter first
      if (this.frontmatter.section) {
        const fmSection = liveSections.find(
          (s) =>
            s.name.toLowerCase() === this.frontmatter.section?.toLowerCase() ||
            s.slug === this.frontmatter.section
        );
        if (fmSection) {
          selectedId = fmSection.id;
        }
      }

      // Fall back to default from settings
      if (selectedId === null && this.defaults.defaultSectionId !== null) {
        const defaultSection = liveSections.find(
          (s) => s.id === this.defaults.defaultSectionId
        );
        if (defaultSection) {
          selectedId = defaultSection.id;
        }
      }

      // Fall back to first live section
      if (selectedId === null && liveSections.length > 0) {
        selectedId = liveSections[0]?.id ?? null;
      }

      this.selectedSectionId = selectedId;

      for (const section of liveSections) {
        const option = sectionSelect.createEl("option", {
          text: section.name,
          value: section.id.toString()
        });

        if (section.id === selectedId) {
          option.selected = true;
        }
      }

      sectionSelect.addEventListener("change", () => {
        const value = sectionSelect.value;
        this.selectedSectionId = value ? parseInt(value) : null;
      });
    } catch (error) {
      this.logger.warn("Failed to load sections", error);
    }
  }

  private async getMarkdownContent(): Promise<string | null> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active file selected");
      return null;
    }

    let contentToProcess: string;

    // For bilingual content, extract the selected language's content
    if (this.isBilingual && this.bilingualContent) {
      const langContent = getLanguageContent(this.bilingualContent, this.selectedLanguage);
      contentToProcess = langContent.content;
      this.logger.debug("Using bilingual content", {
        language: this.selectedLanguage,
        contentLength: contentToProcess.length
      });
    } else {
      // Non-bilingual: use full content minus frontmatter
      const content = await this.app.vault.cachedRead(activeFile);
      contentToProcess = content.replace(/^---[\s\S]*?---\n?/, "");
    }

    // Process images - upload local images to Substack CDN
    // Note: Enluminure images are automatically skipped (not supported on Substack)
    const basePath = activeFile.parent?.path || "";
    const imageResult = await this.imageHandler.processMarkdownImages(
      this.selectedPublication,
      contentToProcess,
      basePath
    );

    // Notify user of image upload results
    if (imageResult.uploadedImages.length > 0) {
      this.logger.info(
        `Uploaded ${imageResult.uploadedImages.length} image(s) to Substack`
      );
    }

    if (imageResult.errors.length > 0) {
      const errorCount = imageResult.errors.length;
      new Notice(
        `Warning: ${errorCount} image(s) failed to upload. Check dev console for details.`
      );
      for (const err of imageResult.errors) {
        this.logger.warn(`Image upload failed: ${err.path} - ${err.error}`);
      }
    }

    let processedContent = imageResult.processedMarkdown;

    // Convert wikilinks to WordPress URLs (markdown format for Substack converter)
    const wikiLinkResult = this.wikiLinkConverter.processWikiLinks(processedContent, "markdown");
    processedContent = wikiLinkResult.processed;

    if (wikiLinkResult.resolved.length > 0) {
      this.logger.info(`Converted ${wikiLinkResult.resolved.length} wikilink(s) to WordPress URLs`);
    }
    if (wikiLinkResult.unresolved.length > 0) {
      this.logger.debug(`Unresolved wikilinks: ${wikiLinkResult.unresolved.join(", ")}`);
    }

    // Add WordPress header links for bilingual content
    if (this.isBilingual && this.addWordPressHeader) {
      const header = this.generateWordPressHeader();
      if (header) {
        processedContent = `${header  }\n\n${  processedContent}`;
      }
    }

    // Add WordPress link footer if enabled (non-bilingual mode)
    if (!this.isBilingual && this.addWordPressLink && this.frontmatter.wordpress_url) {
      const footer = `\n\n---\n\n📖 Lire cet article sur mon site : [Mon Site](${this.frontmatter.wordpress_url})`;
      processedContent += footer;
      this.logger.debug("Added WordPress link footer", {
        url: this.frontmatter.wordpress_url
      });
    }

    return processedContent;
  }

  /**
   * Generate WordPress header with FR/EN links
   */
  private generateWordPressHeader(): string | null {
    const frUrl = this.frontmatter.wordpress_url_fr;
    const enUrl = this.frontmatter.wordpress_url_en;

    if (!frUrl && !enUrl) {
      return null;
    }

    const links: string[] = [];
    if (frUrl) {
      links.push(`[🇫🇷 Version française](${frUrl})`);
    }
    if (enUrl) {
      links.push(`[🇬🇧 English version](${enUrl})`);
    }

    return `📖 Lire sur mon site : ${links.join(" | ")}\n\n---`;
  }

  /**
   * Find an existing draft by title or ID
   * @returns Draft ID if found, null otherwise
   */
  private async findExistingDraft(): Promise<string | null> {
    try {
      // For bilingual content, check language-specific draft ID first
      const draftIdToCheck = this.isBilingual
        ? (this.selectedLanguage === "fr"
          ? this.frontmatter.substack_draft_id_fr
          : this.frontmatter.substack_draft_id_en)
        : this.frontmatter.substack_draft_id;

      if (draftIdToCheck) {
        this.logger.debug("Found draft ID in frontmatter", {
          draftId: draftIdToCheck,
          language: this.isBilingual ? this.selectedLanguage : "n/a"
        });

        // Verify the draft still exists
        const verifyResponse = await this.api.getDraft(
          this.selectedPublication,
          draftIdToCheck
        );

        if (verifyResponse.status === 200) {
          return draftIdToCheck;
        } else {
          this.logger.warn("Draft ID in frontmatter no longer exists", {
            draftId: draftIdToCheck,
            status: verifyResponse.status
          });
        }
      }

      // If no valid draft ID in frontmatter, check for draft with same title
      const draftsResponse = await this.api.listDrafts(this.selectedPublication);

      if (draftsResponse.status !== 200 || !draftsResponse.json) {
        this.logger.warn("Failed to list drafts", {
          status: draftsResponse.status
        });
        return null;
      }

      const drafts = draftsResponse.json as SubstackDraftResponse[];

      // Search for a draft with matching title
      const matchingDraft = drafts.find(
        (draft) => draft.draft_title === this.title
      );

      if (matchingDraft) {
        this.logger.debug("Found existing draft by title", {
          draftId: matchingDraft.id,
          title: matchingDraft.draft_title
        });
        return matchingDraft.id;
      }

      return null;
    } catch (error) {
      this.logger.warn("Error finding existing draft", error);
      return null;
    }
  }

  /**
   * Update frontmatter with draft ID
   */
  private async updateFrontmatterWithDraftId(draftId: string): Promise<void> {
    if (!this.activeFile) {
      this.logger.warn("No active file to update frontmatter");
      return;
    }

    try {
      await this.app.fileManager.processFrontMatter(
        this.activeFile,
        (frontmatter) => {
          // Use language-specific key for bilingual content
          if (this.isBilingual) {
            const key = this.selectedLanguage === "fr"
              ? "substack_draft_id_fr"
              : "substack_draft_id_en";
            frontmatter[key] = draftId;
          } else {
            frontmatter.substack_draft_id = draftId;
          }
        }
      );
      this.logger.info("Updated frontmatter with draft ID", {
        draftId,
        language: this.isBilingual ? this.selectedLanguage : "n/a"
      });
    } catch (error) {
      this.logger.error("Failed to update frontmatter with draft ID", error);
      // Don't throw - this is a non-critical feature
    }
  }

  private async saveDraft() {
    if (!this.title.trim()) {
      new Notice("Please enter a title");
      return;
    }

    const content = await this.getMarkdownContent();
    if (!content) return;

    this.setButtonsDisabled(true, "Saving...");

    try {
      // Convert markdown to Substack JSON format
      const body = this.converter.convert(content);

      // Check if we should update an existing draft
      const existingDraftId = await this.findExistingDraft();

      let draftId: string | undefined;
      let isUpdate = false;

      if (existingDraftId) {
        // Update existing draft
        this.logger.debug("Updating existing Substack draft", {
          publication: this.selectedPublication,
          draftId: existingDraftId,
          title: this.title,
          audience: this.audience,
          tags: this.tags,
          sectionId: this.selectedSectionId
        });

        const updatePayload: Record<string, unknown> = {
          draft_title: this.title,
          draft_subtitle: this.subtitle || "",
          draft_body: JSON.stringify(body),
          audience: this.audience
        };

        // Add tags if provided
        if (this.tags.length > 0) {
          updatePayload.postTags = this.tags;
        }

        const response = await this.api.updateDraft(
          this.selectedPublication,
          existingDraftId,
          updatePayload as Partial<SubstackDraftPayload>
        );

        if (response.status === 200 || response.status === 201) {
          draftId = existingDraftId;
          isUpdate = true;
        } else {
          throw new Error(this.getErrorMessage(response.status));
        }
      } else {
        // Create new draft
        this.logger.debug("Creating new Substack draft", {
          publication: this.selectedPublication,
          title: this.title,
          audience: this.audience,
          tags: this.tags,
          sectionId: this.selectedSectionId
        });

        const response = await this.api.createDraft(
          this.selectedPublication,
          this.title,
          body,
          this.subtitle,
          this.audience,
          this.tags.length > 0 ? this.tags : undefined
        );

        if (response.status === 200 || response.status === 201) {
          draftId = response.json?.id as string | undefined;
        } else {
          throw new Error(this.getErrorMessage(response.status));
        }
      }

      // Set section if selected
      if (draftId && this.selectedSectionId !== null) {
        await this.api.updateDraftSection(
          this.selectedPublication,
          draftId,
          this.selectedSectionId
        );
      }

      // Update frontmatter with draft ID (if not already present or if new draft)
      if (draftId && !isUpdate) {
        await this.updateFrontmatterWithDraftId(draftId);
      }

      const actionText = isUpdate ? "updated" : "created";
      this.logger.info(`Draft ${actionText} successfully`);
      new Notice(`Draft ${actionText} successfully`);
      this.close();
    } catch (error) {
      this.logger.error("Failed to save draft", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      new Notice(`Failed to save draft: ${errorMessage}`);
      this.setButtonsDisabled(false);
    }
  }

  private async publish() {
    if (!this.title.trim()) {
      new Notice("Please enter a title");
      return;
    }

    const content = await this.getMarkdownContent();
    if (!content) return;

    this.setButtonsDisabled(true, "Publishing...");

    try {
      this.logger.debug("Publishing to Substack", {
        publication: this.selectedPublication,
        title: this.title,
        audience: this.audience,
        tags: this.tags,
        sectionId: this.selectedSectionId
      });

      // Convert markdown to Substack JSON format
      const body = this.converter.convert(content);

      // Check if we should update an existing draft or create new one
      const existingDraftId = await this.findExistingDraft();

      let draftId: string | undefined;

      if (existingDraftId) {
        // Update existing draft
        this.logger.debug("Updating existing draft before publishing", {
          draftId: existingDraftId
        });

        const updatePayload: Record<string, unknown> = {
          draft_title: this.title,
          draft_subtitle: this.subtitle || "",
          draft_body: JSON.stringify(body),
          audience: this.audience
        };

        // Add tags if provided
        if (this.tags.length > 0) {
          updatePayload.postTags = this.tags;
        }

        const draftResponse = await this.api.updateDraft(
          this.selectedPublication,
          existingDraftId,
          updatePayload as Partial<SubstackDraftPayload>
        );

        if (draftResponse.status !== 200 && draftResponse.status !== 201) {
          throw new Error(this.getErrorMessage(draftResponse.status));
        }

        draftId = existingDraftId;
      } else {
        // Create new draft
        const draftResponse = await this.api.createDraft(
          this.selectedPublication,
          this.title,
          body,
          this.subtitle,
          this.audience,
          this.tags.length > 0 ? this.tags : undefined
        );

        if (draftResponse.status !== 200 && draftResponse.status !== 201) {
          throw new Error(this.getErrorMessage(draftResponse.status));
        }

        draftId = draftResponse.json?.id as string | undefined;
        if (!draftId) {
          throw new Error("Invalid response from Substack: missing draft ID");
        }

        // Update frontmatter with draft ID for new drafts
        await this.updateFrontmatterWithDraftId(draftId);
      }

      // Set section if selected
      if (this.selectedSectionId !== null) {
        await this.api.updateDraftSection(
          this.selectedPublication,
          draftId,
          this.selectedSectionId
        );
      }

      // Then publish
      const publishResponse = await this.api.publishDraft(
        this.selectedPublication,
        draftId
      );

      if (publishResponse.status === 200 || publishResponse.status === 201) {
        this.logger.info("Post published successfully");

        // Update frontmatter with Substack URL
        await this.updateFrontmatterWithUrl(publishResponse, this.selectedPublication);

        new Notice("Published successfully");
        this.close();
      } else {
        throw new Error(
          this.getErrorMessage(publishResponse.status, "publish")
        );
      }
    } catch (error) {
      this.logger.error("Failed to publish", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      new Notice(`Failed to publish: ${errorMessage}`);
      this.setButtonsDisabled(false);
    }
  }

  private async updateFrontmatterWithUrl(
    publishResponse: RequestUrlResponse,
    publication: string
  ): Promise<void> {
    if (!this.activeFile) {
      this.logger.warn("No active file to update frontmatter");
      return;
    }

    try {
      const responseData = publishResponse.json as {
        slug?: string;
        canonical_url?: string;
      };

      // Prefer canonical_url if available, otherwise construct from slug
      let substackUrl: string | undefined;

      if (responseData.canonical_url) {
        substackUrl = responseData.canonical_url;
      } else if (responseData.slug) {
        substackUrl = `https://${publication}.substack.com/p/${responseData.slug}`;
      }

      if (substackUrl) {
        await this.app.fileManager.processFrontMatter(
          this.activeFile,
          (frontmatter) => {
            // Use language-specific key for bilingual content
            if (this.isBilingual) {
              const key = this.selectedLanguage === "fr"
                ? "substack_url_fr"
                : "substack_url_en";
              frontmatter[key] = substackUrl;
            } else {
              frontmatter.substack_url = substackUrl;
            }
          }
        );
        this.logger.info("Updated frontmatter with Substack URL", {
          url: substackUrl,
          language: this.isBilingual ? this.selectedLanguage : "n/a"
        });
      } else {
        this.logger.warn(
          "Could not determine Substack URL from publish response"
        );
      }
    } catch (error) {
      this.logger.error("Failed to update frontmatter with Substack URL", error);
      // Don't throw - this is a non-critical feature
    }
  }

  private getErrorMessage(
    status: number,
    action: string = "create draft"
  ): string {
    switch (status) {
    case 401:
    case 403:
      return "Session expired or invalid. Please login again in Settings.";
    case 404:
      return "Publication not found. Check your publication name in Settings.";
    case 429:
      return "Too many requests. Please wait a moment and try again.";
    case 500:
    case 502:
    case 503:
      return "Substack is temporarily unavailable. Please try again later.";
    default:
      return `Failed to ${action} (error ${status})`;
    }
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
