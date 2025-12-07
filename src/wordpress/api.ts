import { requestUrl, RequestUrlResponse } from "obsidian";
import {
  WordPressPagePayload,
  WordPressPageResponse,
  WordPressPostPayload,
  WordPressPostResponse,
  WordPressMediaResponse,
  WordPressPostStatus,
  RankMathMeta
} from "./types";

export class WordPressAPI {
  private baseUrl: string;
  private username: string;
  private password: string;

  constructor(baseUrl: string, username: string, password: string) {
    // Remove trailing slash from baseUrl
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.username = username;
    this.password = password;
  }

  /**
   * Get the base64 encoded authorization header
   */
  private getAuthHeader(): string {
    const credentials = `${this.username}:${this.password}`;
    // Use btoa for base64 encoding
    const encoded = globalThis.btoa(credentials);
    return `Basic ${encoded}`;
  }

  /**
   * Get common headers for API requests
   */
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: this.getAuthHeader()
    };
  }

  /**
   * Get the REST API URL
   */
  private getApiUrl(endpoint: string): string {
    return `${this.baseUrl}/wp-json/wp/v2${endpoint}`;
  }

  /**
   * Test the connection to WordPress
   */
  async testConnection(): Promise<{
    success: boolean;
    error?: string | undefined;
  }> {
    const response = await requestUrl({
      url: this.getApiUrl("/users/me"),
      method: "GET",
      headers: this.getHeaders(),
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      return { success: true };
    }

    return {
      success: false,
      error: `Connection failed: ${response.status} - ${response.text || "Unknown error"}`
    };
  }

  /**
   * Create a new page in WordPress
   */
  async createPage(
    title: string,
    content: string,
    parentId?: number,
    status: WordPressPostStatus = "draft"
  ): Promise<{
    success: boolean;
    data?: WordPressPageResponse | undefined;
    error?: string | undefined;
  }> {
    const payload: WordPressPagePayload = {
      title,
      content,
      status,
      parent: parentId
    };

    const response = await requestUrl({
      url: this.getApiUrl("/pages"),
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      return {
        success: true,
        data: response.json as WordPressPageResponse
      };
    }

    return {
      success: false,
      error: `Failed to create page: ${response.status} - ${response.text || "Unknown error"}`
    };
  }

  /**
   * Create a new post (article) in WordPress
   * @param options.slug - URL slug for the post
   * @param options.excerpt - Post excerpt/meta description
   * @param options.featuredMediaId - Media ID for featured image
   * @param options.rankMathMeta - Rank Math SEO meta fields
   * @param options.lang - Polylang language code (fr, en)
   * @param options.translations - Polylang translations mapping (e.g., {fr: 123})
   */
  async createPost(
    title: string,
    content: string,
    categoryIds?: number[],
    status: WordPressPostStatus = "draft",
    options?: {
      slug?: string;
      excerpt?: string;
      featuredMediaId?: number;
      rankMathMeta?: RankMathMeta;
      tags?: number[];
      lang?: "fr" | "en";
      translations?: Record<string, number>;
    }
  ): Promise<{
    success: boolean;
    data?: WordPressPostResponse | undefined;
    error?: string | undefined;
  }> {
    const payload: WordPressPostPayload = {
      title,
      content,
      status,
      categories: categoryIds
    };

    // Add optional SEO fields
    if (options?.slug) {
      payload.slug = options.slug;
    }
    if (options?.excerpt) {
      payload.excerpt = options.excerpt;
    }
    if (options?.featuredMediaId) {
      payload.featured_media = options.featuredMediaId;
    }
    // Add Rank Math SEO meta fields
    if (options?.rankMathMeta) {
      payload.meta = options.rankMathMeta;
    }
    // Add tags
    if (options?.tags && options.tags.length > 0) {
      payload.tags = options.tags;
    }
    // Add Polylang language
    if (options?.lang) {
      payload.lang = options.lang;
    }
    // Add Polylang translations (link to other language version)
    if (options?.translations) {
      payload.translations = options.translations as Record<"fr" | "en", number>;
    }

    const response = await requestUrl({
      url: this.getApiUrl("/posts"),
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      return {
        success: true,
        data: response.json as WordPressPostResponse
      };
    }

    return {
      success: false,
      error: `Failed to create post: ${response.status} - ${response.text || "Unknown error"}`
    };
  }

  /**
   * Update an existing post (article) in WordPress
   */
  async updatePost(
    postId: number,
    updates: Partial<WordPressPostPayload>
  ): Promise<{
    success: boolean;
    data?: WordPressPostResponse | undefined;
    error?: string | undefined;
  }> {
    const response = await requestUrl({
      url: this.getApiUrl(`/posts/${postId}`),
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      return {
        success: true,
        data: response.json as WordPressPostResponse
      };
    }

    return {
      success: false,
      error: `Failed to update post: ${response.status} - ${response.text || "Unknown error"}`
    };
  }

  /**
   * Search for posts by title
   */
  async findPostByTitle(
    title: string,
    categoryId?: number
  ): Promise<{
    success: boolean;
    data?: WordPressPostResponse | undefined;
    error?: string | undefined;
  }> {
    let url = this.getApiUrl("/posts");
    const params = new URLSearchParams();
    params.append("search", title);
    params.append("per_page", "100");
    if (categoryId !== undefined) {
      params.append("categories", categoryId.toString());
    }
    url += `?${params.toString()}`;

    const response = await requestUrl({
      url,
      method: "GET",
      headers: this.getHeaders(),
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      const posts = response.json as WordPressPostResponse[];

      // Find exact title match (API search is fuzzy)
      const exactMatch = posts.find(
        (post) =>
          post.title.rendered === title ||
          post.title.raw === title ||
          this.decodeHtmlEntities(post.title.rendered) === title
      );

      if (exactMatch) {
        return {
          success: true,
          data: exactMatch
        };
      }

      return {
        success: true,
        data: undefined
      };
    }

    return {
      success: false,
      error: `Failed to search posts: ${response.status} - ${response.text || "Unknown error"}`
    };
  }

  /**
   * Update an existing page in WordPress
   */
  async updatePage(
    pageId: number,
    updates: Partial<WordPressPagePayload>
  ): Promise<{
    success: boolean;
    data?: WordPressPageResponse | undefined;
    error?: string | undefined;
  }> {
    const response = await requestUrl({
      url: this.getApiUrl(`/pages/${pageId}`),
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      return {
        success: true,
        data: response.json as WordPressPageResponse
      };
    }

    return {
      success: false,
      error: `Failed to update page: ${response.status} - ${response.text || "Unknown error"}`
    };
  }

  /**
   * Get a page by ID
   */
  async getPage(pageId: number): Promise<{
    success: boolean;
    data?: WordPressPageResponse | undefined;
    error?: string | undefined;
  }> {
    const response = await requestUrl({
      url: this.getApiUrl(`/pages/${pageId}`),
      method: "GET",
      headers: this.getHeaders(),
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      return {
        success: true,
        data: response.json as WordPressPageResponse
      };
    }

    return {
      success: false,
      error: `Failed to get page: ${response.status} - ${response.text || "Unknown error"}`
    };
  }

  /**
   * Search for pages by title under a specific parent
   */
  async findPageByTitle(
    title: string,
    parentId?: number
  ): Promise<{
    success: boolean;
    data?: WordPressPageResponse | undefined;
    error?: string | undefined;
  }> {
    let url = this.getApiUrl("/pages");
    const params = new URLSearchParams();
    params.append("search", title);
    params.append("per_page", "100");
    if (parentId !== undefined) {
      params.append("parent", parentId.toString());
    }
    url += `?${params.toString()}`;

    const response = await requestUrl({
      url,
      method: "GET",
      headers: this.getHeaders(),
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      const pages = response.json as WordPressPageResponse[];

      // Find exact title match (API search is fuzzy)
      const exactMatch = pages.find(
        (page) =>
          page.title.rendered === title ||
          page.title.raw === title ||
          this.decodeHtmlEntities(page.title.rendered) === title
      );

      if (exactMatch) {
        return {
          success: true,
          data: exactMatch
        };
      }

      return {
        success: true,
        data: undefined
      };
    }

    return {
      success: false,
      error: `Failed to search pages: ${response.status} - ${response.text || "Unknown error"}`
    };
  }

  /**
   * Decode HTML entities in a string
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&#8211;/g, "-")  // en-dash → hyphen
      .replace(/&#8212;/g, "-")  // em-dash → hyphen
      .replace(/&ndash;/g, "-")
      .replace(/&mdash;/g, "-");
  }

  /**
   * Get all child pages of a parent page
   */
  async getChildPages(parentId: number): Promise<{
    success: boolean;
    data?: WordPressPageResponse[] | undefined;
    error?: string | undefined;
  }> {
    const response = await requestUrl({
      url: this.getApiUrl(`/pages?parent=${parentId}&per_page=100`),
      method: "GET",
      headers: this.getHeaders(),
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      return {
        success: true,
        data: response.json as WordPressPageResponse[]
      };
    }

    return {
      success: false,
      error: `Failed to get child pages: ${response.status} - ${response.text || "Unknown error"}`
    };
  }

  /**
   * Upload media (image) to WordPress
   */
  async uploadMedia(
    imageData: ArrayBuffer,
    filename: string,
    mimeType: string
  ): Promise<{
    success: boolean;
    data?: WordPressMediaResponse | undefined;
    error?: string | undefined;
  }> {
    const response = await requestUrl({
      url: this.getApiUrl("/media"),
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`
      },
      body: imageData,
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      return {
        success: true,
        data: response.json as WordPressMediaResponse
      };
    }

    return {
      success: false,
      error: `Failed to upload media: ${response.status} - ${response.text || "Unknown error"}`
    };
  }

  /**
   * Delete a page by ID
   */
  async deletePage(
    pageId: number,
    force: boolean = false
  ): Promise<{
    success: boolean;
    error?: string | undefined;
  }> {
    const url = force
      ? this.getApiUrl(`/pages/${pageId}?force=true`)
      : this.getApiUrl(`/pages/${pageId}`);

    const response = await requestUrl({
      url,
      method: "DELETE",
      headers: this.getHeaders(),
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      return { success: true };
    }

    return {
      success: false,
      error: `Failed to delete page: ${response.status} - ${response.text || "Unknown error"}`
    };
  }

  /**
   * Update credentials
   */
  updateCredentials(
    baseUrl: string,
    username: string,
    password: string
  ): void {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.username = username;
    this.password = password;
  }

  /**
   * Get raw response for debugging
   */
  async rawRequest(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET"
  ): Promise<RequestUrlResponse> {
    return await requestUrl({
      url: this.getApiUrl(endpoint),
      method,
      headers: this.getHeaders(),
      throw: false
    });
  }

  /**
   * Get all categories from WordPress
   */
  async getCategories(): Promise<{
    success: boolean;
    data?: Array<{ id: number; name: string; slug: string }> | undefined;
    error?: string | undefined;
  }> {
    const response = await requestUrl({
      url: this.getApiUrl("/categories?per_page=100"),
      method: "GET",
      headers: this.getHeaders(),
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      const categories = response.json as Array<{ id: number; name: string; slug: string }>;
      // Filter out "Uncategorized" (id=1) as it's typically not useful
      const filtered = categories.filter((c) => c.slug !== "uncategorized");
      return { success: true, data: filtered };
    }

    return {
      success: false,
      error: `Failed to get categories: ${response.status} - ${response.text || "Unknown error"}`
    };
  }

  /**
   * Get a tag by slug
   */
  async getTagBySlug(slug: string): Promise<{
    success: boolean;
    data?: { id: number; name: string; slug: string } | undefined;
    error?: string | undefined;
  }> {
    const response = await requestUrl({
      url: this.getApiUrl(`/tags?slug=${encodeURIComponent(slug)}`),
      method: "GET",
      headers: this.getHeaders(),
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      const tags = response.json as Array<{ id: number; name: string; slug: string }>;
      if (tags.length > 0) {
        return { success: true, data: tags[0] };
      }
      return { success: true, data: undefined };
    }

    return {
      success: false,
      error: `Failed to get tag: ${response.status} - ${response.text || "Unknown error"}`
    };
  }

  /**
   * Create a new tag
   */
  async createTag(name: string): Promise<{
    success: boolean;
    data?: { id: number; name: string; slug: string } | undefined;
    error?: string | undefined;
  }> {
    const response = await requestUrl({
      url: this.getApiUrl("/tags"),
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ name }),
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      return {
        success: true,
        data: response.json as { id: number; name: string; slug: string }
      };
    }

    return {
      success: false,
      error: `Failed to create tag: ${response.status} - ${response.text || "Unknown error"}`
    };
  }

  /**
   * Get or create a tag by name
   * Returns the tag ID
   */
  async getOrCreateTag(name: string): Promise<{
    success: boolean;
    id?: number | undefined;
    error?: string | undefined;
  }> {
    // Convert name to slug format for lookup
    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
      .replace(/^-+|-+$/g, ""); // Trim hyphens

    // Try to find existing tag
    const existing = await this.getTagBySlug(slug);
    if (existing.success && existing.data) {
      return { success: true, id: existing.data.id };
    }

    // Create new tag
    const created = await this.createTag(name);
    if (created.success && created.data) {
      return { success: true, id: created.data.id };
    }

    return {
      success: false,
      error: created.error || "Failed to get or create tag"
    };
  }

  /**
   * Resolve multiple tag names to IDs
   * Creates tags that don't exist
   */
  async resolveTagIds(tagNames: string[]): Promise<{
    success: boolean;
    ids: number[];
    errors: string[];
  }> {
    const ids: number[] = [];
    const errors: string[] = [];

    for (const name of tagNames) {
      const result = await this.getOrCreateTag(name);
      if (result.success && result.id) {
        ids.push(result.id);
      } else {
        errors.push(`Tag "${name}": ${result.error || "Unknown error"}`);
      }
    }

    return {
      success: errors.length === 0,
      ids,
      errors
    };
  }
}

// Re-export types for convenience
export type {
  WordPressPagePayload,
  WordPressPageResponse,
  WordPressPostPayload,
  WordPressPostResponse,
  WordPressMediaResponse,
  WordPressPostStatus,
  WordPressSettings,
  WordPressFrontmatter,
  WordPressCategoryMapping
} from "./types";
