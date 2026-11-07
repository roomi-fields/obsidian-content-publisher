import { App, TFile, TFolder, normalizePath } from "obsidian";
import {
  ArticleImage,
  ImageCollector,
  IMAGES_FOLDER,
  MAX_IMAGE_BYTES,
  RUBRIQUES,
  RUBRIQUE_FOLDERS,
  Rubrique,
  articleUrl,
  buildArticleFile,
  convertBody,
  isImagePath,
  isRubrique,
  isValidSlug,
  today
} from "./converter";

export interface RelianceArticleOptions {
  rubrique: Rubrique;
  slug: string;
  titre: string;
  description?: string;
  /** Vault path of the cover image */
  coverImage?: string;
}

export interface ReliancePublishResult {
  url: string;
  path: string;
  warnings: string[];
}

/** Source-note frontmatter key holding "<rubrique>/<slug>" once published */
export const PATH_KEY = "reliance_path";
export const URL_KEY = "reliance_url";

/** "<rubrique>/<slug>" recorded in a note's frontmatter, if valid */
export function publishedPath(app: App, file: TFile): { rubrique: Rubrique; slug: string } | null {
  const value: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.[PATH_KEY];
  if (typeof value !== "string") return null;
  const [rubrique, slug] = value.split("/");
  return isRubrique(rubrique) && slug && isValidSlug(slug) ? { rubrique, slug } : null;
}

/**
 * Publishes a note to re.liance.art by writing the article file and its images
 * into the site's folder of the vault. The site goes online with the next
 * "Publier les sites" run, triggered by the user.
 */
export class ReliancePublisher {
  constructor(
    private readonly app: App,
    /** Vault path of the site's root folder */
    private readonly root: string
  ) {}

  private path(...parts: string[]): string {
    return normalizePath([this.root, ...parts].join("/"));
  }

  articlePath(rubrique: Rubrique, slug: string): string {
    return this.path(RUBRIQUE_FOLDERS[rubrique], `${slug}.md`);
  }

  /** Images found in the note, for choosing a cover */
  listNoteImages(file: TFile): string[] {
    const cache = this.app.metadataCache.getFileCache(file);
    const links = [...(cache?.embeds ?? []), ...(cache?.links ?? [])];
    const paths = links
      .map((l) => this.app.metadataCache.getFirstLinkpathDest(l.link.split("#")[0] ?? "", file.path))
      .filter((f): f is TFile => !!f && isImagePath(f.path))
      .map((f) => f.path);
    return [...new Set(paths)];
  }

  /** Another note already published at this place, or a file not owned by this note */
  isTakenByOther(file: TFile, rubrique: Rubrique, slug: string): boolean {
    if (!this.app.vault.getAbstractFileByPath(this.articlePath(rubrique, slug))) return false;
    const own = publishedPath(this.app, file);
    return !(own && own.rubrique === rubrique && own.slug === slug);
  }

  async publish(file: TFile, options: RelianceArticleOptions): Promise<ReliancePublishResult> {
    const { rubrique, slug } = options;
    if (!isValidSlug(slug)) {
      throw new Error(`Invalid slug "${slug}": lowercase letters, digits and dashes only`);
    }
    const own = publishedPath(this.app, file);
    if (own && (own.rubrique !== rubrique || own.slug !== slug)) {
      throw new Error(
        `This note is already published as ${own.rubrique}/${own.slug}; changing its address is not supported`
      );
    }
    if (this.isTakenByOther(file, rubrique, slug)) {
      throw new Error(`An article already exists at ${rubrique}/${slug}: choose another slug`);
    }

    const resolver = {
      resolveImage: (link: string): string | null => {
        const target = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
        return target ? target.path : null;
      },
      resolveArticle: (link: string): string | null => {
        const target = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
        if (!target) return null;
        const published = publishedPath(this.app, target) ?? this.siteArticle(target);
        return published ? `/${published.rubrique}/${published.slug}/` : null;
      }
    };

    const collector = new ImageCollector(slug);
    const converted = convertBody(await this.app.vault.read(file), slug, resolver, collector);
    const cover = options.coverImage ? collector.add(options.coverImage) : undefined;
    const images = collector.images;

    this.checkImages(images);

    const articlePath = this.articlePath(rubrique, slug);
    const existing = this.app.vault.getAbstractFileByPath(articlePath);
    const content = buildArticleFile(
      {
        titre: options.titre,
        rubrique,
        date: this.keptDate(existing) ?? today(),
        ...(options.description ? { description: options.description } : {}),
        ...(cover ? { image: cover.url } : {})
      },
      converted.body
    );

    await this.writeImages(slug, images);
    await this.ensureFolder(this.path(RUBRIQUE_FOLDERS[rubrique]));
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(articlePath, content);
    }

    const url = articleUrl(rubrique, slug);
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      fm[PATH_KEY] = `${rubrique}/${slug}`;
      fm[URL_KEY] = url;
    });

    return { url, path: articlePath, warnings: converted.warnings };
  }

  /** A file of the site itself, in one of its section folders */
  private siteArticle(target: TFile): { rubrique: Rubrique; slug: string } | null {
    for (const rubrique of RUBRIQUES) {
      if (target.path === this.articlePath(rubrique, target.basename) && isValidSlug(target.basename)) {
        return { rubrique, slug: target.basename };
      }
    }
    return null;
  }

  /** The first publication date is kept on republish (it orders the articles) */
  private keptDate(existing: unknown): string | null {
    if (!(existing instanceof TFile)) return null;
    const date: unknown = this.app.metadataCache.getFileCache(existing)?.frontmatter?.date;
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
    return null;
  }

  private checkImages(images: ArticleImage[]): void {
    const problems: string[] = [];
    for (const image of images) {
      const source = this.app.vault.getAbstractFileByPath(image.vaultPath);
      if (!(source instanceof TFile)) problems.push(`${image.vaultPath}: not found`);
      else if (source.stat.size > MAX_IMAGE_BYTES) problems.push(`${image.vaultPath}: larger than 5 MB`);
    }
    if (problems.length) {
      throw new Error(`Images the site cannot take:\n${problems.join("\n")}`);
    }
  }

  /** Writes the article's images and removes the ones it no longer uses */
  private async writeImages(slug: string, images: ArticleImage[]): Promise<void> {
    const folderPath = this.path(IMAGES_FOLDER, slug);
    if (images.length) await this.ensureFolder(folderPath);

    for (const image of images) {
      const source = this.app.vault.getAbstractFileByPath(image.vaultPath);
      if (!(source instanceof TFile)) throw new Error(`Image not found: ${image.vaultPath}`);
      const data = await this.app.vault.readBinary(source);
      const targetPath = this.path(IMAGES_FOLDER, image.sitePath);
      const target = this.app.vault.getAbstractFileByPath(targetPath);
      if (target instanceof TFile) await this.app.vault.modifyBinary(target, data);
      else await this.app.vault.createBinary(targetPath, data);
    }

    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (folder instanceof TFolder) {
      const kept = new Set(images.map((i) => this.path(IMAGES_FOLDER, i.sitePath)));
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
