/**
 * WordPress API types
 */

// WordPress content type (page or article/post)
export type WordPressContentType = "page" | "article";

// WordPress post/page status
export type WordPressPostStatus =
  | "publish"
  | "draft"
  | "pending"
  | "private"
  | "future";

// Polylang language code (defined early for use in payloads)
export type PolylangLanguage = "fr" | "en";

// Rank Math SEO meta fields
export interface RankMathMeta {
  rank_math_focus_keyword?: string;
  rank_math_description?: string;
  rank_math_title?: string;
  rank_math_facebook_title?: string;
  rank_math_facebook_description?: string;
  rank_math_facebook_image?: string;
  rank_math_facebook_image_id?: string;
  rank_math_twitter_use_facebook?: string;
}

// WordPress post creation/update payload (for articles)
export interface WordPressPostPayload {
  title: string;
  content: string;
  status: WordPressPostStatus;
  categories?: number[] | undefined;
  tags?: number[] | undefined;
  slug?: string | undefined;
  excerpt?: string | undefined;
  featured_media?: number | undefined;
  meta?: RankMathMeta | undefined;
  // Date field (ISO 8601 format) - used to update publication date
  date?: string | undefined;
  // Polylang fields
  lang?: PolylangLanguage | undefined;
  translations?: Record<PolylangLanguage, number> | undefined;
}

// WordPress post response from API (for articles)
export interface WordPressPostResponse {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: WordPressPostStatus;
  type: string;
  link: string;
  title: {
    rendered: string;
    raw?: string;
  };
  content: {
    rendered: string;
    raw?: string;
    protected: boolean;
  };
  excerpt: {
    rendered: string;
    raw?: string;
    protected: boolean;
  };
  categories: number[];
  tags: number[];
  featured_media: number;
}

// WordPress page creation/update payload (legacy, for pages)
export interface WordPressPagePayload {
  title: string;
  content: string;
  status: WordPressPostStatus;
  parent?: number | undefined;
  slug?: string | undefined;
  excerpt?: string | undefined;
  featured_media?: number | undefined;
  // Date field (ISO 8601 format) - used to update publication date
  date?: string | undefined;
}

// WordPress page response from API
export interface WordPressPageResponse {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: WordPressPostStatus;
  type: string;
  link: string;
  title: {
    rendered: string;
    raw?: string;
  };
  content: {
    rendered: string;
    raw?: string;
    protected: boolean;
  };
  excerpt: {
    rendered: string;
    raw?: string;
    protected: boolean;
  };
  parent: number;
  featured_media: number;
}

// WordPress media upload response
export interface WordPressMediaResponse {
  id: number;
  date: string;
  slug: string;
  type: string;
  link: string;
  title: {
    rendered: string;
  };
  source_url: string;
  media_type: string;
  mime_type: string;
  media_details: {
    width: number;
    height: number;
    file: string;
    sizes?: Record<
      string,
      {
        file: string;
        width: number;
        height: number;
        mime_type: string;
        source_url: string;
      }
    >;
  };
}

// Category to parent page ID mapping
export interface WordPressCategoryMapping {
  [category: string]: number;
}

// Article organization config for auto-moving after publication
export interface ArticleOrganizationConfig {
  enabled: boolean;
  sourceFolder: string;      // ex: "Publications/_brouillons/"
  destinationBase: string;   // ex: "Publications/re.liance.art/Ressources/"
  // Categories map directly to subfolders (CNV -> CNV/)
}

// Single WordPress server configuration
export interface WordPressServer {
  id: string;
  name: string;
  baseUrl: string;
  username: string;
  password: string;
  categoryPageIds: WordPressCategoryMapping;
  defaultCategory: string;
  // Polylang multilingual support
  polylang?: PolylangConfig;
  // Auto-organize articles after publication
  articleOrganization?: ArticleOrganizationConfig;
}

// WordPress settings for the plugin (multi-server)
export interface WordPressSettings {
  baseUrl: string;
  username: string;
  password: string;
  categoryPageIds: WordPressCategoryMapping;
  defaultCategory: string;
}

// WordPress multi-server settings
export interface WordPressMultiServerSettings {
  servers: WordPressServer[];
  defaultServerId: string;
}

// WordPress frontmatter fields
export interface WordPressFrontmatter {
  title?: string;
  subtitle?: string;
  category?: string;
  status?: WordPressPostStatus;
  slug?: string;
  excerpt?: string;
  tags?: string[];
  focus_keyword?: string;
  // Enluminure image path (drop cap image)
  enluminure?: string;
  // Illustration image path (main article image)
  illustration?: string;
  // Content type: page or article
  type?: WordPressContentType;
  // WordPress URLs (set after publication)
  wordpress_url?: string;
  wordpress_id?: number;
  wordpress_slug?: string;
}

// Enluminure info for WordPress
export interface WordPressEnluminureInfo {
  imageRef: WordPressImageReference;
  lineIndex: number;
  wordpressUrl?: string | undefined;
  mediaId?: number | undefined;
}

// Image reference for WordPress
export interface WordPressImageReference {
  fullMatch: string;
  alt: string;
  path: string;
  title?: string | undefined;
  isLocal: boolean;
  isWikiLink?: boolean | undefined;
  wikiLinkSize?: number | undefined;
}

// Image processing result for WordPress
export interface WordPressImageProcessingResult {
  processedMarkdown: string;
  uploadedImages: Array<{
    originalPath: string;
    wordpressUrl: string;
    mediaId: number;
  }>;
  errors: Array<{
    path: string;
    error: string;
  }>;
  enluminure?: WordPressEnluminureInfo | undefined;
}

// WordPress wikilink for internal links
export interface WordPressWikiLink {
  fullMatch: string;
  linkText: string;
  displayText?: string | undefined;
}

// Polylang category mapping by language
export interface PolylangCategoryMapping {
  [category: string]: {
    fr: number;
    en: number;
  };
}

// Polylang configuration for a server
export interface PolylangConfig {
  enabled: boolean;
  categoryMapping: PolylangCategoryMapping;
}

// Bilingual content parsed from callouts
export interface BilingualContent {
  fr: LanguageContent;
  en: LanguageContent;
}

// Content for a single language (parsed from callout)
export interface LanguageContent {
  title: string;
  subtitle?: string;
  excerpt?: string;
  slug?: string;
  focus_keyword?: string;
  tags?: string[];
  enluminure?: string;
  content: string; // The actual markdown content
}

// Bilingual frontmatter (metadata per language)
export interface BilingualFrontmatter {
  // Common fields
  category?: string;
  // Per-language fields
  fr?: LanguageFrontmatter;
  en?: LanguageFrontmatter;
}

// Frontmatter for a single language
export interface LanguageFrontmatter {
  title?: string;
  subtitle?: string;
  excerpt?: string;
  slug?: string;
  focus_keyword?: string;
  tags?: string[];
  enluminure?: string;
  wordpress_url?: string;
}

// Result of bilingual publication
export interface BilingualPublishResult {
  fr?: {
    postId: number;
    url: string;
  };
  en?: {
    postId: number;
    url: string;
  };
}
