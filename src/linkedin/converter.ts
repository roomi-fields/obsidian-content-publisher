/**
 * Markdown to LinkedIn text converter
 *
 * LinkedIn supports limited formatting in posts:
 * - Plain text with line breaks
 * - Hashtags (#hashtag)
 * - Mentions (@person)
 * - URLs (auto-linked)
 *
 * This converter strips markdown formatting and preserves readable text.
 */

export class LinkedInMarkdownConverter {
  /**
   * Convert markdown to LinkedIn-compatible plain text
   * Preserves structure while removing markdown syntax
   */
  convert(markdown: string): string {
    let text = markdown;

    // Remove frontmatter if present
    text = this.removeFrontmatter(text);

    // Remove images (already handled separately)
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");
    text = text.replace(/!\[\[([^\]]+)\]\]/g, "");

    // Convert headers to bold-like emphasis (uppercase or with line breaks)
    text = text.replace(/^#{1,6}\s+(.+)$/gm, "\n$1\n");

    // Convert bold to uppercase or keep as-is (LinkedIn doesn't support bold)
    text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
    text = text.replace(/__([^_]+)__/g, "$1");

    // Remove italic markers
    text = text.replace(/\*([^*]+)\*/g, "$1");
    text = text.replace(/_([^_]+)_/g, "$1");

    // Convert inline code to quoted text
    text = text.replace(/`([^`]+)`/g, '"$1"');

    // Remove code blocks but keep content
    text = text.replace(/```[\s\S]*?```/g, (match) => {
      const content = match.replace(/```\w*\n?/, "").replace(/\n?```$/, "");
      return `\n${  content  }\n`;
    });

    // Convert links to text with URL
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

    // Convert wikilinks to plain text
    text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, link, display) => {
      return display || link;
    });

    // Convert blockquotes to indented text
    text = text.replace(/^>\s*(.+)$/gm, "« $1 »");

    // Convert unordered lists
    text = text.replace(/^[-*+]\s+(.+)$/gm, "• $1");

    // Convert ordered lists (preserve numbers)
    text = text.replace(/^(\d+)\.\s+(.+)$/gm, "$1. $2");

    // Convert horizontal rules to line breaks
    text = text.replace(/^[-*_]{3,}$/gm, "\n---\n");

    // Clean up multiple line breaks
    text = text.replace(/\n{3,}/g, "\n\n");

    // Trim whitespace
    text = text.trim();

    return text;
  }

  /**
   * Remove YAML frontmatter from markdown
   */
  private removeFrontmatter(markdown: string): string {
    const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
    return markdown.replace(frontmatterRegex, "");
  }

  /**
   * Extract hashtags from markdown content or tags array
   */
  extractHashtags(markdown: string, tags?: string[]): string[] {
    const hashtags: Set<string> = new Set();

    // Add tags from frontmatter/array
    if (tags) {
      for (const tag of tags) {
        const cleaned = tag.replace(/[^a-zA-Z0-9À-ÿ]/g, "");
        if (cleaned) {
          hashtags.add(`#${cleaned}`);
        }
      }
    }

    // Find existing hashtags in content
    const hashtagRegex = /#([a-zA-Z0-9À-ÿ_]+)/g;
    let match;
    while ((match = hashtagRegex.exec(markdown)) !== null) {
      if (match[1]) {
        hashtags.add(`#${match[1]}`);
      }
    }

    return Array.from(hashtags);
  }

  /**
   * Append hashtags to content if not already present
   */
  appendHashtags(content: string, hashtags: string[]): string {
    if (hashtags.length === 0) {
      return content;
    }

    // Check which hashtags are not already in the content
    const missingHashtags = hashtags.filter(
      (tag) => !content.toLowerCase().includes(tag.toLowerCase())
    );

    if (missingHashtags.length === 0) {
      return content;
    }

    return `${content  }\n\n${  missingHashtags.join(" ")}`;
  }

  /**
   * Truncate content to LinkedIn's character limit
   * LinkedIn allows up to 3000 characters for posts
   */
  truncateToLimit(content: string, limit: number = 3000): string {
    if (content.length <= limit) {
      return content;
    }

    // Find a good breaking point (end of sentence or word)
    let truncated = content.substring(0, limit - 3);

    // Try to break at end of sentence
    const lastSentence = truncated.lastIndexOf(". ");
    if (lastSentence > limit * 0.7) {
      truncated = truncated.substring(0, lastSentence + 1);
    } else {
      // Break at last word
      const lastSpace = truncated.lastIndexOf(" ");
      if (lastSpace > limit * 0.8) {
        truncated = truncated.substring(0, lastSpace);
      }
    }

    return `${truncated  }...`;
  }

  /**
   * Format content for LinkedIn with optional article link
   */
  formatWithArticleLink(
    content: string,
    articleUrl?: string,
    articleTitle?: string
  ): string {
    let formatted = content;

    if (articleUrl) {
      const linkText = articleTitle
        ? `\n\n📖 Read the full article: ${articleTitle}\n${articleUrl}`
        : `\n\n📖 ${articleUrl}`;

      // Ensure we don't exceed character limit after adding link
      const maxContentLength = 3000 - linkText.length - 10; // Buffer for safety
      if (formatted.length > maxContentLength) {
        formatted = this.truncateToLimit(formatted, maxContentLength);
      }

      formatted += linkText;
    }

    return formatted;
  }
}
