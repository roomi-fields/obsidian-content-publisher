/**
 * LinkedIn API client
 * Uses LinkedIn's REST API v2 for posting content
 */

import { requestUrl, RequestUrlResponse } from "obsidian";
import {
  LinkedInApiResult,
  LinkedInLifecycleState,
  LinkedInPostResponse,
  LinkedInProfile,
  LinkedInSharePayload,
  LinkedInUploadRegisterResponse,
  LinkedInVisibility
} from "./types";

export class LinkedInAPI {
  private accessToken: string;
  private personId: string;

  constructor(accessToken: string, personId: string) {
    this.accessToken = accessToken;
    this.personId = personId;
  }

  /**
   * Get authorization headers for LinkedIn API
   */
  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202401"
    };
  }

  /**
   * Get the person URN for the authenticated user
   */
  getPersonUrn(): string {
    return `urn:li:person:${this.personId}`;
  }

  /**
   * Test connection by fetching user profile
   */
  async testConnection(): Promise<LinkedInApiResult<LinkedInProfile>> {
    try {
      const response = await requestUrl({
        url: "https://api.linkedin.com/v2/userinfo",
        method: "GET",
        headers: this.getHeaders(),
        throw: false
      });

      if (response.status >= 200 && response.status < 300) {
        const data = response.json as { sub: string; name: string; given_name: string; family_name: string };
        return {
          success: true,
          data: {
            id: data.sub,
            localizedFirstName: data.given_name,
            localizedLastName: data.family_name
          }
        };
      }

      return {
        success: false,
        error: this.extractError(response)
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Get the authenticated user's profile using /me endpoint
   */
  async getProfile(): Promise<LinkedInApiResult<LinkedInProfile>> {
    try {
      const response = await requestUrl({
        url: "https://api.linkedin.com/v2/userinfo",
        method: "GET",
        headers: this.getHeaders(),
        throw: false
      });

      if (response.status >= 200 && response.status < 300) {
        const data = response.json as { sub: string; name: string; given_name: string; family_name: string };
        return {
          success: true,
          data: {
            id: data.sub,
            localizedFirstName: data.given_name,
            localizedLastName: data.family_name
          }
        };
      }

      return {
        success: false,
        error: this.extractError(response)
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Create a text post on LinkedIn
   * @param text - The post content
   * @param visibility - Post visibility (PUBLIC, CONNECTIONS, LOGGED_IN)
   * @param lifecycleState - PUBLISHED for immediate post, DRAFT to save as draft
   */
  async createTextPost(
    text: string,
    visibility: LinkedInVisibility = "PUBLIC",
    lifecycleState: LinkedInLifecycleState = "PUBLISHED"
  ): Promise<LinkedInApiResult<LinkedInPostResponse>> {
    const payload: LinkedInSharePayload = {
      author: this.getPersonUrn(),
      lifecycleState,
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text
          },
          shareMediaCategory: "NONE"
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": visibility
      }
    };

    try {
      const response = await requestUrl({
        url: "https://api.linkedin.com/v2/ugcPosts",
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        throw: false
      });

      if (response.status >= 200 && response.status < 300) {
        return {
          success: true,
          data: response.json as LinkedInPostResponse
        };
      }

      return {
        success: false,
        error: this.extractError(response)
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Create a post with an article link
   * @param text - The post content
   * @param articleUrl - URL of the article to share
   * @param articleTitle - Title of the article
   * @param articleDescription - Optional description
   * @param visibility - Post visibility
   * @param lifecycleState - PUBLISHED for immediate post, DRAFT to save as draft
   */
  async createArticlePost(
    text: string,
    articleUrl: string,
    articleTitle: string,
    articleDescription?: string,
    visibility: LinkedInVisibility = "PUBLIC",
    lifecycleState: LinkedInLifecycleState = "PUBLISHED"
  ): Promise<LinkedInApiResult<LinkedInPostResponse>> {
    const payload: LinkedInSharePayload = {
      author: this.getPersonUrn(),
      lifecycleState,
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text
          },
          shareMediaCategory: "ARTICLE",
          media: [
            {
              status: "READY",
              originalUrl: articleUrl,
              title: {
                text: articleTitle
              },
              description: articleDescription
                ? { text: articleDescription }
                : undefined
            }
          ]
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": visibility
      }
    };

    try {
      const response = await requestUrl({
        url: "https://api.linkedin.com/v2/ugcPosts",
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        throw: false
      });

      if (response.status >= 200 && response.status < 300) {
        return {
          success: true,
          data: response.json as LinkedInPostResponse
        };
      }

      return {
        success: false,
        error: this.extractError(response)
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Create a post with an uploaded image
   * @param text - The post content
   * @param imageAsset - LinkedIn image asset URN
   * @param imageTitle - Optional image title
   * @param visibility - Post visibility
   * @param lifecycleState - PUBLISHED for immediate post, DRAFT to save as draft
   */
  async createImagePost(
    text: string,
    imageAsset: string,
    imageTitle?: string,
    visibility: LinkedInVisibility = "PUBLIC",
    lifecycleState: LinkedInLifecycleState = "PUBLISHED"
  ): Promise<LinkedInApiResult<LinkedInPostResponse>> {
    const payload: LinkedInSharePayload = {
      author: this.getPersonUrn(),
      lifecycleState,
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text
          },
          shareMediaCategory: "IMAGE",
          media: [
            {
              status: "READY",
              media: imageAsset,
              title: imageTitle ? { text: imageTitle } : undefined
            }
          ]
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": visibility
      }
    };

    try {
      const response = await requestUrl({
        url: "https://api.linkedin.com/v2/ugcPosts",
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        throw: false
      });

      if (response.status >= 200 && response.status < 300) {
        return {
          success: true,
          data: response.json as LinkedInPostResponse
        };
      }

      return {
        success: false,
        error: this.extractError(response)
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Register an image upload with LinkedIn
   * Returns the upload URL and asset URN
   */
  async registerImageUpload(): Promise<LinkedInApiResult<LinkedInUploadRegisterResponse>> {
    const payload = {
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: this.getPersonUrn(),
        serviceRelationships: [
          {
            relationshipType: "OWNER",
            identifier: "urn:li:userGeneratedContent"
          }
        ]
      }
    };

    try {
      const response = await requestUrl({
        url: "https://api.linkedin.com/v2/assets?action=registerUpload",
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        throw: false
      });

      if (response.status >= 200 && response.status < 300) {
        return {
          success: true,
          data: response.json as LinkedInUploadRegisterResponse
        };
      }

      return {
        success: false,
        error: this.extractError(response)
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Upload an image to LinkedIn's servers
   */
  async uploadImage(
    uploadUrl: string,
    imageData: ArrayBuffer,
    contentType: string
  ): Promise<LinkedInApiResult<void>> {
    try {
      const response = await requestUrl({
        url: uploadUrl,
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": contentType
        },
        body: imageData,
        throw: false
      });

      if (response.status >= 200 && response.status < 300) {
        return { success: true };
      }

      return {
        success: false,
        error: this.extractError(response)
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Publish an existing draft post
   * @param draftId - The URN of the draft post to publish
   */
  async publishDraft(
    draftId: string
  ): Promise<LinkedInApiResult<LinkedInPostResponse>> {
    try {
      // LinkedIn API uses a partial update to change lifecycle state
      const response = await requestUrl({
        url: `https://api.linkedin.com/v2/ugcPosts/${encodeURIComponent(draftId)}`,
        method: "POST",
        headers: {
          ...this.getHeaders(),
          "X-Restli-Method": "PARTIAL_UPDATE"
        },
        body: JSON.stringify({
          patch: {
            $set: {
              lifecycleState: "PUBLISHED"
            }
          }
        }),
        throw: false
      });

      if (response.status >= 200 && response.status < 300) {
        return {
          success: true,
          data: {
            id: draftId,
            owner: this.getPersonUrn(),
            created: { time: Date.now() },
            lifecycleState: "PUBLISHED"
          }
        };
      }

      return {
        success: false,
        error: this.extractError(response)
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Get post URL from post ID
   */
  getPostUrl(postId: string): string {
    // Extract the ID from the URN (e.g., urn:li:ugcPost:123456789 -> 123456789)
    // Note: LinkedIn uses urn:li:activity for public URLs, but we only get ugcPost ID
    // The share format works as a redirect in most cases
    const postIdNum = postId.split(":").pop() || postId;
    return `https://www.linkedin.com/feed/update/urn:li:share:${postIdNum}`;
  }

  /**
   * Get draft URL - LinkedIn drafts are accessible at a specific URL
   */
  getDraftUrl(): string {
    return "https://www.linkedin.com/post/new/drafts";
  }

  /**
   * Extract error message from response
   */
  private extractError(response: RequestUrlResponse): string {
    try {
      const json = response.json as { message?: string; error?: string; error_description?: string };
      return json.message || json.error_description || json.error || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }
}
