import { App, Modal, Notice } from "obsidian";
import { LinkedInAPI } from "./api";
import { createLogger } from "../utils/logger";

export class LinkedInPostComposer extends Modal {
  private postContent: string = "";
  private api: LinkedInAPI;
  private logger: ReturnType<typeof createLogger>;
  private postButton: { disabled: boolean; textContent: string | null } | null = null;

  constructor(app: App, api: LinkedInAPI, logger: ReturnType<typeof createLogger>) {
    super(app);
    this.api = api;
    this.logger = logger;
  }

  override onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h2", { text: "Create LinkedIn post" });

    const textareaContainer = contentEl.createDiv({ cls: "contentos-post-textarea-container" });

    const textarea = textareaContainer.createEl("textarea", {
      placeholder: "What do you want to share on LinkedIn?",
      cls: "contentos-post-textarea"
    });

    textarea.value = this.postContent;
    textarea.addEventListener("input", (e) => {
      this.postContent = textarea.value;
    });

    const charCount = textareaContainer.createEl("div", {
      text: `${this.postContent.length}/3000 characters`,
      cls: "contentos-char-count"
    });

    textarea.addEventListener("input", () => {
      charCount.textContent = `${this.postContent.length}/3000 characters`;
    });

    const buttonContainer = contentEl.createDiv({
      cls: "contentos-button-container"
    });

    buttonContainer.createEl("button", {
      text: "Cancel",
      cls: "contentos-cancel-button"
    }).addEventListener("click", () => {
      this.close();
    });

    const postButton = buttonContainer.createEl("button", {
      text: "Post",
      cls: "contentos-post-button"
    });

    this.postButton = postButton;
    postButton.addEventListener("click", async () => {
      await this.postToLinkedIn();
    });

    contentEl.createEl("div", {
      text: "Note: You need to configure your LinkedIn access token in the plugin settings first.",
      cls: "contentos-note-text"
    });
  }

  private async postToLinkedIn() {
    if (!this.postContent.trim()) {
      new Notice("Please enter some content for your post");
      return;
    }

    if (this.postButton) {
      this.postButton.disabled = true;
      this.postButton.textContent = "Posting...";
    }

    try {
      this.logger.debug("Posting to LinkedIn", { contentLength: this.postContent.length });

      const response = await this.api.createPost(this.postContent);

      if (response.status === 201) {
        this.logger.info("LinkedIn post created successfully");
        new Notice("Post published to LinkedIn successfully!");
        this.close();
      } else {
        throw new Error(`Failed to post: ${response.status}`);
      }
    } catch (error) {
      this.logger.error("Failed to post to LinkedIn", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to post to LinkedIn: ${errorMessage}`);

      if (this.postButton) {
        this.postButton.disabled = false;
        this.postButton.textContent = "Post to LinkedIn";
      }
    }
  }

  override onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
