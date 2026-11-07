import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { RUBRIQUES, Rubrique, isRubrique, isValidSlug, slugify } from "./converter";
import { ReliancePublisher, publishedPath } from "./publisher";

const RUBRIQUE_LABELS: Record<Rubrique, string> = {
  cnv: "CNV",
  regards: "Regards",
  therapie: "Thérapie"
};

/** Publish dialog for re.liance.art */
export class ReliancePostComposer extends Modal {
  private readonly publisher: ReliancePublisher;
  private file: TFile | null = null;

  private titre = "";
  private rubrique: Rubrique = "cnv";
  private slug = "";
  private slugEdited = false;
  private description = "";
  private coverImage = "";
  /** Address is fixed once published: changing it would break the article's URL */
  private locked = false;

  private slugInput: HTMLInputElement | null = null;
  private slugStatus: HTMLElement | null = null;
  private publishButton: HTMLButtonElement | null = null;

  constructor(app: App, siteRoot: string) {
    super(app);
    this.publisher = new ReliancePublisher(app, siteRoot);
  }

  override onOpen(): void {
    const { contentEl } = this;
    this.file = this.app.workspace.getActiveFile();
    if (!this.file || this.file.extension !== "md") {
      new Notice("Open a note to publish it to re.liance.art.");
      this.close();
      return;
    }
    const file = this.file;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const text = (key: string): string => {
      const value: unknown = fm[key];
      return typeof value === "string" ? value : "";
    };

    this.titre = text("titre") || text("title") || file.basename;
    this.description = text("description");
    const published = publishedPath(this.app, file);
    if (published) {
      this.locked = true;
      this.rubrique = published.rubrique;
      this.slug = published.slug;
    } else {
      const rubrique = text("rubrique");
      if (isRubrique(rubrique)) this.rubrique = rubrique;
      this.slug = slugify(this.titre);
    }

    contentEl.createEl("h2", { text: "Publish to re.liance.art" });

    new Setting(contentEl).setName("Title").addText((t) => {
      t.setValue(this.titre).onChange((value) => {
        this.titre = value;
        if (!this.locked && !this.slugEdited) {
          this.slug = slugify(value);
          if (this.slugInput) this.slugInput.value = this.slug;
          this.refresh();
        }
      });
      t.inputEl.addClass("substack-input-full-width");
    });

    new Setting(contentEl).setName("Section").addDropdown((d) => {
      for (const r of RUBRIQUES) d.addOption(r, RUBRIQUE_LABELS[r]);
      d.setValue(this.rubrique)
        .setDisabled(this.locked)
        .onChange((value) => {
          if (isRubrique(value)) this.rubrique = value;
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

    const images = this.publisher.listNoteImages(file);
    if (images.length) {
      new Setting(contentEl).setName("Cover image").addDropdown((d) => {
        d.addOption("", "None");
        for (const path of images) d.addOption(path, path.split("/").pop() ?? path);
        d.setValue("").onChange((value) => {
          this.coverImage = value;
        });
      });
    }

    new Setting(contentEl)
      .setDesc("The article goes online when the site is next published.")
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
    let problem = "";
    if (!this.titre.trim()) problem = "A title is required.";
    else if (!isValidSlug(this.slug)) problem = "Invalid address.";
    else if (this.publisher.isTakenByOther(this.file, this.rubrique, this.slug)) {
      problem = "An article already uses this address: choose another one.";
    }
    this.slugStatus.setText(problem || `re.liance.art/${this.rubrique}/${this.slug}/`);
    this.slugStatus.toggleClass("mod-warning", !!problem);
    if (this.publishButton) this.publishButton.disabled = !!problem;
  }

  private async publish(): Promise<void> {
    if (!this.file) return;
    if (this.publishButton) this.publishButton.disabled = true;
    try {
      const result = await this.publisher.publish(this.file, {
        rubrique: this.rubrique,
        slug: this.slug,
        titre: this.titre.trim(),
        ...(this.description.trim() ? { description: this.description.trim() } : {}),
        ...(this.coverImage ? { coverImage: this.coverImage } : {})
      });
      for (const warning of result.warnings) new Notice(warning, 8000);
      new Notice(`Ready for re.liance.art: ${result.url}\nIt goes online when the site is next published.`, 8000);
      this.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Publication failed: ${message}`, 10000);
      if (this.publishButton) this.publishButton.disabled = false;
    }
  }
}
