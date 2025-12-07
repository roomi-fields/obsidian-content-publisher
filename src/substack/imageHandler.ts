import { TFile, Vault } from "obsidian";
import { SubstackAPI } from "./api";
import {
  ImageReference,
  ImageProcessingResult,
  EnluminureInfo
} from "./types";
import { ILogger } from "../utils/logger";

// Supported image formats
const SUPPORTED_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp"
};

/**
 * Handles image processing and upload to Substack CDN
 */
export class ImageHandler {
  private api: SubstackAPI;
  private vault: Vault;
  private logger: ILogger;

  constructor(api: SubstackAPI, vault: Vault, logger: ILogger) {
    this.api = api;
    this.vault = vault;
    this.logger = logger;
  }

  /**
   * Parse all image references from markdown content
   * Matches: ![alt](path) or ![alt](path "title") or ![[path]] or ![[path|size]]
   */
  parseImageReferences(markdown: string): ImageReference[] {
    const references: ImageReference[] = [];

    // Standard markdown image syntax: ![alt](path) or ![alt](path "title")
    const standardRegex = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]+)")?\)/g;
    let match;
    while ((match = standardRegex.exec(markdown)) !== null) {
      const path = match[2] ?? "";
      if (path) {
        const ref: ImageReference = {
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
        const ref: ImageReference = {
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
   * Note: Enluminures are detected so they can be REMOVED from Substack output
   * (Substack doesn't support float/wrap text around images)
   */
  detectEnluminure(markdown: string): EnluminureInfo | null {
    // Look for enluminure pattern at the beginning of the content (after frontmatter)
    const lines = markdown.split("\n");
    let foundEnluminure: ImageReference | null = null;
    let lineIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim() ?? "";

      // Skip empty lines
      if (!line) continue;

      // Check for wikilink enluminure: ![[...enluminure...]]
      const wikiMatch = line.match(/^!\[\[([^\]|]*enluminure[^\]|]*)(?:\|([^\]]*))?\]\]$/i);
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
      const stdMatch = line.match(/^!\[([^\]]*)\]\(([^\s)]*enluminure[^\s)]*)(?:\s+"([^"]+)")?\)$/i);
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
   * Upload a single image to Substack CDN
   */
  async uploadImage(
    publication: string,
    vaultPath: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
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

    // Upload to Substack
    const result = await this.api.uploadImage(
      publication,
      imageData,
      file.name,
      mimeType
    );

    if (result.success && result.data) {
      return { success: true, url: result.data.url };
    }

    return { success: false, error: result.error || "Upload failed" };
  }

  /**
   * Resolve wikilink path to vault path
   * Obsidian wikilinks are relative to vault root, not to the current file
   */
  resolveWikiLinkPath(wikiPath: string, _basePath: string): string {
    // Wikilinks in Obsidian are always relative to vault root
    // So we just return the path as-is (removing any leading /)
    if (wikiPath.startsWith("/")) {
      return wikiPath.substring(1);
    }
    return wikiPath;
  }

  /**
   * Process all images in markdown content
   * Uploads local images to Substack CDN and replaces paths
   * Detects and handles enluminure images specially
   */
  async processMarkdownImages(
    publication: string,
    markdown: string,
    basePath: string
  ): Promise<ImageProcessingResult> {
    const references = this.parseImageReferences(markdown);
    const localImages = references.filter((ref) => ref.isLocal);

    const uploadedImages: ImageProcessingResult["uploadedImages"] = [];
    const errors: ImageProcessingResult["errors"] = [];

    let processedMarkdown = markdown;
    let enluminureResult: ImageProcessingResult["enluminure"] = undefined;

    // Detect enluminure first - these will be SKIPPED (not uploaded to Substack)
    // because Substack doesn't support text wrapping around images
    const enluminureInfo = this.detectEnluminure(markdown);

    // Process each local image
    for (const ref of localImages) {
      // Check if this is an enluminure image - skip it entirely
      const isEnluminure =
        enluminureInfo && ref.fullMatch === enluminureInfo.imageRef.fullMatch;

      if (isEnluminure) {
        // Remove enluminure from markdown without uploading
        // (Substack doesn't support the drop-cap/float layout)
        processedMarkdown = processedMarkdown.replace(ref.fullMatch, "");
        this.logger.info(
          `Skipping enluminure (not supported on Substack): ${ref.path}`
        );
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

      const result = await this.uploadImage(publication, vaultPath);

      if (result.success && result.url) {
        // Replace the path in markdown with CDN URL
        const newImageMarkdown = ref.title
          ? `![${ref.alt}](${result.url} "${ref.title}")`
          : `![${ref.alt}](${result.url})`;

        processedMarkdown = processedMarkdown.replace(
          ref.fullMatch,
          newImageMarkdown
        );

        uploadedImages.push({
          originalPath: ref.path,
          cdnUrl: result.url
        });

        this.logger.info(`Uploaded image: ${ref.path} -> ${result.url}`);
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
      errors
    };
  }
}
