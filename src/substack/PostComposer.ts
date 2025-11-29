import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { SubstackAPI } from "./api";
import { MarkdownConverter } from "./converter";
import { ImageHandler } from "./imageHandler";
import { ILogger } from "../utils/logger";
import {
  SubstackAudience,
  SubstackSection,
  SubstackFrontmatter
} from "./types";

export interface PostComposerDefaults {
  defaultPublication: string;
  defaultSectionId: number | null;
  defaultAudience: SubstackAudience;
  defaultTags: string[];
  paidSubscribersEnabled: boolean;
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
    this.defaults = defaults || {
      defaultPublication: publications[0] || "",
      defaultSectionId: null,
      defaultAudience: "everyone",
      defaultTags: [],
      paidSubscribersEnabled: false
    };

    // Apply defaults
    this.selectedPublication =
      this.defaults.defaultPublication || publications[0] || "";
    this.selectedSectionId = this.defaults.defaultSectionId;
    this.audience = this.defaults.defaultAudience || "everyone";
    this.tags = [...(this.defaults.defaultTags || [])];

    // Ensure we have at least one publication
    if (!this.selectedPublication) {
      throw new Error("At least one publication is required");
    }
  }

  override onOpen() {
    const { contentEl } = this;

    // Get active file and read frontmatter
    this.activeFile = this.app.workspace.getActiveFile();
    this.loadFrontmatter();

    new Setting(contentEl).setName("Publish to substack").setHeading();

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

    // Title input
    const titleContainer = contentEl.createDiv({
      cls: "substack-field-container"
    });
    titleContainer.createEl("label", { text: "Title" });
    const titleInput = titleContainer.createEl("input", {
      type: "text",
      placeholder: "Post title",
      cls: "substack-input"
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

    // Subtitle input
    const subtitleContainer = contentEl.createDiv({
      cls: "substack-field-container"
    });
    subtitleContainer.createEl("label", { text: "Subtitle" });
    const subtitleInput = subtitleContainer.createEl("input", {
      type: "text",
      placeholder: "Post subtitle",
      cls: "substack-input"
    });

    // Pre-fill with frontmatter
    if (this.frontmatter.subtitle) {
      this.subtitle = this.frontmatter.subtitle;
      subtitleInput.value = this.subtitle;
    }

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
    const tagsInput = tagsContainer.createEl("input", {
      type: "text",
      placeholder: "tag1, tag2, tag3",
      cls: "substack-input"
    });

    // Pre-fill with frontmatter or defaults
    if (this.frontmatter.tags && this.frontmatter.tags.length > 0) {
      this.tags = this.frontmatter.tags;
    }
    // Show tags in input (either from frontmatter or defaults)
    if (this.tags.length > 0) {
      tagsInput.value = this.tags.join(", ");
    }

    tagsInput.addEventListener("input", () => {
      this.tags = tagsInput.value
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    });

    // Content preview
    const previewContainer = contentEl.createDiv({
      cls: "substack-preview-container"
    });
    previewContainer.createEl("label", { text: "Preview" });
    const preview = previewContainer.createEl("div", {
      cls: "substack-preview"
    });

    if (this.activeFile) {
      this.app.vault
        .cachedRead(this.activeFile)
        .then((content) => {
          // Remove frontmatter for preview
          const cleanContent = content.replace(/^---[\s\S]*?---\n?/, "");
          preview.textContent =
            cleanContent.slice(0, 500) +
            (cleanContent.length > 500 ? "..." : "");
        })
        .catch(() => {
          preview.textContent = "Failed to load preview";
        });
    } else {
      preview.textContent = "No active file selected";
    }

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

      this.frontmatter = parsed;
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

    const content = await this.app.vault.cachedRead(activeFile);
    // Remove frontmatter
    const cleanContent = content.replace(/^---[\s\S]*?---\n?/, "");

    // Process images - upload local images to Substack CDN
    const basePath = activeFile.parent?.path || "";
    const imageResult = await this.imageHandler.processMarkdownImages(
      this.selectedPublication,
      cleanContent,
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

    return imageResult.processedMarkdown;
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
      this.logger.debug("Creating Substack draft", {
        publication: this.selectedPublication,
        title: this.title,
        audience: this.audience,
        tags: this.tags,
        sectionId: this.selectedSectionId
      });

      // Convert markdown to Substack JSON format
      const body = this.converter.convert(content);

      const response = await this.api.createDraft(
        this.selectedPublication,
        this.title,
        body,
        this.subtitle,
        this.audience,
        this.tags.length > 0 ? this.tags : undefined
      );

      if (response.status === 200 || response.status === 201) {
        const draftId = response.json?.id as string | undefined;

        // Set section if selected
        if (draftId && this.selectedSectionId !== null) {
          await this.api.updateDraftSection(
            this.selectedPublication,
            draftId,
            this.selectedSectionId
          );
        }

        this.logger.info("Draft created successfully");
        new Notice("Draft saved successfully");
        this.close();
      } else {
        throw new Error(this.getErrorMessage(response.status));
      }
    } catch (error) {
      this.logger.error("Failed to create draft", error);
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

      // First create draft
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

      const draftId = draftResponse.json?.id as string | undefined;
      if (!draftId) {
        throw new Error("Invalid response from Substack: missing draft ID");
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
