import { requestUrl, RequestUrlResponse } from "obsidian";
import {
  SubstackDocument,
  SubstackDraftPayload,
  SubstackSection,
  SubstackAudience,
  ImageUploadResult
} from "./types";

export class SubstackAPI {
  private cookie: string;

  constructor(cookie: string) {
    this.cookie = this.normalizeCookie(cookie);
  }

  /**
   * Normalize cookie to ensure it has the correct format
   * User can input just the value or the full cookie string
   */
  private normalizeCookie(cookie: string): string {
    const trimmed = cookie.trim();

    // Already has a cookie name prefix
    if (trimmed.includes("=")) {
      return trimmed;
    }

    // Just the value - add substack.sid prefix
    return `substack.sid=${trimmed}`;
  }

  private getBaseUrl(publication: string): string {
    return `https://${publication}.substack.com/api/v1`;
  }

  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Cookie: this.cookie
    };
  }

  /**
   * Get user profile with publications list
   * Returns the list of publication subdomains the user owns
   */
  async getUserPublications(): Promise<string[]> {
    const pubs = await this.getUserPublicationsWithInfo();
    return pubs.map((p) => p.subdomain);
  }

  /**
   * Get user publications with additional info (including paid status)
   */
  async getUserPublicationsWithInfo(): Promise<
    Array<{ subdomain: string; hasPaidSubscriptions: boolean }>
    > {
    const response = await requestUrl({
      url: "https://substack.com/api/v1/user/profile/self",
      method: "GET",
      headers: this.getHeaders(),
      throw: false
    });

    if (response.status >= 200 && response.status < 300 && response.json) {
      const profile = response.json as {
        publicationUsers?: Array<{
          publication?: {
            subdomain?: string;
            has_subscriber_only_content?: boolean;
            stripe_publishable_key?: string;
            stripe_country?: string;
            default_coupon?: unknown;
            // Debug: log full publication object to console
          };
        }>;
      };

      if (profile.publicationUsers) {
        return profile.publicationUsers
          .map((pu) => ({
            subdomain: pu.publication?.subdomain || "",
            // Check for indicators of paid subscriptions being enabled
            hasPaidSubscriptions: !!(
              pu.publication?.stripe_publishable_key ||
              pu.publication?.has_subscriber_only_content
            )
          }))
          .filter((p) => p.subdomain !== "");
      }
    }

    return [];
  }

  async createDraft(
    publication: string,
    title: string,
    body: SubstackDocument,
    subtitle?: string,
    audience: SubstackAudience = "everyone",
    tags?: string[]
  ): Promise<RequestUrlResponse> {
    const payload: Record<string, unknown> = {
      draft_title: title,
      draft_subtitle: subtitle || "",
      draft_body: JSON.stringify(body),
      draft_bylines: [],
      audience,
      type: "newsletter",
      section_chosen: false,
      write_comment_permissions: "everyone"
    };

    // Add tags if provided
    if (tags && tags.length > 0) {
      payload.postTags = tags;
    }

    const url = `${this.getBaseUrl(publication)}/drafts`;

    const response = await requestUrl({
      url,
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
      throw: false
    });

    return response;
  }

  /**
   * Get available sections for a publication
   */
  async getSections(publication: string): Promise<SubstackSection[]> {
    const response = await requestUrl({
      url: `https://${publication}.substack.com/api/v1/publication/sections`,
      method: "GET",
      headers: this.getHeaders(),
      throw: false
    });

    if (response.status >= 200 && response.status < 300 && response.json) {
      const sections = response.json as
        | SubstackSection[]
        | { sections?: SubstackSection[] };

      if (Array.isArray(sections)) {
        return sections;
      }
      if (sections.sections) {
        return sections.sections;
      }
    }

    return [];
  }

  /**
   * Update draft with section
   */
  async updateDraftSection(
    publication: string,
    draftId: string,
    sectionId: number
  ): Promise<RequestUrlResponse> {
    return this.updateDraft(publication, draftId, {
      draft_section_id: sectionId,
      section_chosen: true
    } as unknown as Partial<SubstackDraftPayload>);
  }

  async publishDraft(
    publication: string,
    draftId: string
  ): Promise<RequestUrlResponse> {
    const response = await requestUrl({
      url: `${this.getBaseUrl(publication)}/drafts/${draftId}/publish`,
      method: "POST",
      headers: this.getHeaders(),
      throw: false
    });

    return response;
  }

  async listDrafts(publication: string): Promise<RequestUrlResponse> {
    const response = await requestUrl({
      url: `${this.getBaseUrl(publication)}/drafts`,
      method: "GET",
      headers: this.getHeaders(),
      throw: false
    });

    return response;
  }

  async updateDraft(
    publication: string,
    draftId: string,
    updates: Partial<SubstackDraftPayload>
  ): Promise<RequestUrlResponse> {
    const response = await requestUrl({
      url: `${this.getBaseUrl(publication)}/drafts/${draftId}`,
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
      throw: false
    });

    return response;
  }

  async getDraft(
    publication: string,
    draftId: string
  ): Promise<RequestUrlResponse> {
    const response = await requestUrl({
      url: `${this.getBaseUrl(publication)}/drafts/${draftId}`,
      method: "GET",
      headers: this.getHeaders(),
      throw: false
    });

    return response;
  }

  updateCookie(newCookie: string): void {
    this.cookie = this.normalizeCookie(newCookie);
  }

  /**
   * Upload an image to Substack CDN
   * @param publication - The publication subdomain
   * @param imageData - Binary image data as ArrayBuffer
   * @param filename - Original filename with extension
   * @param mimeType - MIME type (image/png, image/jpeg, etc.)
   * @returns Image upload result with CDN URL
   */
  async uploadImage(
    publication: string,
    imageData: ArrayBuffer,
    filename: string,
    mimeType: string
  ): Promise<{ success: boolean; data?: ImageUploadResult; error?: string }> {
    // Convert ArrayBuffer to base64 data URI
    const uint8Array = new Uint8Array(imageData);
    let binary = "";
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i] as number);
    }
    const base64 = globalThis.btoa(binary);
    const dataUri = `data:${mimeType};base64,${base64}`;

    // Substack expects form-urlencoded with "image" field containing data URI
    const response = await requestUrl({
      url: `https://${publication}.substack.com/api/v1/image`,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.cookie
      },
      body: `image=${encodeURIComponent(dataUri)}`,
      throw: false
    });

    if (response.status >= 200 && response.status < 300) {
      return {
        success: true,
        data: response.json as ImageUploadResult
      };
    }

    return {
      success: false,
      error: `Upload failed: ${response.status} - ${response.text || "Unknown error"}`
    };
  }
}

// Re-export types for convenience
export type {
  SubstackDocument,
  SubstackDraftPayload,
  SubstackDraftResponse,
  SubstackSection,
  SubstackAudience,
  SubstackFrontmatter,
  ImageUploadResult
} from "./types";
