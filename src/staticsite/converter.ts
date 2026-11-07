/**
 * Static site (vault folder) — pure conversion of an Obsidian note into a site page file.
 *
 * For static sites (Astro, Hugo, Jekyll, Eleventy…) whose content lives in a vault folder:
 * publishing writes a Markdown file into the folder of its section, plus its images into the
 * site's image folder. The site's own build then puts it online.
 */

import { StaticSiteConfig } from "./types";

/** Lowercase ASCII letters, digits and single dashes */
export function slugify(text: string): string {
  return text
    .replace(/[œŒ]/g, "oe")
    .replace(/[æÆ]/g, "ae")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/** "/x/" form of a URL prefix ("" → "/") */
export function normalizeUrlPrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

/** Vault folder path without leading/trailing slashes */
export function normalizeFolder(folder: string): string {
  return folder.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/** Site-relative URL of a page: section prefix + slug + "/" */
export function pageUrlPath(urlPrefix: string, slug: string): string {
  return `${normalizeUrlPrefix(urlPrefix)}${slug}/`;
}

/** Absolute URL of a page, or its site-relative path when no base URL is set */
export function pageUrl(baseUrl: string, urlPrefix: string, slug: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}${pageUrlPath(urlPrefix, slug)}`;
}

export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif", "gif", "svg"];

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
  /** Site-relative URL of a note published on the site, or null */
  resolvePage(link: string): string | null;
}

export interface PageImage {
  /** Vault path of the source image */
  vaultPath: string;
  /** Path inside the site's image folder: "<slug>/<name>" */
  sitePath: string;
  /** URL used in the page */
  url: string;
}

export interface ConvertedBody {
  body: string;
  warnings: string[];
}

/** Collects the images of one page and gives each a unique, URL-safe name */
export class ImageCollector {
  readonly images: PageImage[] = [];
  private readonly urlPrefix: string;

  constructor(
    private readonly slug: string,
    imagesUrlPrefix: string
  ) {
    this.urlPrefix = normalizeUrlPrefix(imagesUrlPrefix);
  }

  add(vaultPath: string): PageImage {
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
    const image = { vaultPath, sitePath, url: `${this.urlPrefix}${sitePath}` };
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

  // Wikilinks: link to the page when the target is published on the site, plain text otherwise
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_match: string, inner: string) => {
    const pipe = inner.indexOf("|");
    const target = pipe >= 0 ? inner.slice(0, pipe) : inner;
    const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : "";
    const [file, heading] = target.split("#");
    const text = alias || heading?.trim() || (file ?? "").trim().split("/").pop() || target;
    const url = resolver.resolvePage(linkPath(target));
    return url ? `[${text}](${url})` : text;
  });

  // Markdown links to local notes: same rule as wikilinks (avoids dead links)
  out = out.replace(
    /(^|[^!])\[([^\]]+)\]\(<?([^)>\s]+\.md)(#[^)>\s]*)?>?\)/g,
    (match: string, before: string, text: string, path: string) => {
      if (!isLocal(path)) return match;
      const url = resolver.resolvePage(decodeURI(path).replace(/\.md$/, ""));
      return url ? `${before}[${text}](${url})` : `${before}${text}`;
    }
  );

  // Highlights and callout markers are Obsidian-only
  out = out.replace(/==([^=\n]+)==/g, "$1");
  out = out.replace(/^(\s*>\s*)\[![^\]]+\][+-]?[ \t]*(.*)$/gm, (_m: string, quote: string, title: string) =>
    title.trim() ? `${quote}**${title.trim()}**` : quote.trimEnd()
  );

  return out;
}

/** Applies fn to the parts of a text outside inline code spans */
function outsideInlineCode(text: string, fn: (text: string) => string): string {
  return text
    .split(/(`+[^`]*`+)/)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");
}

/**
 * Converts the note body into plain Markdown for the site.
 * Images are registered in the collector; code blocks and inline code are left untouched.
 */
export function convertBody(
  markdown: string,
  resolver: LinkResolver,
  collector: ImageCollector
): ConvertedBody {
  const warnings: string[] = [];
  const lines = stripFrontmatter(markdown).split(/\r?\n/);
  const out: string[] = [];
  let fence: string | null = null;
  let prose: string[] = [];

  const flushProse = (): void => {
    if (!prose.length) return;
    // Comments may span lines: convert the whole prose segment at once
    out.push(outsideInlineCode(prose.join("\n"), (t) => convertProse(t, resolver, collector, warnings)));
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
  return { body, warnings };
}

/** YAML scalar: plain when unambiguous, JSON-quoted (valid YAML) otherwise */
export function yamlScalar(value: string): string {
  return /^[A-Za-z0-9_./-]+$/.test(value) && !/^(true|false|null|yes|no|on|off|~)$/i.test(value)
    ? value
    : JSON.stringify(value);
}

/**
 * Builds the page file: frontmatter from ordered key/value pairs, then the body.
 * Values in `raw` are written as is (dates), the others as YAML strings.
 */
export function buildPageFile(
  fields: Array<{ key: string; value: string; raw?: boolean }>,
  body: string
): string {
  const lines = ["---"];
  const seen = new Set<string>();
  for (const { key, value, raw } of fields) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    lines.push(`${key}: ${raw ? value : yamlScalar(value)}`);
  }
  lines.push("---", "");
  return lines.join("\n") + body;
}

/** Formats a date with YYYY, MM and DD tokens (local time) */
export function formatDate(format: string, now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (format || "YYYY-MM-DD")
    .replace(/YYYY/g, String(now.getFullYear()))
    .replace(/MM/g, pad(now.getMonth() + 1))
    .replace(/DD/g, pad(now.getDate()));
}

/**
 * Ticks the "- [ ] <label>" checkbox of a note (any list marker). Returns null when the
 * checkbox is not in the note; an already ticked checkbox is left as is.
 */
export function tickCheckbox(content: string, label: string): string | null {
  const escaped = label.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const box = new RegExp(`^(\\s*[-*+] \\[)([ xX])(\\] ${escaped}\\s*)$`, "m");
  const match = box.exec(content);
  if (!match) return null;
  return content.replace(box, "$1x$3");
}

/** A note frontmatter value as a page field: strings, numbers, booleans, lists of those; null otherwise */
export function copiedValue(value: unknown): { value: string; raw?: boolean } | null {
  if (typeof value === "string") return value ? { value } : null;
  if (typeof value === "number" || typeof value === "boolean") return { value: String(value), raw: true };
  if (Array.isArray(value) && value.every((v) => typeof v === "string" || typeof v === "number")) {
    return { value: `[${value.map((v) => (typeof v === "string" ? yamlScalar(v) : String(v))).join(", ")}]`, raw: true };
  }
  return null;
}

/** Page fields, in frontmatter order, according to the site configuration */
export function pageFields(
  config: StaticSiteConfig,
  page: {
    title: string;
    section: string;
    date: string;
    description?: string;
    cover?: string;
    /** Fields copied from the note (before fixed fields: the first occurrence of a key wins) */
    copied?: Array<{ key: string; value: string; raw?: boolean }>;
  }
): Array<{ key: string; value: string; raw?: boolean }> {
  const f = config.fields;
  const fields: Array<{ key: string; value: string; raw?: boolean }> = [
    { key: f.title, value: page.title },
    { key: f.section, value: page.section },
    ...(page.copied ?? []),
    ...config.fixedFields.map((x) => ({ key: x.key.trim(), value: x.value })),
    { key: f.date, value: page.date, raw: true }
  ];
  if (page.description) fields.push({ key: f.description, value: page.description });
  if (page.cover) fields.push({ key: f.cover, value: page.cover });
  return fields.filter((x) => x.key.trim());
}
