import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImageHandler } from "../src/substack/imageHandler";
import { SubstackAPI } from "../src/substack/api";
import { Vault, TFile } from "obsidian";

// Mock TFile class for creating test instances
class MockTFile {
  path: string;
  name: string;
  stat: { size: number };
  constructor(path: string, name: string, size: number) {
    this.path = path;
    this.name = name;
    this.stat = { size };
  }
}

// Mock obsidian module - TFile class defined inline to avoid hoisting issues
vi.mock("obsidian", () => {
  return {
    requestUrl: vi.fn(),
    TFile: class {
      path: string = "";
      name: string = "";
      stat: { size: number } = { size: 0 };
    },
  };
});

// Helper to create mock TFile instances that pass instanceof checks
function createMockFile(path: string, name: string, size: number): TFile {
  const file = new MockTFile(path, name, size);
  // Set the prototype to make instanceof TFile work
  Object.setPrototypeOf(file, TFile.prototype);
  return file as unknown as TFile;
}

// Mock Logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  setDevMode: vi.fn(),
  setApp: vi.fn(),
  time: vi.fn(),
  timeEnd: vi.fn(),
  group: vi.fn(),
  groupEnd: vi.fn(),
  table: vi.fn(),
  logPluginLoad: vi.fn(),
  logPluginUnload: vi.fn(),
  logCommandExecution: vi.fn(),
  logSettingsChange: vi.fn(),
  setLogLevel: vi.fn(),
};

// Mock Vault
const createMockVault = () => ({
  getAbstractFileByPath: vi.fn(),
  readBinary: vi.fn(),
});

// Mock API
const createMockApi = () => ({
  uploadImage: vi.fn(),
});

describe("ImageHandler", () => {
  let imageHandler: ImageHandler;
  let mockVault: ReturnType<typeof createMockVault>;
  let mockApi: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockVault = createMockVault();
    mockApi = createMockApi();
    imageHandler = new ImageHandler(
      mockApi as unknown as SubstackAPI,
      mockVault as unknown as Vault,
      mockLogger,
    );
  });

  describe("parseImageReferences", () => {
    it("should extract simple image references", () => {
      const markdown = "![alt text](image.png)";
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        fullMatch: "![alt text](image.png)",
        alt: "alt text",
        path: "image.png",
        isLocal: true,
      });
    });

    it("should extract image references with title", () => {
      const markdown = '![alt](image.png "Image Title")';
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        fullMatch: '![alt](image.png "Image Title")',
        alt: "alt",
        path: "image.png",
        title: "Image Title",
        isLocal: true,
      });
    });

    it("should extract multiple image references", () => {
      const markdown = `
# My Post

![first](img1.png)

Some text here

![second](img2.jpg "Caption")

More text
      `;
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(2);
      expect(refs[0]?.path).toBe("img1.png");
      expect(refs[1]?.path).toBe("img2.jpg");
    });

    it("should mark HTTP URLs as non-local", () => {
      const markdown = "![alt](http://example.com/image.png)";
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(1);
      expect(refs[0]?.isLocal).toBe(false);
    });

    it("should mark HTTPS URLs as non-local", () => {
      const markdown = "![alt](https://example.com/image.png)";
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(1);
      expect(refs[0]?.isLocal).toBe(false);
    });

    it("should mark data URLs as non-local", () => {
      const markdown = "![alt](data:image/png;base64,iVBORw...)";
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(1);
      expect(refs[0]?.isLocal).toBe(false);
    });

    it("should handle empty alt text", () => {
      const markdown = "![](image.png)";
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(1);
      expect(refs[0]?.alt).toBe("");
    });

    it("should handle relative paths", () => {
      const markdown = "![alt](./images/photo.png)";
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(1);
      expect(refs[0]?.path).toBe("./images/photo.png");
      expect(refs[0]?.isLocal).toBe(true);
    });

    it("should handle parent directory references", () => {
      const markdown = "![alt](../assets/image.jpg)";
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(1);
      expect(refs[0]?.path).toBe("../assets/image.jpg");
      expect(refs[0]?.isLocal).toBe(true);
    });

    it("should handle absolute vault paths", () => {
      const markdown = "![alt](/attachments/image.png)";
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(1);
      expect(refs[0]?.path).toBe("/attachments/image.png");
      expect(refs[0]?.isLocal).toBe(true);
    });

    it("should return empty array for markdown without images", () => {
      const markdown = "# Just a heading\n\nSome text without images.";
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(0);
    });
  });

  describe("resolveImagePath", () => {
    it("should resolve simple filename in same directory", () => {
      const result = imageHandler.resolveImagePath("image.png", "notes/folder");
      expect(result).toBe("notes/folder/image.png");
    });

    it("should resolve relative path with ./", () => {
      const result = imageHandler.resolveImagePath(
        "./images/photo.png",
        "notes",
      );
      expect(result).toBe("notes/images/photo.png");
    });

    it("should resolve parent directory references", () => {
      const result = imageHandler.resolveImagePath(
        "../assets/image.png",
        "notes/subfolder",
      );
      expect(result).toBe("notes/assets/image.png");
    });

    it("should resolve multiple parent directory references", () => {
      const result = imageHandler.resolveImagePath(
        "../../shared/image.png",
        "notes/deep/folder",
      );
      expect(result).toBe("notes/shared/image.png");
    });

    it("should resolve absolute paths (starting with /)", () => {
      const result = imageHandler.resolveImagePath(
        "/attachments/image.png",
        "notes/folder",
      );
      expect(result).toBe("attachments/image.png");
    });

    it("should handle empty base path", () => {
      const result = imageHandler.resolveImagePath("image.png", "");
      expect(result).toBe("image.png");
    });

    it("should normalize Windows-style backslashes", () => {
      const result = imageHandler.resolveImagePath(
        "images\\photo.png",
        "notes\\folder",
      );
      expect(result).toBe("notes/folder/images/photo.png");
    });
  });

  describe("uploadImage", () => {
    it("should return error if file not found", async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);

      const result = await imageHandler.uploadImage("mypub", "nonexistent.png");

      expect(result.success).toBe(false);
      expect(result.error).toContain("File not found");
    });

    it("should return error for unsupported format", async () => {
      // Use MockTFile constructor so instanceof check passes
      const mockFile = createMockFile("document.pdf", "document.pdf", 1000);
      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);

      const result = await imageHandler.uploadImage("mypub", "document.pdf");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported format");
    });

    it("should return error for file over 10MB", async () => {
      const mockFile = createMockFile(
        "large.png",
        "large.png",
        15 * 1024 * 1024,
      );
      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);

      const result = await imageHandler.uploadImage("mypub", "large.png");

      expect(result.success).toBe(false);
      expect(result.error).toContain("File too large");
    });

    it("should upload image and return CDN URL on success", async () => {
      const mockFile = createMockFile("photo.png", "photo.png", 5000);
      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.readBinary.mockResolvedValue(new ArrayBuffer(5000));
      mockApi.uploadImage.mockResolvedValue({
        success: true,
        data: {
          id: "img-123",
          url: "https://substackcdn.com/image/fetch/photo.png",
          contentType: "image/png",
          bytes: 5000,
          imageWidth: 800,
          imageHeight: 600,
        },
      });

      const result = await imageHandler.uploadImage("mypub", "photo.png");

      expect(result.success).toBe(true);
      expect(result.url).toBe("https://substackcdn.com/image/fetch/photo.png");
      expect(mockApi.uploadImage).toHaveBeenCalledWith(
        "mypub",
        expect.any(ArrayBuffer),
        "photo.png",
        "image/png",
      );
    });

    it("should return error on upload failure", async () => {
      const mockFile = createMockFile("photo.jpg", "photo.jpg", 5000);
      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.readBinary.mockResolvedValue(new ArrayBuffer(5000));
      mockApi.uploadImage.mockResolvedValue({
        success: false,
        error: "Upload failed: 500 - Server error",
      });

      const result = await imageHandler.uploadImage("mypub", "photo.jpg");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Upload failed");
    });

    it("should use correct MIME type for JPEG", async () => {
      const mockFile = createMockFile("photo.jpeg", "photo.jpeg", 5000);
      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.readBinary.mockResolvedValue(new ArrayBuffer(5000));
      mockApi.uploadImage.mockResolvedValue({
        success: true,
        data: { url: "https://cdn.com/photo.jpeg" },
      });

      await imageHandler.uploadImage("mypub", "photo.jpeg");

      expect(mockApi.uploadImage).toHaveBeenCalledWith(
        "mypub",
        expect.any(ArrayBuffer),
        "photo.jpeg",
        "image/jpeg",
      );
    });

    it("should use correct MIME type for GIF", async () => {
      const mockFile = createMockFile("anim.gif", "anim.gif", 5000);
      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.readBinary.mockResolvedValue(new ArrayBuffer(5000));
      mockApi.uploadImage.mockResolvedValue({
        success: true,
        data: { url: "https://cdn.com/anim.gif" },
      });

      await imageHandler.uploadImage("mypub", "anim.gif");

      expect(mockApi.uploadImage).toHaveBeenCalledWith(
        "mypub",
        expect.any(ArrayBuffer),
        "anim.gif",
        "image/gif",
      );
    });

    it("should use correct MIME type for WebP", async () => {
      const mockFile = createMockFile("image.webp", "image.webp", 5000);
      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.readBinary.mockResolvedValue(new ArrayBuffer(5000));
      mockApi.uploadImage.mockResolvedValue({
        success: true,
        data: { url: "https://cdn.com/image.webp" },
      });

      await imageHandler.uploadImage("mypub", "image.webp");

      expect(mockApi.uploadImage).toHaveBeenCalledWith(
        "mypub",
        expect.any(ArrayBuffer),
        "image.webp",
        "image/webp",
      );
    });
  });

  describe("processMarkdownImages", () => {
    it("should leave web URLs unchanged", async () => {
      const markdown = "![alt](https://example.com/image.png)\n\nSome text";

      const result = await imageHandler.processMarkdownImages(
        "mypub",
        markdown,
        "",
      );

      expect(result.processedMarkdown).toBe(markdown);
      expect(result.uploadedImages).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should replace local image paths with CDN URLs", async () => {
      const markdown = "![photo](images/photo.png)\n\nSome text";
      const mockFile = createMockFile("images/photo.png", "photo.png", 5000);

      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.readBinary.mockResolvedValue(new ArrayBuffer(5000));
      mockApi.uploadImage.mockResolvedValue({
        success: true,
        data: { url: "https://substackcdn.com/photo.png" },
      });

      const result = await imageHandler.processMarkdownImages(
        "mypub",
        markdown,
        "",
      );

      expect(result.processedMarkdown).toBe(
        "![photo](https://substackcdn.com/photo.png)\n\nSome text",
      );
      expect(result.uploadedImages).toHaveLength(1);
      expect(result.uploadedImages[0]).toEqual({
        originalPath: "images/photo.png",
        cdnUrl: "https://substackcdn.com/photo.png",
      });
    });

    it("should preserve image titles in markdown", async () => {
      const markdown = '![photo](photo.png "My Caption")';
      const mockFile = createMockFile("photo.png", "photo.png", 5000);

      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.readBinary.mockResolvedValue(new ArrayBuffer(5000));
      mockApi.uploadImage.mockResolvedValue({
        success: true,
        data: { url: "https://cdn.com/photo.png" },
      });

      const result = await imageHandler.processMarkdownImages(
        "mypub",
        markdown,
        "",
      );

      expect(result.processedMarkdown).toBe(
        '![photo](https://cdn.com/photo.png "My Caption")',
      );
    });

    it("should handle multiple images", async () => {
      const markdown = "![img1](a.png)\n![img2](b.png)";
      const mockFileA = createMockFile("a.png", "a.png", 1000);
      const mockFileB = createMockFile("b.png", "b.png", 2000);

      mockVault.getAbstractFileByPath
        .mockReturnValueOnce(mockFileA)
        .mockReturnValueOnce(mockFileB);
      mockVault.readBinary.mockResolvedValue(new ArrayBuffer(1000));
      mockApi.uploadImage
        .mockResolvedValueOnce({
          success: true,
          data: { url: "https://cdn.com/a.png" },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { url: "https://cdn.com/b.png" },
        });

      const result = await imageHandler.processMarkdownImages(
        "mypub",
        markdown,
        "",
      );

      expect(result.uploadedImages).toHaveLength(2);
      expect(result.processedMarkdown).toContain("https://cdn.com/a.png");
      expect(result.processedMarkdown).toContain("https://cdn.com/b.png");
    });

    it("should collect errors for failed uploads", async () => {
      const markdown = "![img](missing.png)";
      mockVault.getAbstractFileByPath.mockReturnValue(null);

      const result = await imageHandler.processMarkdownImages(
        "mypub",
        markdown,
        "",
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.path).toBe("missing.png");
      expect(result.errors[0]?.error).toContain("File not found");
    });

    it("should continue processing after failed upload", async () => {
      const markdown = "![img1](missing.png)\n![img2](exists.png)";
      const mockFile = createMockFile("exists.png", "exists.png", 1000);

      mockVault.getAbstractFileByPath
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(mockFile);
      mockVault.readBinary.mockResolvedValue(new ArrayBuffer(1000));
      mockApi.uploadImage.mockResolvedValue({
        success: true,
        data: { url: "https://cdn.com/exists.png" },
      });

      const result = await imageHandler.processMarkdownImages(
        "mypub",
        markdown,
        "",
      );

      expect(result.errors).toHaveLength(1);
      expect(result.uploadedImages).toHaveLength(1);
      expect(result.processedMarkdown).toContain("https://cdn.com/exists.png");
    });

    it("should resolve paths relative to base path", async () => {
      const markdown = "![photo](../images/photo.png)";
      const mockFile = createMockFile("images/photo.png", "photo.png", 5000);

      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.readBinary.mockResolvedValue(new ArrayBuffer(5000));
      mockApi.uploadImage.mockResolvedValue({
        success: true,
        data: { url: "https://cdn.com/photo.png" },
      });

      await imageHandler.processMarkdownImages(
        "mypub",
        markdown,
        "notes/subfolder",
      );

      expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(
        "notes/images/photo.png",
      );
    });

    it("should log upload progress", async () => {
      const markdown = "![photo](photo.png)";
      const mockFile = createMockFile("photo.png", "photo.png", 5000);

      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.readBinary.mockResolvedValue(new ArrayBuffer(5000));
      mockApi.uploadImage.mockResolvedValue({
        success: true,
        data: { url: "https://cdn.com/photo.png" },
      });

      await imageHandler.processMarkdownImages("mypub", markdown, "");

      expect(mockLogger.debug).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it("should log warnings for failed uploads", async () => {
      const markdown = "![photo](missing.png)";
      mockVault.getAbstractFileByPath.mockReturnValue(null);

      await imageHandler.processMarkdownImages("mypub", markdown, "");

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe("parseImageReferences - Obsidian wikilinks", () => {
    it("should extract wikilink image references", () => {
      const markdown = "![[image.png]]";
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        fullMatch: "![[image.png]]",
        alt: "",
        path: "image.png",
        isLocal: true,
        isWikiLink: true,
        wikiLinkSize: undefined,
      });
    });

    it("should extract wikilink with size", () => {
      const markdown = "![[image.png|150]]";
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        fullMatch: "![[image.png|150]]",
        alt: "",
        path: "image.png",
        isLocal: true,
        isWikiLink: true,
        wikiLinkSize: 150,
      });
    });

    it("should extract wikilink with alt text", () => {
      const markdown = "![[image.png|my alt text]]";
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        fullMatch: "![[image.png|my alt text]]",
        alt: "my alt text",
        path: "image.png",
        isLocal: true,
        isWikiLink: true,
        wikiLinkSize: undefined,
      });
    });

    it("should extract wikilink with full path", () => {
      const markdown = "![[_Assets/Enluminures/image.png|150]]";
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(1);
      expect(refs[0]?.path).toBe("_Assets/Enluminures/image.png");
      expect(refs[0]?.wikiLinkSize).toBe(150);
    });

    it("should extract both standard and wikilink images", () => {
      const markdown =
        "![standard](photo.jpg)\n\n![[wikilink.png|200]]";
      const refs = imageHandler.parseImageReferences(markdown);

      expect(refs).toHaveLength(2);
      expect(refs[0]?.isWikiLink).toBeUndefined();
      expect(refs[1]?.isWikiLink).toBe(true);
    });
  });

  describe("detectEnluminure", () => {
    it("should detect enluminure wikilink at start of content", () => {
      const markdown = "![[_Assets/Enluminures/enluminure-2025.png|150]]\n\nSome text";
      const result = imageHandler.detectEnluminure(markdown);

      expect(result).not.toBeNull();
      expect(result?.imageRef.path).toBe("_Assets/Enluminures/enluminure-2025.png");
      expect(result?.imageRef.wikiLinkSize).toBe(150);
      expect(result?.lineIndex).toBe(0);
    });

    it("should detect enluminure standard markdown at start", () => {
      const markdown = "![](path/to/enluminure.png)\n\nSome text";
      const result = imageHandler.detectEnluminure(markdown);

      expect(result).not.toBeNull();
      expect(result?.imageRef.path).toBe("path/to/enluminure.png");
    });

    it("should not detect non-enluminure image", () => {
      const markdown = "![](regular-image.png)\n\nSome text";
      const result = imageHandler.detectEnluminure(markdown);

      expect(result).toBeNull();
    });

    it("should skip empty lines before enluminure", () => {
      const markdown = "\n\n![[enluminure.png|100]]\n\nText";
      const result = imageHandler.detectEnluminure(markdown);

      expect(result).not.toBeNull();
      expect(result?.lineIndex).toBe(2);
    });

    it("should not detect enluminure after text", () => {
      const markdown = "Some text first\n\n![[enluminure.png]]";
      const result = imageHandler.detectEnluminure(markdown);

      expect(result).toBeNull();
    });

    it("should be case-insensitive for enluminure detection", () => {
      const markdown = "![[_Assets/ENLUMINURE-test.png]]";
      const result = imageHandler.detectEnluminure(markdown);

      expect(result).not.toBeNull();
    });
  });

  describe("processMarkdownImages with enluminure", () => {
    it("should skip enluminure and not upload it", async () => {
      const markdown = "![[enluminure.png|150]]\n\nSome text";

      // No mock file needed - enluminure should be skipped without upload
      const result = await imageHandler.processMarkdownImages(
        "mypub",
        markdown,
        "",
      );

      // Enluminure should be removed from markdown
      expect(result.processedMarkdown).not.toContain("enluminure.png");
      expect(result.processedMarkdown.trim()).toBe("Some text");
      // Upload should not have been called for enluminure
      expect(mockApi.uploadImage).not.toHaveBeenCalled();
    });

    it("should remove enluminure from processed markdown without uploading", async () => {
      const markdown = "![[enluminure.png]]\n\nSome text";

      const result = await imageHandler.processMarkdownImages(
        "mypub",
        markdown,
        "",
      );

      expect(result.processedMarkdown).not.toContain("enluminure.png");
      expect(result.processedMarkdown.trim()).toBe("Some text");
    });

    it("should handle wikilink images without enluminure", async () => {
      const markdown = "![[regular-image.png|200]]\n\nSome text";
      const mockFile = createMockFile(
        "regular-image.png",
        "regular-image.png",
        5000,
      );

      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.readBinary.mockResolvedValue(new ArrayBuffer(5000));
      mockApi.uploadImage.mockResolvedValue({
        success: true,
        data: { url: "https://cdn.com/regular-image.png" },
      });

      const result = await imageHandler.processMarkdownImages(
        "mypub",
        markdown,
        "",
      );

      expect(result.processedMarkdown).toContain("https://cdn.com/regular-image.png");
    });
  });
});
