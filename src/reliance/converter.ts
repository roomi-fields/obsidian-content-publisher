/**
 * re.liance.art — pure conversion of an Obsidian note into a site article file.
 *
 * The site is a static Astro build with no publishing API: an article is a Markdown file
 * dropped into the vault folder of its rubrique, picked up by the site's "Publier les sites" run.
 * Contract (agreed with the site, see reliance repo scripts/dossiers-vault.sh, src/content.config.ts):
 * - one file per article, slug = file name, URL = /<rubrique>/<slug>/
 * - frontmatter: titre, rubrique, type: article, statut: publie, date (+ description, image)
 * - body: plain Markdown (no Obsidian syntax)
 * - images: copied into the vault folder "Images des articles/", served at /images/obsidian/<path>
 */

export const RUBRIQUES = ["cnv", "regards", "therapie"] as const;
export type Rubrique = (typeof RUBRIQUES)[number];

/** Vault folder of each rubrique, relative to the site's root folder in the vault */
export const RUBRIQUE_FOLDERS: Record<Rubrique, string> = {
  cnv: "Articles CNV/articles",
  regards: "Articles Regards/articles",
  therapie: "Articles Thérapie/articles"
};

export const IMAGES_FOLDER = "Images des articles";
export const IMAGE_URL_PREFIX = "/images/obsidian/";
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif", "gif", "svg"];
/** Larger images are dropped by the site sync, which then breaks the build */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const SITE_URL = "https://re.liance.art";

export function isRubrique(value: unknown): value is Rubrique {
  return typeof value === "string" && (RUBRIQUES as readonly string[]).includes(value);
}

/** Lowercase ASCII letters, digits and single dashes */
export function slugify(text: string): string {
  return text
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

export function articleUrl(rubrique: Rubrique, slug: string): string {
  return `${SITE_URL}/${rubrique}/${slug}/`;
}

export function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(path));
}

/** Resolves links of the source note against the vault (injected: needs Obsidian) */
export interface LinkResolver {
  /** Vault path of the image a link points to, or null if not found */
  resolveImage(link: string): string | null;
  /** Site path ("/<rubrique>/<slug>/") of a note published on re.liance.art, or null */
  resolveArticle(link: string): string | null;
}

export interface ArticleImage {
  /** Vault path of the source image */
  vaultPath: string;
  /** Path inside the images folder: "<slug>/<name>" */
  sitePath: string;
  /** URL used in the article: "/images/obsidian/<slug>/<name>" */
  url: string;
}

export interface ConvertedBody {
  body: string;
  images: ArticleImage[];
  warnings: string[];
}

/** Collects the images of one article and gives each a unique, URL-safe name */
export class ImageCollector {
  readonly images: ArticleImage[] = [];

  constructor(private readonly slug: string) {}

  add(vaultPath: string): ArticleImage {
    const existing = this.images.find((i) => i.vaultPath === vaultPath);
    if (existing) return existing;

    const file = vaultPath.split("/").pop() ?? vaultPath;
    const ext = extensionOf(file);
    const base = slugify(ext ? file.slice(0, -(ext.length + 1)) : file) || "image";
    let name = `${base}.${ext}`;
    for (let n = 2; this.images.some((i) => i.sitePath === `${this.slug}/${name}`); n++) {
      name = `${base}-${n}.${ext}`;
    }
    const sitePath = `${this.slug}/${name}`;
    const image = { vaultPath, sitePath, url: `${IMAGE_URL_PREFIX}${sitePath}` };
    this.images.push(image);
    return image;
  }
}

export function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, "");
}

/** Link target without heading/block reference and alias: "Note#Part|Alias" → "Note" */
function linkPath(target: string): string {
  return target.split("|")[0]!.split("#")[0]!.trim();
}

function isLocal(path: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(path) && !path.startsWith("//");
}

/** Converts Obsidian-specific syntax of a text segment that contains no code */
function convertProse(
  text: string,
  resolver: LinkResolver,
  collector: ImageCollector,
  warnings: string[]
): string {
  let out = text.replace(/%%[\s\S]*?%%/g, "");

  // Markdown images with a local path: ![alt](path "title") — before embeds, whose output it would re-read
  out = out.replace(
    /!\[([^\]]*)\]\(<?([^)>\s]+)>?((?:\s+"[^"]*")?)\)/g,
    (match: string, alt: string, path: string, title: string) => {
      if (!isLocal(path)) return match;
      const vaultPath = resolver.resolveImage(decodeURI(path));
      if (!vaultPath) {
        warnings.push(`Image not found in the vault: ${path}`);
        return "";
      }
      return `![${alt}](${collector.add(vaultPath).url}${title})`;
    }
  );

  // Embeds: ![[image.png|alt or width]] → image; other embeds cannot be rendered on the site
  out = out.replace(/!\[\[([^\]]+)\]\]/g, (match: string, inner: string) => {
    const path = linkPath(inner);
    const option = inner.includes("|") ? inner.slice(inner.indexOf("|") + 1).trim() : "";
    if (!isImagePath(path)) {
      warnings.push(`Embedded note removed (not supported by the site): ${match}`);
      return "";
    }
    const vaultPath = resolver.resolveImage(path);
    if (!vaultPath) {
      warnings.push(`Image not found in the vault: ${path}`);
      return "";
    }
    const alt = /^\d+(x\d+)?$/.test(option) ? "" : option;
    return `![${alt}](${collector.add(vaultPath).url})`;
  });

  // Wikilinks: link to the article when the target is published on the site, plain text otherwise
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_match: string, inner: string) => {
    const pipe = inner.indexOf("|");
    const target = pipe >= 0 ? inner.slice(0, pipe) : inner;
    const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : "";
    const [file, heading] = target.split("#");
    const text = alias || heading?.trim() || (file ?? "").trim().split("/").pop() || target;
    const url = resolver.resolveArticle(linkPath(target));
    return url ? `[${text}](${url})` : text;
  });

  // Markdown links to local notes: same rule as wikilinks (a dead link would stop the site build)
  out = out.replace(
    /(^|[^!])\[([^\]]+)\]\(<?([^)>\s]+\.md)(#[^)>\s]*)?>?\)/g,
    (match: string, before: string, text: string, path: string) => {
      if (!isLocal(path)) return match;
      const url = resolver.resolveArticle(decodeURI(path).replace(/\.md$/, ""));
      return url ? `${before}[${text}](${url})` : `${before}${text}`;
    }
  );

  // Highlights and callout markers have no rendering on the site
  out = out.replace(/==([^=\n]+)==/g, "$1");
  out = out.replace(/^(\s*>\s*)\[![^\]]+\][+-]?[ \t]*(.*)$/gm, (_m: string, quote: string, title: string) =>
    title.trim() ? `${quote}**${title.trim()}**` : quote.trimEnd()
  );

  return out;
}

/** Applies fn to the parts of a line outside inline code spans */
function outsideInlineCode(line: string, fn: (text: string) => string): string {
  return line
    .split(/(`+[^`]*`+)/)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");
}

/**
 * Converts the note body into plain Markdown for the site.
 * Code blocks and inline code are left untouched.
 */
export function convertBody(
  markdown: string,
  slug: string,
  resolver: LinkResolver,
  collector: ImageCollector = new ImageCollector(slug)
): ConvertedBody {
  const warnings: string[] = [];
  const lines = stripFrontmatter(markdown).split(/\r?\n/);
  const out: string[] = [];
  let fence: string | null = null;
  let prose: string[] = [];

  const flushProse = (): void => {
    if (!prose.length) return;
    // Comments may span lines: convert the whole prose segment at once, inline code protected
    const text = prose.join("\n");
    const converted = outsideInlineCode(text, (t) => convertProse(t, resolver, collector, warnings));
    out.push(converted);
    prose = [];
  };

  for (const line of lines) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      out.push(line);
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    } else if (marker) {
      flushProse();
      out.push(line);
      fence = marker;
    } else {
      prose.push(line);
    }
  }
  flushProse();

  const body = `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
  return { body, images: [...collector.images], warnings };
}

export interface ArticleFields {
  titre: string;
  rubrique: Rubrique;
  date: string;
  description?: string;
  image?: string;
}

/** Builds the article file: frontmatter accepted by the site's schema + body */
export function buildArticleFile(fields: ArticleFields, body: string): string {
  // JSON strings are valid YAML double-quoted scalars
  const lines = [
    "---",
    `titre: ${JSON.stringify(fields.titre)}`,
    `rubrique: ${fields.rubrique}`,
    "type: article",
    "statut: publie",
    `date: ${fields.date}`
  ];
  if (fields.description) lines.push(`description: ${JSON.stringify(fields.description)}`);
  if (fields.image) lines.push(`image: ${JSON.stringify(fields.image)}`);
  lines.push("---", "");
  return lines.join("\n") + body;
}

/** Local date as YYYY-MM-DD */
export function today(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
