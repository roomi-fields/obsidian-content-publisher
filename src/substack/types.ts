/**
 * Substack JSON block format types
 * Adapted from substack-mcp-plus Python implementation
 */

// Text marks for inline formatting (Tiptap format)
export interface TextMark {
  type: "strong" | "em" | "code" | "link";
  attrs?: {
    href?: string; // Only for link marks
  };
}

// Base text content element (Tiptap format uses "text" field, not "content")
export interface TextContent {
  type: "text";
  text: string;
  marks?: TextMark[];
}

// Hard break for line breaks within paragraphs
export interface HardBreak {
  type: "hardBreak";
}

// Content that can appear inside a paragraph
export type InlineContent = TextContent | HardBreak;

// Paragraph block
export interface ParagraphBlock {
  type: "paragraph";
  content: InlineContent[];
}

// Header blocks (h1-h6) - Tiptap format with attrs.level
export interface HeaderBlock {
  type: "heading";
  attrs: {
    level: 1 | 2 | 3 | 4 | 5 | 6;
  };
  content: TextContent[];
}

// List item blocks (Tiptap format)
export interface ListItemBlock {
  type: "listItem";
  content: ParagraphBlock[];
}

// List blocks (Tiptap format)
export interface BulletListBlock {
  type: "bulletList";
  content: ListItemBlock[];
}

export interface OrderedListBlock {
  type: "orderedList";
  content: ListItemBlock[];
}

// Code block (Tiptap format)
export interface CodeBlock {
  type: "codeBlock";
  attrs?: {
    language?: string;
  };
  content: Array<{
    type: "text";
    text: string;
  }>;
}

// Blockquote
export interface BlockquoteBlock {
  type: "blockquote";
  content: ParagraphBlock[];
}

// Image block (Substack uses image2 type)
export interface ImageBlock {
  type: "image2";
  attrs: {
    src: string;
    fullscreen?: boolean;
    imageSize?: string;
    height?: number;
    width?: number;
    resizeWidth?: number;
    bytes?: number;
    alt?: string;
    title?: string;
    type?: string;
    href?: string;
    belowTheFold?: boolean;
    internalRedirect?: string | null;
  };
}

// Horizontal rule (Tiptap format)
export interface HorizontalRuleBlock {
  type: "horizontal_rule";
}

// Paywall marker
export interface PaywallBlock {
  type: "paywall";
}

// Captioned image block (for images with captions)
export interface CaptionedImageBlock {
  type: "captionedImage";
  attrs: {
    src: string;
    fullscreen?: boolean;
    imageSize?: "normal" | "inset" | "full";
    height?: number;
    width?: number;
    resizeWidth?: number;
    bytes?: number;
    alt?: string;
    title?: string;
  };
  content?: ParagraphBlock[];
}

// Union of all block types
export type SubstackBlock =
  | ParagraphBlock
  | HeaderBlock
  | BulletListBlock
  | OrderedListBlock
  | CodeBlock
  | BlockquoteBlock
  | ImageBlock
  | CaptionedImageBlock
  | HorizontalRuleBlock
  | PaywallBlock;

// Document structure
export interface SubstackDocument {
  type: "doc";
  content: SubstackBlock[];
}

// Audience type
export type SubstackAudience =
  | "everyone"
  | "only_paid"
  | "founding"
  | "only_free";

// Draft creation/update payload
export interface SubstackDraftPayload {
  title: string;
  subtitle?: string;
  body: SubstackDocument;
  audience?: SubstackAudience;
  postTags?: string[];
}

// Section from Substack API
export interface SubstackSection {
  id: number;
  name: string;
  slug: string;
  description?: string;
  is_live: boolean; // API returns is_live, not active
}

// Frontmatter fields for Substack
export interface SubstackFrontmatter {
  title?: string;
  subtitle?: string;
  excerpt?: string;
  audience?: SubstackAudience;
  tags?: string[];
  section?: string;
  substack_url?: string;
  substack_draft_id?: string;
  wordpress_url?: string;
}

// API response types
export interface SubstackDraftResponse {
  id: string;
  title: string;
  subtitle: string;
  slug: string;
  post_date: string;
  audience: string;
  draft_title: string;
  draft_subtitle: string;
  draft_body: SubstackDocument;
}

export interface SubstackPublishResponse {
  id: string;
  slug: string;
  canonical_url: string;
}

// Image upload types
export interface ImageUploadResult {
  id: string;
  url: string;
  contentType: string;
  bytes: number;
  imageWidth: number;
  imageHeight: number;
}

export interface ImageReference {
  fullMatch: string;
  alt: string;
  path: string;
  title?: string | undefined;
  isLocal: boolean;
  isWikiLink?: boolean | undefined;
  wikiLinkSize?: number | undefined;
}

export interface EnluminureInfo {
  imageRef: ImageReference;
  lineIndex: number;
}

export interface ImageProcessingResult {
  processedMarkdown: string;
  uploadedImages: Array<{
    originalPath: string;
    cdnUrl: string;
  }>;
  errors: Array<{
    path: string;
    error: string;
  }>;
  enluminure?: {
    cdnUrl: string;
    size?: number | undefined;
  } | undefined;
}
