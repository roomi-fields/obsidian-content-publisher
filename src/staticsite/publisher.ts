import { App, TFile, TFolder, normalizePath } from "obsidian";
import {
  ImageCollector,
  PageImage,
  buildPageFile,
  convertBody,
  formatDate,
  isImagePath,
  isValidSlug,
  copiedValue,
  normalizeFolder,
  pageFields,
  tickCheckbox,
  pageUrl,
  pageUrlPath
} from "./converter";
import { StaticSiteConfig, StaticSiteSection } from "./types";

export interface StaticPageOptions {
  section: string;
  slug: string;
  title: string;
  description?: string;
  /** Vault path of the cover image */
  coverImage?: string;
}

export interface StaticPublishResult {
  url: string;
  path: string;
  warnings: string[];
  /** Note whose checkbox was ticked to start the site's build, if configured */
  deployNote?: string;
}

/**
 * Publishes a note to a static site whose content lives in the vault: writes the page
 * file into its section folder and its images into the site's image folder, then removes
 * the source draft (the note is moved, not copied). The site's own build puts it online.
 */
export class StaticSitePublisher {
  constructor(
    private readonly app: App,
    private readonly config: StaticSiteConfig
  ) {}

  get sections(): StaticSiteSection[] {
    return this.config.sections.filter((s) => s.name.trim() && normalizeFolder(s.folder));
  }

  section(name: string): StaticSiteSection | undefined {
    return this.sections.find((s) => s.name === name);
  }

  pagePath(section: StaticSiteSection, slug: string): string {
    return normalizePath(`${normalizeFolder(section.folder)}/${slug}.md`);
  }

  /**
   * Where this note is published, if it is itself a page of the site. Since publishing
   * moves the note into its section folder, a note is "published" exactly when it lives
   * at a section's page path.
   */
  publishedPath(file: TFile): { section: StaticSiteSection; slug: string } | null {
    return this.sitePage(file);
  }

  /** A page file of the site itself, in one of its section folders */
  private sitePage(file: TFile): { section: StaticSiteSection; slug: string } | null {
    const section = this.sections.find((s) => file.path === this.pagePath(s, file.basename));
    return section && isValidSlug(file.basename) ? { section, slug: file.basename } : null;
  }

  /** Images found in the note, for choosing a cover */
  listNoteImages(file: TFile): string[] {
    const cache = this.app.metadataCache.getFileCache(file);
    const links = [...(cache?.frontmatterLinks ?? []), ...(cache?.embeds ?? []), ...(cache?.links ?? [])];
    const paths = links
      .map((l) => this.app.metadataCache.getFirstLinkpathDest(l.link.split("#")[0] ?? "", file.path))
      .filter((f): f is TFile => !!f && isImagePath(f.path))
      .map((f) => f.path);
    return [...new Set(paths)];
  }

  /** Image linked from the note's cover field (e.g. image: "[[photo.png]]"), if any */
  noteCover(file: TFile): string | null {
    const key = this.config.fields.cover;
    const link = this.app.metadataCache.getFileCache(file)?.frontmatterLinks?.find((l) => l.key === key);
    const target = link
      ? this.app.metadataCache.getFirstLinkpathDest(link.link.split("#")[0] ?? "", file.path)
      : null;
    return target && isImagePath(target.path) ? target.path : null;
  }

  /** A page that is not this note's own already exists at this address */
  isTakenByOther(file: TFile, section: StaticSiteSection, slug: string): boolean {
    if (!this.app.vault.getAbstractFileByPath(this.pagePath(section, slug))) return false;
    const own = this.publishedPath(file);
    return !(own && own.section.name === section.name && own.slug === slug);
  }

  async publish(file: TFile, options: StaticPageOptions): Promise<StaticPublishResult> {
    const { slug } = options;
    const section = this.section(options.section);
    if (!section) throw new Error(`Unknown section "${options.section}"`);
    if (!isValidSlug(slug)) {
      throw new Error(`Invalid address "${slug}": lowercase letters, digits and dashes only`);
    }
    const own = this.publishedPath(file);
    if (own && (own.section.name !== section.name || own.slug !== slug)) {
      throw new Error(
        `This note is already published as ${own.section.name}/${own.slug}; changing its address is not supported`
      );
    }
    if (this.isTakenByOther(file, section, slug)) {
      throw new Error(`A page already exists at ${section.name}/${slug}: choose another address`);
    }

    const resolver = {
      resolveImage: (link: string): string | null =>
        this.app.metadataCache.getFirstLinkpathDest(link, file.path)?.path ?? null,
      resolvePage: (link: string): string | null => {
        const target = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
        if (!target) return null;
        const page = this.publishedPath(target);
        return page ? pageUrlPath(page.section.urlPrefix, page.slug) : null;
      }
    };

    const collector = new ImageCollector(slug, this.config.imagesUrlPrefix);
    const converted = convertBody(await this.app.vault.read(file), resolver, collector);
    const cover = options.coverImage ? collector.add(options.coverImage) : undefined;
    const images = collector.images;
    this.checkImages(images);

    const path = this.pagePath(section, slug);
    const existing = this.app.vault.getAbstractFileByPath(path);
    const content = buildPageFile(
      pageFields(this.config, {
        title: options.title,
        section: section.fieldValue?.trim() || section.name,
        copied: this.copiedFields(file),
        date: this.keptDate(existing) ?? formatDate(this.config.dateFormat),
        ...(options.description ? { description: options.description } : {}),
        ...(cover ? { cover: cover.url } : {})
      }),
      converted.body
    );

    await this.writeImages(slug, images);
    await this.ensureFolder(normalizeFolder(section.folder));
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }

    // Move, not copy: the page now lives safely in its section folder, so remove the
    // source draft — unless we just republished a page in place (source is the page).
    if (file.path !== path) {
      await this.app.fileManager.trashFile(file);
    }

    const url = pageUrl(this.config.baseUrl, section.urlPrefix, slug);
    const deployNote = await this.triggerDeploy(converted.warnings);
    return { url, path, warnings: converted.warnings, ...(deployNote ? { deployNote } : {}) };
  }

  /** Ticks the configured checkbox that starts the site's build; returns the note path when done */
  private async triggerDeploy(warnings: string[]): Promise<string | null> {
    const notePath = normalizeFolder(this.config.deployNote);
    const label = this.config.deployCheckbox.trim();
    if (!notePath || !label) return null;
    const path = notePath.endsWith(".md") ? notePath : `${notePath}.md`;
    const note = this.app.vault.getAbstractFileByPath(path);
    if (!(note instanceof TFile)) {
      warnings.push(`Site not put online: note not found (${path})`);
      return null;
    }
    let found = true;
    await this.app.vault.process(note, (content) => {
      const ticked = tickCheckbox(content, label);
      found = ticked !== null;
      return ticked ?? content;
    });
    if (!found) {
      warnings.push(`Site not put online: no “${label}” checkbox in ${path}`);
      return null;
    }
    return path;
  }

  /** Configured note fields, as they are in the note's frontmatter */
  private copiedFields(file: TFile): Array<{ key: string; value: string; raw?: boolean }> {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const fields: Array<{ key: string; value: string; raw?: boolean }> = [];
    for (const key of this.config.copiedFields.map((k) => k.trim()).filter(Boolean)) {
      const copied = copiedValue(fm[key]);
      if (copied) fields.push({ key, ...copied });
    }
    return fields;
  }

  /** The first publication date is kept on republish */
  private keptDate(existing: unknown): string | null {
    const key = this.config.fields.date;
    if (!key || !(existing instanceof TFile)) return null;
    const date: unknown = this.app.metadataCache.getFileCache(existing)?.frontmatter?.[key];
    return typeof date === "string" && date.trim() ? date.trim() : null;
  }

  private checkImages(images: PageImage[]): void {
    if (!images.length) return;
    if (!normalizeFolder(this.config.imagesFolder)) {
      throw new Error("This note has images: set the site's image folder in the settings");
    }
    const maxBytes = this.config.maxImageMB * 1024 * 1024;
    const problems: string[] = [];
    for (const image of images) {
      const source = this.app.vault.getAbstractFileByPath(image.vaultPath);
      if (!(source instanceof TFile)) problems.push(`${image.vaultPath}: not found`);
      else if (maxBytes > 0 && source.stat.size > maxBytes) {
        problems.push(`${image.vaultPath}: larger than ${this.config.maxImageMB} MB`);
      }
    }
    if (problems.length) {
      throw new Error(`Images the site cannot take:\n${problems.join("\n")}`);
    }
  }

  /** Writes the page's images and removes the ones it no longer uses */
  private async writeImages(slug: string, images: PageImage[]): Promise<void> {
    const root = normalizeFolder(this.config.imagesFolder);
    if (!root) return;
    const folderPath = normalizePath(`${root}/${slug}`);
    if (images.length) await this.ensureFolder(folderPath);

    for (const image of images) {
      const source = this.app.vault.getAbstractFileByPath(image.vaultPath);
      if (!(source instanceof TFile)) throw new Error(`Image not found: ${image.vaultPath}`);
      const data = await this.app.vault.readBinary(source);
      const targetPath = normalizePath(`${root}/${image.sitePath}`);
      const target = this.app.vault.getAbstractFileByPath(targetPath);
      if (target instanceof TFile) await this.app.vault.modifyBinary(target, data);
      else await this.app.vault.createBinary(targetPath, data);
    }

    // Hidden files (marker files of the site) are not listed by the vault, so never touched
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (folder instanceof TFolder) {
      const kept = new Set(images.map((i) => normalizePath(`${root}/${i.sitePath}`)));
      for (const child of [...folder.children]) {
        if (child instanceof TFile && !kept.has(child.path)) {
          await this.app.fileManager.trashFile(child);
        }
      }
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    let current = "";
    for (const part of path.split("/")) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
}
