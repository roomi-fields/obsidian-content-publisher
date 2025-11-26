import { App, Modal, Notice, Setting } from "obsidian";
import { SubstackAPI } from "./api";
import { MarkdownConverter } from "./converter";
import { createLogger } from "../utils/logger";

export class SubstackPostComposer extends Modal {
  private api: SubstackAPI;
  private publications: string[];
  private logger: ReturnType<typeof createLogger>;
  private converter: MarkdownConverter;
  private selectedPublication: string;
  private title: string = "";
  private subtitle: string = "";
  private publishButton: HTMLButtonElement | null = null;
  private draftButton: HTMLButtonElement | null = null;

  constructor(
    app: App,
    api: SubstackAPI,
    publications: string[],
    logger: ReturnType<typeof createLogger>
  ) {
    super(app);
    this.api = api;
    this.publications = publications;
    this.logger = logger;
    this.converter = new MarkdownConverter();

    // Ensure we have at least one publication
    const firstPublication = publications[0];
    if (!firstPublication) {
      throw new Error("At least one publication is required");
    }
    this.selectedPublication = firstPublication;
  }

  override onOpen() {
    const { contentEl } = this;

    new Setting(contentEl).setName("Publish to substack").setHeading();

    // Publication selector
    const pubContainer = contentEl.createDiv({ cls: "substack-field-container" });
    pubContainer.createEl("label", { text: "Publication" });
    const pubSelect = pubContainer.createEl("select", { cls: "substack-select" });

    for (const pub of this.publications) {
      const option = pubSelect.createEl("option", { text: pub, value: pub });
      if (pub === this.selectedPublication) {
        option.selected = true;
      }
    }

    pubSelect.addEventListener("change", () => {
      this.selectedPublication = pubSelect.value;
    });

    // Title input
    const titleContainer = contentEl.createDiv({ cls: "substack-field-container" });
    titleContainer.createEl("label", { text: "Title" });
    const titleInput = titleContainer.createEl("input", {
      type: "text",
      placeholder: "Post title",
      cls: "substack-input"
    });

    // Pre-fill with active file name if available
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      this.title = activeFile.basename;
      titleInput.value = this.title;
    }

    titleInput.addEventListener("input", () => {
      this.title = titleInput.value;
    });

    // Subtitle input
    const subtitleContainer = contentEl.createDiv({ cls: "substack-field-container" });
    subtitleContainer.createEl("label", { text: "Subtitle" });
    const subtitleInput = subtitleContainer.createEl("input", {
      type: "text",
      placeholder: "Post subtitle",
      cls: "substack-input"
    });

    subtitleInput.addEventListener("input", () => {
      this.subtitle = subtitleInput.value;
    });

    // Content preview
    const previewContainer = contentEl.createDiv({ cls: "substack-preview-container" });
    previewContainer.createEl("label", { text: "Preview" });
    const preview = previewContainer.createEl("div", { cls: "substack-preview" });

    if (activeFile) {
      this.app.vault.cachedRead(activeFile).then((content) => {
        // Remove frontmatter for preview
        const cleanContent = content.replace(/^---[\s\S]*?---\n?/, "");
        preview.textContent = cleanContent.slice(0, 500) + (cleanContent.length > 500 ? "..." : "");
      }).catch(() => {
        preview.textContent = "Failed to load preview";
      });
    } else {
      preview.textContent = "No active file selected";
    }

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "substack-button-container" });

    buttonContainer.createEl("button", {
      text: "Cancel",
      cls: "substack-cancel-button"
    }).addEventListener("click", () => {
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
  }

  private async getMarkdownContent(): Promise<string | null> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active file selected");
      return null;
    }

    const content = await this.app.vault.cachedRead(activeFile);
    // Remove frontmatter
    return content.replace(/^---[\s\S]*?---\n?/, "");
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
        title: this.title
      });

      // Convert markdown to Substack JSON format
      const body = this.converter.convert(content);

      const response = await this.api.createDraft(
        this.selectedPublication,
        this.title,
        body,
        this.subtitle
      );

      if (response.status === 200 || response.status === 201) {
        this.logger.info("Draft created successfully");
        new Notice("Draft saved successfully");
        this.close();
      } else {
        throw new Error(this.getErrorMessage(response.status));
      }
    } catch (error) {
      this.logger.error("Failed to create draft", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
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
        title: this.title
      });

      // Convert markdown to Substack JSON format
      const body = this.converter.convert(content);

      // First create draft
      const draftResponse = await this.api.createDraft(
        this.selectedPublication,
        this.title,
        body,
        this.subtitle
      );

      if (draftResponse.status !== 200 && draftResponse.status !== 201) {
        throw new Error(this.getErrorMessage(draftResponse.status));
      }

      const draftId = draftResponse.json?.id as string | undefined;
      if (!draftId) {
        throw new Error("Invalid response from Substack: missing draft ID");
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
        throw new Error(this.getErrorMessage(publishResponse.status, "publish"));
      }
    } catch (error) {
      this.logger.error("Failed to publish", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to publish: ${errorMessage}`);
      this.setButtonsDisabled(false);
    }
  }

  private getErrorMessage(status: number, action: string = "create draft"): string {
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
