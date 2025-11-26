import { requestUrl, RequestUrlResponse } from "obsidian";
import {
  SubstackDocument,
  SubstackDraftPayload,
  SubstackDraftResponse
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

  async createDraft(
    publication: string,
    title: string,
    body: SubstackDocument,
    subtitle?: string,
    audience: SubstackDraftPayload["audience"] = "everyone"
  ): Promise<RequestUrlResponse> {
    const payload = {
      draft_title: title,
      draft_subtitle: subtitle || "",
      draft_body: JSON.stringify(body),
      draft_bylines: [],
      audience,
      type: "newsletter",
      section_chosen: false,
      write_comment_permissions: "everyone"
    };

    const url = `${this.getBaseUrl(publication)}/drafts`;

    const response = await requestUrl({
      url,
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });

    return response;
  }

  async publishDraft(
    publication: string,
    draftId: string
  ): Promise<RequestUrlResponse> {
    const response = await requestUrl({
      url: `${this.getBaseUrl(publication)}/drafts/${draftId}/publish`,
      method: "POST",
      headers: this.getHeaders()
    });

    return response;
  }

  async listDrafts(publication: string): Promise<RequestUrlResponse> {
    const response = await requestUrl({
      url: `${this.getBaseUrl(publication)}/drafts`,
      method: "GET",
      headers: this.getHeaders()
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
      body: JSON.stringify(updates)
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
      headers: this.getHeaders()
    });

    return response;
  }

  updateCookie(newCookie: string): void {
    this.cookie = this.normalizeCookie(newCookie);
  }
}

// Re-export types for convenience
export type { SubstackDocument, SubstackDraftPayload, SubstackDraftResponse };
