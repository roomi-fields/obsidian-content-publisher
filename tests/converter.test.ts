import { describe, it, expect } from "vitest";
import { MarkdownConverter } from "../src/substack/converter";

describe("MarkdownConverter", () => {
  const converter = new MarkdownConverter();

  describe("convert", () => {
    it("should return empty content for empty markdown", () => {
      const result = converter.convert("");
      expect(result).toEqual({ type: "doc", content: [] });
    });

    it("should return empty content for whitespace-only markdown", () => {
      const result = converter.convert("   \n\n   ");
      expect(result).toEqual({ type: "doc", content: [] });
    });
  });

  describe("paragraphs", () => {
    it("should convert simple paragraph", () => {
      const result = converter.convert("Hello world");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: "paragraph",
        content: [{ type: "text", text: "Hello world" }]
      });
    });

    it("should handle multiple paragraphs", () => {
      const result = converter.convert("First paragraph\n\nSecond paragraph");
      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toMatchObject({ type: "paragraph" });
      expect(result.content[1]).toMatchObject({ type: "paragraph" });
    });

    it("should preserve line breaks within paragraphs with hardBreak", () => {
      const result = converter.convert("Line one\nLine two");
      expect(result.content).toHaveLength(1);
      const paragraph = result.content[0];
      expect(paragraph).toMatchObject({ type: "paragraph" });
      if (paragraph && "content" in paragraph) {
        expect(paragraph.content).toContainEqual({ type: "hardBreak" });
      }
    });
  });

  describe("headers", () => {
    it("should convert h1 header", () => {
      const result = converter.convert("# Title");
      expect(result.content[0]).toMatchObject({
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Title" }]
      });
    });

    it("should convert h2-h6 headers", () => {
      for (let level = 2; level <= 6; level++) {
        const markdown = "#".repeat(level) + " Header " + level;
        const result = converter.convert(markdown);
        expect(result.content[0]).toMatchObject({
          type: "heading",
          attrs: { level },
          content: [{ type: "text", text: `Header ${level}` }]
        });
      }
    });

    it("should require space after hash marks", () => {
      // Without space, the line is not recognized as a header
      // and is skipped (starts with # but doesn't match header pattern)
      const result = converter.convert("#NoSpace");
      expect(result.content).toHaveLength(0);
    });
  });

  describe("inline formatting", () => {
    it("should convert bold text", () => {
      const result = converter.convert("This is **bold** text");
      const paragraph = result.content[0];
      if (paragraph && "content" in paragraph) {
        const boldElement = paragraph.content.find(
          (el: { type: string; marks?: Array<{ type: string }> }) =>
            el.marks?.some((m: { type: string }) => m.type === "strong")
        );
        expect(boldElement).toMatchObject({
          type: "text",
          text: "bold",
          marks: [{ type: "strong" }]
        });
      }
    });

    it("should convert italic text", () => {
      const result = converter.convert("This is *italic* text");
      const paragraph = result.content[0];
      if (paragraph && "content" in paragraph) {
        const italicElement = paragraph.content.find(
          (el: { type: string; marks?: Array<{ type: string }> }) =>
            el.marks?.some((m: { type: string }) => m.type === "em")
        );
        expect(italicElement).toMatchObject({
          type: "text",
          text: "italic",
          marks: [{ type: "em" }]
        });
      }
    });

    it("should convert bold italic text", () => {
      const result = converter.convert("This is ***bold italic*** text");
      const paragraph = result.content[0];
      if (paragraph && "content" in paragraph) {
        const element = paragraph.content.find(
          (el: { type: string; marks?: Array<{ type: string }> }) =>
            el.marks?.length === 2
        );
        expect(element).toMatchObject({
          type: "text",
          text: "bold italic",
          marks: expect.arrayContaining([{ type: "strong" }, { type: "em" }])
        });
      }
    });

    it("should convert inline code", () => {
      const result = converter.convert("Use `code` here");
      const paragraph = result.content[0];
      if (paragraph && "content" in paragraph) {
        const codeElement = paragraph.content.find(
          (el: { type: string; marks?: Array<{ type: string }> }) =>
            el.marks?.some((m: { type: string }) => m.type === "code")
        );
        expect(codeElement).toMatchObject({
          type: "text",
          text: "code",
          marks: [{ type: "code" }]
        });
      }
    });

    it("should convert links", () => {
      const result = converter.convert("Click [here](https://example.com)");
      const paragraph = result.content[0];
      if (paragraph && "content" in paragraph) {
        const linkElement = paragraph.content.find(
          (el: { type: string; marks?: Array<{ type: string }> }) =>
            el.marks?.some((m: { type: string }) => m.type === "link")
        );
        expect(linkElement).toMatchObject({
          type: "text",
          text: "here",
          marks: [{ type: "link", attrs: { href: "https://example.com" } }]
        });
      }
    });

    it("should handle escaped asterisks", () => {
      const result = converter.convert("Use \\* for asterisk");
      const paragraph = result.content[0];
      if (paragraph && "content" in paragraph) {
        const textContent = paragraph.content
          .filter((el: { type: string }) => el.type === "text")
          .map((el: { type: string; text?: string }) => el.text)
          .join("");
        expect(textContent).toContain("*");
      }
    });
  });

  describe("code blocks", () => {
    it("should convert code block without language", () => {
      const result = converter.convert("```\nconst x = 1;\n```");
      expect(result.content[0]).toMatchObject({
        type: "codeBlock",
        content: [{ type: "text", text: "const x = 1;" }]
      });
    });

    it("should convert code block with language", () => {
      const result = converter.convert("```javascript\nconst x = 1;\n```");
      expect(result.content[0]).toMatchObject({
        type: "codeBlock",
        attrs: { language: "javascript" },
        content: [{ type: "text", text: "const x = 1;" }]
      });
    });

    it("should preserve multiline code", () => {
      const result = converter.convert("```\nline 1\nline 2\nline 3\n```");
      const codeBlock = result.content[0];
      if (codeBlock && "content" in codeBlock) {
        expect(codeBlock.content[0]).toMatchObject({
          type: "text",
          text: "line 1\nline 2\nline 3"
        });
      }
    });
  });

  describe("lists", () => {
    it("should convert unordered list with asterisk", () => {
      const result = converter.convert("* Item 1\n* Item 2");
      expect(result.content[0]).toMatchObject({
        type: "bulletList"
      });
      const list = result.content[0];
      if (list && "content" in list) {
        expect(list.content).toHaveLength(2);
      }
    });

    it("should convert unordered list with dash", () => {
      const result = converter.convert("- Item 1\n- Item 2");
      expect(result.content[0]).toMatchObject({
        type: "bulletList"
      });
    });

    it("should convert ordered list", () => {
      const result = converter.convert("1. First\n2. Second\n3. Third");
      expect(result.content[0]).toMatchObject({
        type: "orderedList"
      });
      const list = result.content[0];
      if (list && "content" in list) {
        expect(list.content).toHaveLength(3);
      }
    });

    it("should handle inline formatting in list items", () => {
      const result = converter.convert("* **Bold** item\n* *Italic* item");
      const list = result.content[0];
      if (list && "content" in list) {
        const firstItem = list.content[0];
        if (firstItem && "content" in firstItem) {
          const paragraph = firstItem.content[0];
          if (paragraph && "content" in paragraph) {
            const boldElement = paragraph.content.find(
              (el: { type: string; marks?: Array<{ type: string }> }) =>
                el.marks?.some((m: { type: string }) => m.type === "strong")
            );
            expect(boldElement).toBeDefined();
          }
        }
      }
    });
  });

  describe("blockquotes", () => {
    it("should convert simple blockquote", () => {
      const result = converter.convert("> This is a quote");
      expect(result.content[0]).toMatchObject({
        type: "blockquote"
      });
    });

    it("should merge multiline blockquotes", () => {
      const result = converter.convert("> Line one\n> Line two");
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: "blockquote"
      });
    });
  });

  describe("images", () => {
    it("should convert image", () => {
      const result = converter.convert("![Alt text](https://example.com/image.png)");
      expect(result.content[0]).toMatchObject({
        type: "image2",
        attrs: {
          src: "https://example.com/image.png",
          alt: "Alt text",
          fullscreen: false
        }
      });
    });

    it("should handle image with title", () => {
      const result = converter.convert('![Alt](https://example.com/img.png "Title")');
      expect(result.content[0]).toMatchObject({
        type: "image2",
        attrs: {
          src: "https://example.com/img.png",
          alt: "Alt",
          title: "Title"
        }
      });
    });
  });

  describe("horizontal rules", () => {
    it("should convert horizontal rule with dashes", () => {
      const result = converter.convert("---");
      expect(result.content[0]).toMatchObject({
        type: "horizontal_rule"
      });
    });

    it("should convert horizontal rule with asterisks", () => {
      const result = converter.convert("***");
      expect(result.content[0]).toMatchObject({
        type: "horizontal_rule"
      });
    });

    it("should convert horizontal rule with underscores", () => {
      const result = converter.convert("___");
      expect(result.content[0]).toMatchObject({
        type: "horizontal_rule"
      });
    });
  });

  describe("complex documents", () => {
    it("should handle mixed content", () => {
      const markdown = `# Title

This is a paragraph with **bold** and *italic*.

## Section

- Item 1
- Item 2

> A quote

\`\`\`js
code();
\`\`\`
`;
      const result = converter.convert(markdown);

      const types = result.content.map((block) => block.type);
      expect(types).toContain("heading");
      expect(types).toContain("paragraph");
      expect(types).toContain("bulletList");
      expect(types).toContain("blockquote");
      expect(types).toContain("codeBlock");
    });
  });
});
