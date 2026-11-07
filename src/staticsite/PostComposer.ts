import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { isValidSlug, pageUrl, slugify } from "./converter";
import { StaticSitePublisher } from "./publisher";
import { StaticSiteConfig } from "./types";

/** Publish dialog for a static site whose content lives in the vault */
export class StaticSitePostComposer extends Modal {
  private readonly publisher: StaticSitePublisher;
  private file: TFile | null = null;

  private title = "";
  private section = "";
  private slug = "";
  private slugEdited = false;
  private description = "";
  private coverImage = "";
  /** Address is fixed once published: changing it would break the page's URL */
  private locked = false;

  private slugInput: HTMLInputElement | null = null;
  private slugStatus: HTMLElement | null = null;
  private publishButton: HTMLButtonElement | null = null;

  constructor(
    app: App,
    private readonly config: StaticSiteConfig
  ) {
    super(app);
    this.publisher = new StaticSitePublisher(app, config);
  }

  override onOpen(): void {
    const { contentEl } = this;
    this.file = this.app.workspace.getActiveFile();
    if (!this.file || this.file.extension !== "md") {
      new Notice("Open a note to publish it to the static site.");
      this.close();
      return;
    }
    const sections = this.publisher.sections;
    const file = this.file;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const text = (key: string): string => {
      const value: unknown = key ? fm[key] : undefined;
      return typeof value === "string" ? value : "";
    };

    this.title = text(this.config.fields.title) || text("title") || file.basename;
    this.description = text(this.config.fields.description) || text("description");
    const published = this.publisher.publishedPath(file);
    if (published) {
      this.locked = true;
      this.section = published.section.name;
      this.slug = published.slug;
    } else {
      const fromNote = text(this.config.fields.section);
      this.section = sections.some((s) => s.name === fromNote) ? fromNote : (sections[0]?.name ?? "");
      this.slug = slugify(this.title);
    }

    contentEl.createEl("h2", { text: "Publish to static site" });

    new Setting(contentEl).setName("Title").addText((t) => {
      t.setValue(this.title).onChange((value) => {
        this.title = value;
        if (!this.locked && !this.slugEdited) {
          this.slug = slugify(value);
          if (this.slugInput) this.slugInput.value = this.slug;
          this.refresh();
        }
      });
      t.inputEl.addClass("substack-input-full-width");
    });

    new Setting(contentEl).setName("Section").addDropdown((d) => {
      for (const s of sections) d.addOption(s.name, s.name);
      d.setValue(this.section)
        .setDisabled(this.locked)
        .onChange((value) => {
          this.section = value;
          this.refresh();
        });
    });

    const slugSetting = new Setting(contentEl)
      .setName("Address")
      .setDesc(
        this.locked
          ? "Already published: the address cannot change."
          : "Lowercase letters, digits and dashes."
      )
      .addText((t) => {
        t.setValue(this.slug)
          .setDisabled(this.locked)
          .onChange((value) => {
            this.slug = value.trim();
            this.slugEdited = true;
            this.refresh();
          });
        this.slugInput = t.inputEl;
      });
    this.slugStatus = slugSetting.descEl.createDiv();

    if (this.config.fields.description) {
      new Setting(contentEl)
        .setName("Description")
        .setDesc("Optional summary, shown in previews and search results.")
        .addTextArea((t) => {
          t.setValue(this.description).onChange((value) => {
            this.description = value;
          });
          t.inputEl.rows = 3;
          t.inputEl.addClass("substack-input-full-width");
        });
    }

    const images = this.publisher.listNoteImages(file);
    if (images.length && this.config.fields.cover) {
      this.coverImage = this.publisher.noteCover(file) ?? "";
      new Setting(contentEl).setName("Cover image").addDropdown((d) => {
        d.addOption("", "None");
        for (const path of images) d.addOption(path, path.split("/").pop() ?? path);
        d.setValue(this.coverImage).onChange((value) => {
          this.coverImage = value;
        });
      });
    }

    new Setting(contentEl)
      .setDesc("The page goes online with the site's next build.")
      .addButton((b) => {
        b.setButtonText(this.locked ? "Update" : "Publish")
          .setCta()
          .onClick(() => void this.publish());
        this.publishButton = b.buttonEl;
      });

    this.refresh();
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private refresh(): void {
    if (!this.file || !this.slugStatus) return;
    const section = this.publisher.section(this.section);
    let problem = "";
    if (!this.title.trim()) problem = "A title is required.";
    else if (!section) problem = "Choose a section.";
    else if (!isValidSlug(this.slug)) problem = "Invalid address.";
    else if (this.publisher.isTakenByOther(this.file, section, this.slug)) {
      problem = "A page already uses this address: choose another one.";
    }
    this.slugStatus.setText(
      problem || (section ? pageUrl(this.config.baseUrl, section.urlPrefix, this.slug) : "")
    );
    this.slugStatus.toggleClass("mod-warning", !!problem);
    if (this.publishButton) this.publishButton.disabled = !!problem;
  }

  private async publish(): Promise<void> {
    if (!this.file) return;
    if (this.publishButton) this.publishButton.disabled = true;
    try {
      const result = await this.publisher.publish(this.file, {
        section: this.section,
        slug: this.slug,
        title: this.title.trim(),
        ...(this.description.trim() ? { description: this.description.trim() } : {}),
        ...(this.coverImage ? { coverImage: this.coverImage } : {})
      });
      for (const warning of result.warnings) new Notice(warning, 8000);
      new Notice(`Page written: ${result.path}\nIt goes online with the site's next build (${result.url}).`, 8000);
      this.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Publication failed: ${message}`, 10000);
      if (this.publishButton) this.publishButton.disabled = false;
    }
  }
}
