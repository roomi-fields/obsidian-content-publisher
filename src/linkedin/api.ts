/**
 * LinkedIn API client
 * Uses LinkedIn's REST API v2 for posting content
 */

import { requestUrl, RequestUrlResponse } from "obsidian";
import {
  LinkedInApiResult,
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
   */
  async createTextPost(
    text: string,
    visibility: LinkedInVisibility = "PUBLIC"
  ): Promise<LinkedInApiResult<LinkedInPostResponse>> {
    const payload: LinkedInSharePayload = {
      author: this.getPersonUrn(),
      lifecycleState: "PUBLISHED",
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
   */
  async createArticlePost(
    text: string,
    articleUrl: string,
    articleTitle: string,
    articleDescription?: string,
    visibility: LinkedInVisibility = "PUBLIC"
  ): Promise<LinkedInApiResult<LinkedInPostResponse>> {
    const payload: LinkedInSharePayload = {
      author: this.getPersonUrn(),
      lifecycleState: "PUBLISHED",
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
   */
  async createImagePost(
    text: string,
    imageAsset: string,
    imageTitle?: string,
    visibility: LinkedInVisibility = "PUBLIC"
  ): Promise<LinkedInApiResult<LinkedInPostResponse>> {
    const payload: LinkedInSharePayload = {
      author: this.getPersonUrn(),
      lifecycleState: "PUBLISHED",
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
   * Get post URL from post ID
   */
  getPostUrl(postId: string): string {
    // Extract the activity ID from the URN (e.g., urn:li:ugcPost:123456789 -> 123456789)
    const activityId = postId.split(":").pop() || postId;
    return `https://www.linkedin.com/feed/update/urn:li:ugcPost:${activityId}`;
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
