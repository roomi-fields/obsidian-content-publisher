import { TFile, Vault } from "obsidian";
import { LinkedInAPI } from "./api";
import { LinkedInImageReference, LinkedInImageProcessingResult } from "./types";
import { ILogger } from "../utils/logger";

// Supported image formats for LinkedIn
const SUPPORTED_EXTENSIONS = ["png", "jpg", "jpeg", "gif"];
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB for LinkedIn

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif"
};

/**
 * Handles image processing and upload to LinkedIn
 */
export class LinkedInImageHandler {
  private api: LinkedInAPI;
  private vault: Vault;
  private logger: ILogger;

  constructor(api: LinkedInAPI, vault: Vault, logger: ILogger) {
    this.api = api;
    this.vault = vault;
    this.logger = logger;
  }

  /**
   * Parse all image references from markdown content
   * Matches: ![alt](path) or ![alt](path "title") or ![[path]] or ![[path|size]]
   */
  parseImageReferences(markdown: string): LinkedInImageReference[] {
    const references: LinkedInImageReference[] = [];

    // Standard markdown image syntax: ![alt](path) or ![alt](path "title")
    const standardRegex = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]+)")?\)/g;
    let match;
    while ((match = standardRegex.exec(markdown)) !== null) {
      const path = match[2] ?? "";
      if (path) {
        const ref: LinkedInImageReference = {
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
        const ref: LinkedInImageReference = {
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
   */
  resolveImagePath(imagePath: string, basePath: string): string {
    // Handle absolute paths (starting with /)
    if (imagePath.startsWith("/")) {
      return imagePath.substring(1); // Remove leading slash for vault path
    }

    // Handle relative paths
    const normalizedImage = imagePath.replace(/\\/g, "/");
    const normalizedBase = basePath.replace(/\\/g, "/");

    const baseParts = normalizedBase.split("/").filter((p) => p);
    const imageParts = normalizedImage.split("/");

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
   */
  resolveWikiLinkPath(wikiPath: string, _basePath: string): string {
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
   * Upload a single image to LinkedIn
   */
  async uploadImage(
    vaultPath: string
  ): Promise<{ success: boolean; asset?: string; error?: string }> {
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
        error: `File too large: ${(file.stat.size / 1024 / 1024).toFixed(1)} MB (max: 8 MB)`
      };
    }

    // Read file binary
    const imageData = await this.vault.readBinary(file);

    // Get MIME type
    const mimeType = MIME_TYPES[extension] || "application/octet-stream";

    // Step 1: Register the upload
    const registerResult = await this.api.registerImageUpload();
    if (!registerResult.success || !registerResult.data) {
      return {
        success: false,
        error: registerResult.error || "Failed to register upload"
      };
    }

    const uploadUrl =
      registerResult.data.value.uploadMechanism[
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
      ].uploadUrl;
    const asset = registerResult.data.value.asset;

    // Step 2: Upload the image
    const uploadResult = await this.api.uploadImage(uploadUrl, imageData, mimeType);
    if (!uploadResult.success) {
      return {
        success: false,
        error: uploadResult.error || "Failed to upload image"
      };
    }

    return { success: true, asset };
  }

  /**
   * Process the first image in markdown as featured image for LinkedIn
   * LinkedIn posts typically only support one image
   */
  async processFeaturedImage(
    markdown: string,
    basePath: string
  ): Promise<LinkedInImageProcessingResult> {
    const references = this.parseImageReferences(markdown);
    const localImages = references.filter((ref) => ref.isLocal);

    const uploadedImages: LinkedInImageProcessingResult["uploadedImages"] = [];
    const errors: LinkedInImageProcessingResult["errors"] = [];
    let featuredImage: LinkedInImageProcessingResult["featuredImage"] = undefined;
    let processedContent = markdown;

    // Only process the first local image as the featured image
    if (localImages.length > 0) {
      const firstImage = localImages[0];
      if (firstImage) {
        // Resolve path
        let vaultPath: string;
        if (firstImage.isWikiLink) {
          vaultPath = this.resolveWikiLinkPath(firstImage.path, basePath);
        } else {
          vaultPath = this.resolveImagePath(firstImage.path, basePath);
        }

        this.logger.debug(`Processing featured image: ${firstImage.path} -> ${vaultPath}`);

        const result = await this.uploadImage(vaultPath);

        if (result.success && result.asset) {
          featuredImage = {
            asset: result.asset,
            originalPath: firstImage.path
          };

          uploadedImages.push({
            originalPath: firstImage.path,
            linkedinAsset: result.asset
          });

          // Remove the image from content (LinkedIn will display it separately)
          processedContent = processedContent.replace(firstImage.fullMatch, "");

          this.logger.info(`Uploaded featured image: ${firstImage.path}`);
        } else {
          errors.push({
            path: firstImage.path,
            error: result.error || "Unknown error"
          });

          this.logger.warn(
            `Failed to upload featured image: ${firstImage.path} - ${result.error}`
          );
        }
      }
    }

    // Remove all other images from content (LinkedIn text posts don't support inline images)
    for (const ref of references) {
      if (ref !== localImages[0]) {
        processedContent = processedContent.replace(ref.fullMatch, "");
      }
    }

    // Clean up any leftover empty lines
    processedContent = processedContent.replace(/\n{3,}/g, "\n\n").trim();

    return {
      processedContent,
      uploadedImages,
      errors,
      featuredImage
    };
  }
}
