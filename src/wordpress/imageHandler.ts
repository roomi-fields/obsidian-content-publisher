import { TFile, Vault } from "obsidian";
import { WordPressAPI } from "./api";
import {
  WordPressImageReference,
  WordPressImageProcessingResult,
  WordPressEnluminureInfo
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
 * Handles image processing and upload to WordPress media library
 */
export class WordPressImageHandler {
  private api: WordPressAPI;
  private vault: Vault;
  private logger: ILogger;

  constructor(api: WordPressAPI, vault: Vault, logger: ILogger) {
    this.api = api;
    this.vault = vault;
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
