import { App, Component, MarkdownRenderer, TFile, Vault } from "obsidian";
import { WordPressAPI } from "./api";
import {
  WordPressImageReference,
  WordPressImageProcessingResult,
  WordPressEnluminureInfo
} from "./types";
import { ILogger } from "../utils/logger";

// Supported image formats
const SUPPORTED_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml"
};

/**
 * Handles image processing and upload to WordPress media library
 */
export class WordPressImageHandler {
  private api: WordPressAPI;
  private app: App;
  private vault: Vault;
  private logger: ILogger;

  constructor(api: WordPressAPI, app: App, logger: ILogger) {
    this.api = api;
    this.app = app;
    this.vault = app.vault;
    this.logger = logger;
  }

  /**
   * Parse all image references from markdown content
   * Matches: ![alt](path) or ![alt](path "title") or ![[path]] or ![[path|size]]
   */
  parseImageReferences(markdown: string): WordPressImageReference[] {
    const references: WordPressImageReference[] = [];

    // Standard markdown image syntax: ![alt](path) or ![alt](path "title")
    const standardRegex = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]+)")?\)/g;
    let match;
    while ((match = standardRegex.exec(markdown)) !== null) {
      const path = match[2] ?? "";
      if (path) {
        const ref: WordPressImageReference = {
          fullMatch: match[0],
          alt: match[1] ?? "",
          path,
          isLocal: this.isLocalPath(path)
        };
        if (match[3]) {
          ref.title = match[3];
        }
        references.push(ref);
      }
    }

    // Obsidian wikilink image syntax: ![[path]] or ![[path|size]] or ![[path|alt]]
    const wikiLinkRegex = /!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;
    while ((match = wikiLinkRegex.exec(markdown)) !== null) {
      const path = match[1] ?? "";
      if (path) {
        const sizeOrAlt = match[2] ?? "";
        // If it's a number, it's a size; otherwise it's alt text
        const isSize = /^\d+$/.test(sizeOrAlt);
        const ref: WordPressImageReference = {
          fullMatch: match[0],
          alt: isSize ? "" : sizeOrAlt,
          path,
          isLocal: true, // Wikilinks are always local
          isWikiLink: true,
          wikiLinkSize: isSize ? parseInt(sizeOrAlt, 10) : undefined
        };
        references.push(ref);
      }
    }

    return references;
  }

  /**
   * Detect and extract enluminure information from markdown
   * Returns the enluminure image reference if found at the start of content
   */
  detectEnluminure(markdown: string): WordPressEnluminureInfo | null {
    // Look for enluminure pattern at the beginning of the content (after frontmatter)
    const lines = markdown.split("\n");
    let foundEnluminure: WordPressImageReference | null = null;
    let lineIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim() ?? "";

      // Skip empty lines
      if (!line) continue;

      // Check for wikilink enluminure: ![[...enluminure...]]
      const wikiMatch = line.match(
        /^!\[\[([^\]|]*enluminure[^\]|]*)(?:\|([^\]]*))?\]\]$/i
      );
      if (wikiMatch) {
        const path = wikiMatch[1] ?? "";
        const sizeOrAlt = wikiMatch[2] ?? "";
        const isSize = /^\d+$/.test(sizeOrAlt);
        foundEnluminure = {
          fullMatch: wikiMatch[0],
          alt: isSize ? "" : sizeOrAlt,
          path,
          isLocal: true,
          isWikiLink: true,
          wikiLinkSize: isSize ? parseInt(sizeOrAlt, 10) : undefined
        };
        lineIndex = i;
        break;
      }

      // Check for standard markdown enluminure: ![...](path/enluminure...)
      const stdMatch = line.match(
        /^!\[([^\]]*)\]\(([^\s)]*enluminure[^\s)]*)(?:\s+"([^"]+)")?\)$/i
      );
      if (stdMatch) {
        foundEnluminure = {
          fullMatch: stdMatch[0],
          alt: stdMatch[1] ?? "",
          path: stdMatch[2] ?? "",
          isLocal: this.isLocalPath(stdMatch[2] ?? ""),
          title: stdMatch[3]
        };
        lineIndex = i;
        break;
      }

      // If we hit a non-empty, non-image line, stop looking
      if (!line.startsWith("!")) {
        break;
      }
    }

    if (!foundEnluminure || lineIndex === -1) {
      return null;
    }

    return {
      imageRef: foundEnluminure,
      lineIndex
    };
  }

  /**
   * Check if a path is local (not a URL)
   */
  private isLocalPath(path: string): boolean {
    return (
      !path.startsWith("http://") &&
      !path.startsWith("https://") &&
      !path.startsWith("data:")
    );
  }

  /**
   * Resolve a relative image path to an absolute vault path
   * @param imagePath - The image path from markdown
   * @param basePath - The directory containing the current note
   */
  resolveImagePath(imagePath: string, basePath: string): string {
    // Handle absolute paths (starting with /)
    if (imagePath.startsWith("/")) {
      return imagePath.substring(1); // Remove leading slash for vault path
    }

    // Handle relative paths
    // Normalize path separators to /
    const normalizedImage = imagePath.replace(/\\/g, "/");
    const normalizedBase = basePath.replace(/\\/g, "/");

    // Split paths
    const baseParts = normalizedBase.split("/").filter((p) => p);
    const imageParts = normalizedImage.split("/");

    // Process relative path components
    for (const part of imageParts) {
      if (part === "..") {
        baseParts.pop();
      } else if (part !== ".") {
        baseParts.push(part);
      }
    }

    return baseParts.join("/");
  }

  /**
   * Resolve wikilink path to vault path
   * Obsidian wikilinks can be:
   * 1. Full path from vault root: _Assets/Images/photo.png
   * 2. Just a filename: photo.png (Obsidian searches the vault)
   */
  resolveWikiLinkPath(wikiPath: string, _basePath: string): string {
    // Remove leading slash if present
    const cleanPath = wikiPath.startsWith("/") ? wikiPath.substring(1) : wikiPath;

    // First try: exact path from vault root
    const exactFile = this.vault.getAbstractFileByPath(cleanPath);
    if (exactFile && exactFile instanceof TFile) {
      return cleanPath;
    }

    // Second try: search by filename (like Obsidian does)
    // This handles cases like ![[IKIGAI.png]] where the file is somewhere in the vault
    const fileName = cleanPath.split("/").pop() || cleanPath;
    const allFiles = this.vault.getFiles();
    const matchingFile = allFiles.find(f => f.name === fileName);

    if (matchingFile) {
      this.logger.debug(`Resolved wikilink by filename search: ${wikiPath} -> ${matchingFile.path}`);
      return matchingFile.path;
    }

    // Fallback: return original path (will likely fail but error will be logged)
    return cleanPath;
  }

  /**
   * Get the file extension from a path
   */
  private getExtension(path: string): string {
    const parts = path.split(".");
    const lastPart = parts[parts.length - 1];
    return parts.length > 1 && lastPart ? lastPart.toLowerCase() : "";
  }

  /**
   * Check if an extension is supported
   */
  private isSupportedFormat(extension: string): boolean {
    return SUPPORTED_EXTENSIONS.includes(extension);
  }

  /**
   * Upload a single image to WordPress media library
   */
  async uploadImage(
    vaultPath: string
  ): Promise<{
    success: boolean;
    url?: string | undefined;
    mediaId?: number | undefined;
    error?: string | undefined;
  }> {
    // Get file from vault
    const file = this.vault.getAbstractFileByPath(vaultPath);

    if (!file || !(file instanceof TFile)) {
      return { success: false, error: `File not found: ${vaultPath}` };
    }

    // Check extension
    const extension = this.getExtension(vaultPath);
    if (!this.isSupportedFormat(extension)) {
      return {
        success: false,
        error: `Unsupported format: ${extension}. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`
      };
    }

    // Check file size
    if (file.stat.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File too large: ${(file.stat.size / 1024 / 1024).toFixed(1)} MB (max: 10 MB)`
      };
    }

    // Read file binary
    const imageData = await this.vault.readBinary(file);

    // Get MIME type
    const mimeType = MIME_TYPES[extension] || "application/octet-stream";

    // Upload to WordPress
    const result = await this.api.uploadMedia(imageData, file.name, mimeType);

    if (result.success && result.data) {
      return {
        success: true,
        url: result.data.source_url,
        mediaId: result.data.id
      };
    }

    return { success: false, error: result.error || "Upload failed" };
  }

  /**
   * Convert an SVG file to PNG using the browser Canvas API (Electron),
   * then upload the PNG to WordPress.
   * WordPress blocks SVG uploads, so we rasterize them first.
   */
  private async convertSvgToPng(
    vaultPath: string,
    width?: number
  ): Promise<{
    success: boolean;
    url?: string;
    mediaId?: number;
    error?: string;
  }> {
    const file = this.vault.getAbstractFileByPath(vaultPath);
    if (!file || !(file instanceof TFile)) {
      return { success: false, error: `SVG file not found: ${vaultPath}` };
    }

    const svgContent = await this.vault.read(file);

    // Convert SVG to PNG via Canvas
    const scale = 2; // 2x for retina/high-DPI
    const targetWidth = width || 800;

    try {
      const pngData = await new Promise<ArrayBuffer>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          // Compute dimensions preserving aspect ratio
          const aspect = img.naturalHeight / img.naturalWidth;
          const w = targetWidth;
          const h = Math.round(w * aspect);

          const canvas = document.createElement("canvas");
          canvas.width = w * scale;
          canvas.height = h * scale;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0, w, h);

          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error("Canvas toBlob returned null"));
              return;
            }
            blob.arrayBuffer().then(resolve).catch(reject);
          }, "image/png");
        };
        img.onerror = () => reject(new Error("Failed to load SVG into Image"));

        // Load SVG as data URI
        const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
        img.src = URL.createObjectURL(svgBlob);
      });

      // Upload the PNG with a .png filename
      const pngFilename = file.name.replace(/\.svg$/i, ".png");
      const result = await this.api.uploadMedia(pngData, pngFilename, "image/png");

      if (result.success && result.data) {
        return {
          success: true,
          url: result.data.source_url,
          mediaId: result.data.id
        };
      }

      return { success: false, error: result.error || "PNG upload failed" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `SVG→PNG conversion failed: ${msg}` };
    }
  }

  /**
   * Process enluminure specified in frontmatter
   * Uploads the image and returns enluminure info
   */
  private async processEnluminureFromFrontmatter(
    enluminurePath: string,
    basePath: string
  ): Promise<WordPressEnluminureInfo | null> {
    this.logger.debug(`Processing frontmatter enluminure: ${enluminurePath}`);

    // Try multiple path resolutions:
    // 1. First try as vault-root relative path (most common for frontmatter)
    // 2. Then try as file-relative path
    const pathsToTry = [
      enluminurePath, // Vault root relative
      this.resolveImagePath(enluminurePath, basePath) // File relative
    ];

    let uploadResult: {
      success: boolean;
      url?: string | undefined;
      mediaId?: number | undefined;
      error?: string | undefined;
    } | null = null;

    for (const vaultPath of pathsToTry) {
      this.logger.debug(`Trying enluminure path: ${vaultPath}`);

      // Check if file exists before trying to upload
      const file = this.vault.getAbstractFileByPath(vaultPath);
      if (!file || !(file instanceof TFile)) {
        this.logger.debug(`File not found at: ${vaultPath}`);
        continue;
      }

      uploadResult = await this.uploadImage(vaultPath);
      if (uploadResult.success) {
        this.logger.debug(`Successfully uploaded from: ${vaultPath}`);
        break;
      }
    }

    // If still not found, log all attempted paths
    if (!uploadResult || !uploadResult.success) {
      this.logger.error(`Failed to find/upload frontmatter enluminure. Tried: ${pathsToTry.join(", ")}`);
      return null;
    }

    if (uploadResult.url && uploadResult.mediaId !== undefined) {
      // Create a synthetic image reference for the enluminure
      const imageRef: WordPressImageReference = {
        fullMatch: enluminurePath,
        alt: "Image enluminure",
        path: enluminurePath,
        isLocal: true
      };

      return {
        imageRef,
        lineIndex: 0,
        wordpressUrl: uploadResult.url,
        mediaId: uploadResult.mediaId
      };
    }

    return null;
  }

  /**
   * Process TikZ blocks in markdown: render via tikzjax, convert SVG→PNG, upload to WordPress.
   * Replaces each ````tikz block with a standard markdown image pointing to the uploaded PNG.
   * Must be called BEFORE processMarkdownImages so that the resulting ![](url) gets picked up normally.
   */
  async processTikzBlocks(markdown: string): Promise<string> {
    // Normalize CRLF → LF (Windows files use \r\n which breaks regex matching)
    markdown = markdown.replace(/\r\n/g, "\n");

    // Match ```tikz or ````tikz blocks (3 or 4 backticks)
    const tikzRegex = /(`{3,4})tikz\n([\s\S]*?)\1/g;
    const matches: { fullMatch: string; tikzCode: string }[] = [];

    let m;
    while ((m = tikzRegex.exec(markdown)) !== null) {
      matches.push({ fullMatch: m[0], tikzCode: m[2] ?? "" });
    }

    if (matches.length === 0) {
      return markdown;
    }

    this.logger.info(`Found ${matches.length} TikZ block(s) to convert`);
    console.log(`[TikZ] Found ${matches.length} block(s) to convert`);
    let result = markdown;

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      if (!match) continue;

      console.log(`[TikZ] Rendering block ${i + 1}/${matches.length}...`);
      try {
        const pngUrl = await this.renderTikzToPng(match.tikzCode, i);
        if (pngUrl) {
          result = result.replace(match.fullMatch, `![TikZ diagram](${pngUrl})`);
          this.logger.info(`TikZ block ${i + 1}/${matches.length} → ${pngUrl}`);
          console.log(`[TikZ] ✓ Block ${i + 1}/${matches.length} → ${pngUrl}`);
        } else {
          this.logger.warn(`TikZ block ${i + 1}/${matches.length}: conversion failed, keeping original`);
          console.warn(`[TikZ] ✗ Block ${i + 1}/${matches.length}: conversion failed`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`TikZ block ${i + 1}/${matches.length} error: ${msg}`);
        console.error(`[TikZ] ✗ Block ${i + 1}/${matches.length} error: ${msg}`);
      }
    }

    return result;
  }

  /**
   * Render a single TikZ code block to PNG and upload to WordPress.
   * Uses MarkdownRenderer to trigger tikzjax, captures the SVG, converts to PNG via Canvas.
   */
  private async renderTikzToPng(tikzCode: string, index: number): Promise<string | null> {
    // Create a hidden container in the DOM
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    document.body.appendChild(container);

    try {
      // Render the TikZ block via Obsidian's MarkdownRenderer (triggers tikzjax)
      const tikzMarkdown = `\`\`\`\`tikz\n${tikzCode}\`\`\`\``;
      const component = new Component();
      component.load();

      await MarkdownRenderer.render(
        this.app,
        tikzMarkdown,
        container,
        "",
        component
      );

      // Wait for tikzjax to produce an SVG (MutationObserver with timeout)
      const svgElement = await this.waitForSvg(container, 15000);
      component.unload();

      if (!svgElement) {
        this.logger.warn(`TikZ block ${index}: no SVG produced after timeout`);
        return null;
      }

      // Inline fonts into SVG so they survive Image sandboxing
      await this.inlineSvgFonts(svgElement);

      // Convert SVG element to PNG via Canvas
      const svgContent = new XMLSerializer().serializeToString(svgElement);
      const pngData = await this.svgStringToPng(svgContent, 800);

      // Upload to WordPress
      const filename = `tikz-diagram-${Date.now()}-${index}.png`;
      const uploadResult = await this.api.uploadMedia(pngData, filename, "image/png");

      if (uploadResult.success && uploadResult.data) {
        return uploadResult.data.source_url;
      }

      this.logger.warn(`TikZ upload failed: ${uploadResult.error}`);
      return null;
    } finally {
      document.body.removeChild(container);
    }
  }

  /**
   * Wait for tikzjax to produce a fully rendered SVG in the container.
   * tikzjax may insert intermediate states (loading placeholder) before the final SVG.
   * We wait for an SVG to appear, then wait for the DOM to stabilize (no mutations
   * for `stabilizeMs`) before capturing.
   */
  private waitForSvg(container: HTMLElement, timeoutMs: number): Promise<SVGElement | null> {
    const stabilizeMs = 2000; // Wait 2s of no mutations after SVG appears

    return new Promise((resolve) => {
      let stabilizeTimer: ReturnType<typeof setTimeout> | null = null;

      const tryResolve = () => {
        const svg = container.querySelector("svg");
        if (svg) {
          // Reset the stabilize timer on every mutation — only resolve
          // once the SVG has been stable for stabilizeMs
          if (stabilizeTimer) clearTimeout(stabilizeTimer);
          stabilizeTimer = setTimeout(() => {
            observer.disconnect();
            clearTimeout(deadlineTimer);
            resolve(svg as SVGElement);
          }, stabilizeMs);
        }
      };

      const observer = new MutationObserver(() => {
        tryResolve();
      });

      observer.observe(container, { childList: true, subtree: true, attributes: true });

      // Also check immediately in case SVG is already there
      tryResolve();

      // Hard deadline — resolve with whatever we have
      const deadlineTimer = setTimeout(() => {
        observer.disconnect();
        if (stabilizeTimer) clearTimeout(stabilizeTimer);
        const svg = container.querySelector("svg");
        resolve(svg as SVGElement | null);
      }, timeoutMs);
    });
  }

  /**
   * Inline @font-face rules into the SVG so fonts survive Image sandboxing.
   * Finds all font-family references in the SVG, locates matching @font-face rules
   * in the document stylesheets, converts font URLs to data URIs, and injects them
   * as a <style> element inside the SVG <defs>.
   */
  private async inlineSvgFonts(svgElement: SVGElement): Promise<void> {
    // Collect all font-family values used in the SVG (attributes + inline styles)
    const fontFamilies = new Set<string>();

    svgElement.querySelectorAll("[font-family]").forEach(el => {
      const ff = el.getAttribute("font-family");
      if (ff) fontFamilies.add(ff.replace(/['"]/g, ""));
    });

    svgElement.querySelectorAll("[style]").forEach(el => {
      const style = el.getAttribute("style") || "";
      const match = style.match(/font-family:\s*([^;]+)/);
      if (match?.[1]) fontFamilies.add(match[1].trim().replace(/['"]/g, ""));
    });

    // Also check computed styles on text elements
    svgElement.querySelectorAll("text").forEach(el => {
      try {
        const computed = getComputedStyle(el);
        const ff = computed.fontFamily;
        if (ff) fontFamilies.add(ff.replace(/['"]/g, "").split(",")[0]?.trim() || "");
      } catch { /* ignore */ }
    });

    fontFamilies.delete("");
    if (fontFamilies.size === 0) {
      this.logger.debug("No font families found in SVG");
      return;
    }

    this.logger.debug(`SVG font families to inline: ${[...fontFamilies].join(", ")}`);

    // Find matching @font-face rules in document stylesheets
    const inlinedRules: string[] = [];

    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // Cross-origin stylesheet
      }

      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue;

        const family = rule.style.getPropertyValue("font-family").replace(/['"]/g, "");
        if (!fontFamilies.has(family)) continue;

        // Convert font URL to data URI
        let cssText = rule.cssText;
        const urlMatches = cssText.matchAll(/url\(["']?([^"')]+)["']?\)/g);

        for (const urlMatch of urlMatches) {
          const fontUrl = urlMatch[1];
          if (!fontUrl) continue;

          try {
            const response = await fetch(fontUrl);
            const blob = await response.blob();
            const dataUri = await this.blobToDataUri(blob);
            cssText = cssText.replace(urlMatch[0], `url(${dataUri})`);
          } catch {
            this.logger.debug(`Could not inline font URL: ${fontUrl}`);
          }
        }

        inlinedRules.push(cssText);
      }
    }

    if (inlinedRules.length === 0) {
      this.logger.debug("No @font-face rules found to inline");
      return;
    }

    this.logger.info(`Inlined ${inlinedRules.length} @font-face rule(s) into SVG`);

    // Inject into SVG <defs>
    const svgNS = "http://www.w3.org/2000/svg";
    let defs = svgElement.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(svgNS, "defs");
      svgElement.prepend(defs);
    }

    const styleEl = document.createElementNS(svgNS, "style");
    styleEl.textContent = inlinedRules.join("\n");
    defs.appendChild(styleEl);
  }

  /**
   * Convert a Blob to a data URI string.
   */
  private blobToDataUri(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Convert an SVG string to PNG ArrayBuffer using Canvas.
   * Transparent background — no white fill.
   */
  private svgStringToPng(svgContent: string, targetWidth: number): Promise<ArrayBuffer> {
    const scale = 2; // 2x for retina/high-DPI

    return new Promise<ArrayBuffer>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const aspect = img.naturalHeight / img.naturalWidth;
        const w = targetWidth;
        const h = Math.round(w * aspect);

        const canvas = document.createElement("canvas");
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }
        // Transparent background — no fillRect
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob returned null"));
            return;
          }
          blob.arrayBuffer().then(resolve).catch(reject);
        }, "image/png");
      };
      img.onerror = () => reject(new Error("Failed to load SVG into Image"));

      const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
      img.src = URL.createObjectURL(svgBlob);
    });
  }

  /**
   * Process all images in markdown content
   * Uploads local images to WordPress and replaces paths with WordPress URLs
   * Detects and handles enluminure images separately
   * @param markdown - The markdown content
   * @param basePath - Base path for resolving relative image paths
   * @param frontmatterEnluminure - Optional enluminure path from frontmatter
   */
  async processMarkdownImages(
    markdown: string,
    basePath: string,
    frontmatterEnluminure?: string
  ): Promise<WordPressImageProcessingResult> {
    const references = this.parseImageReferences(markdown);
    const localImages = references.filter((ref) => ref.isLocal);

    const uploadedImages: WordPressImageProcessingResult["uploadedImages"] = [];
    const errors: WordPressImageProcessingResult["errors"] = [];

    let processedMarkdown = markdown;
    let enluminureResult: WordPressEnluminureInfo | undefined = undefined;

    // Handle frontmatter enluminure first (takes precedence)
    if (frontmatterEnluminure) {
      const enluminureUploadResult = await this.processEnluminureFromFrontmatter(
        frontmatterEnluminure,
        basePath
      );
      if (enluminureUploadResult) {
        enluminureResult = enluminureUploadResult;
        uploadedImages.push({
          originalPath: frontmatterEnluminure,
          wordpressUrl: enluminureUploadResult.wordpressUrl || "",
          mediaId: enluminureUploadResult.mediaId || 0
        });
        this.logger.info(`Uploaded frontmatter enluminure: ${frontmatterEnluminure}`);
      }
    }

    // Detect enluminure in content (only if not already from frontmatter)
    const enluminureInfo = !enluminureResult ? this.detectEnluminure(markdown) : null;

    // Normalize frontmatter enluminure path for comparison
    const normalizedFrontmatterEnluminure = frontmatterEnluminure
      ? frontmatterEnluminure.toLowerCase().replace(/\\/g, "/")
      : null;

    // Process each local image
    for (const ref of localImages) {
      // Check if this is an enluminure image (detected in content)
      const isEnluminure =
        enluminureInfo && ref.fullMatch === enluminureInfo.imageRef.fullMatch;

      // Check if this image matches the frontmatter enluminure (should be removed from content)
      const normalizedRefPath = ref.path.toLowerCase().replace(/\\/g, "/");
      const matchesFrontmatterEnluminure = normalizedFrontmatterEnluminure &&
        (normalizedRefPath === normalizedFrontmatterEnluminure ||
         normalizedRefPath.endsWith(normalizedFrontmatterEnluminure) ||
         normalizedFrontmatterEnluminure.endsWith(normalizedRefPath));

      // If this image matches the frontmatter enluminure, remove it from content and skip
      if (matchesFrontmatterEnluminure) {
        this.logger.debug(`Removing duplicate enluminure from content: ${ref.path}`);
        processedMarkdown = processedMarkdown.replace(ref.fullMatch, "");
        continue;
      }

      // Resolve path based on whether it's a wikilink or standard markdown
      let vaultPath: string;
      if (ref.isWikiLink) {
        vaultPath = this.resolveWikiLinkPath(ref.path, basePath);
      } else {
        vaultPath = this.resolveImagePath(ref.path, basePath);
      }

      this.logger.debug(`Processing image: ${ref.path} -> ${vaultPath}`);

      // SVG: convert to PNG then upload (WordPress blocks SVG uploads by default)
      const ext = this.getExtension(vaultPath);
      if (ext === "svg") {
        const svgResult = await this.convertSvgToPng(vaultPath, ref.wikiLinkSize);
        if (svgResult.success && svgResult.url) {
          const newImageMarkdown = `![${ref.alt || ref.path}](${svgResult.url})`;
          processedMarkdown = processedMarkdown.replace(ref.fullMatch, newImageMarkdown);
          if (svgResult.mediaId !== undefined) {
            uploadedImages.push({
              originalPath: ref.path,
              wordpressUrl: svgResult.url,
              mediaId: svgResult.mediaId
            });
          }
          this.logger.info(`SVG→PNG: ${ref.path} -> ${svgResult.url}`);
        } else {
          errors.push({ path: ref.path, error: svgResult.error || "SVG conversion failed" });
          this.logger.warn(`Failed SVG→PNG: ${ref.path} - ${svgResult.error}`);
        }
        continue;
      }

      const result = await this.uploadImage(vaultPath);

      if (result.success && result.url && result.mediaId !== undefined) {
        if (isEnluminure) {
          // Store enluminure info separately - remove from markdown
          // (will be handled specially in PostComposer)
          processedMarkdown = processedMarkdown.replace(ref.fullMatch, "");
          enluminureResult = {
            ...enluminureInfo,
            wordpressUrl: result.url,
            mediaId: result.mediaId
          };
          this.logger.info(`Uploaded enluminure: ${ref.path} -> ${result.url}`);
        } else {
          // Replace the path in markdown with WordPress URL
          const newImageMarkdown = ref.title
            ? `![${ref.alt}](${result.url} "${ref.title}")`
            : `![${ref.alt}](${result.url})`;

          processedMarkdown = processedMarkdown.replace(
            ref.fullMatch,
            newImageMarkdown
          );

          this.logger.info(`Uploaded image: ${ref.path} -> ${result.url}`);
        }

        uploadedImages.push({
          originalPath: ref.path,
          wordpressUrl: result.url,
          mediaId: result.mediaId
        });
      } else {
        errors.push({
          path: ref.path,
          error: result.error || "Unknown error"
        });

        this.logger.warn(
          `Failed to upload image: ${ref.path} - ${result.error}`
        );
      }
    }

    // Clean up any leftover empty lines from enluminure removal
    processedMarkdown = processedMarkdown.replace(/^\s*\n/, "");

    return {
      processedMarkdown,
      uploadedImages,
      errors,
      enluminure: enluminureResult
    };
  }
}
