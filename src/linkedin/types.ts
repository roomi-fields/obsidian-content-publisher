/**
 * LinkedIn API types
 */

// LinkedIn post visibility
export type LinkedInVisibility = "PUBLIC" | "CONNECTIONS" | "LOGGED_IN";

// LinkedIn media category
export type LinkedInMediaCategory = "ARTICLE" | "IMAGE" | "NONE";

// LinkedIn share media category for API
export type LinkedInShareMediaCategory = "ARTICLE" | "IMAGE" | "NONE";

// LinkedIn post payload for sharing
export interface LinkedInSharePayload {
  author: string; // Format: "urn:li:person:{personId}"
  lifecycleState: "PUBLISHED" | "DRAFT";
  specificContent: {
    "com.linkedin.ugc.ShareContent": {
      shareCommentary: {
        text: string;
      };
      shareMediaCategory: LinkedInShareMediaCategory;
      media?: LinkedInShareMedia[];
    };
  };
  visibility: {
    "com.linkedin.ugc.MemberNetworkVisibility": LinkedInVisibility;
  };
}

// LinkedIn share media (for articles with links)
export interface LinkedInShareMedia {
  status: "READY";
  description?: {
    text: string;
  } | undefined;
  media?: string | undefined; // URN for uploaded image
  originalUrl?: string | undefined; // URL for articles
  title?: {
    text: string;
  } | undefined;
  thumbnails?: Array<{
    url: string;
  }> | undefined;
}

// LinkedIn UGC Post response
export interface LinkedInPostResponse {
  id: string;
  owner: string;
  created: {
    time: number;
  };
  lifecycleState: string;
}

// LinkedIn profile info
export interface LinkedInProfile {
  id: string;
  localizedFirstName: string;
  localizedLastName: string;
  profilePicture?: {
    "displayImage~": {
      elements: Array<{
        identifiers: Array<{
          identifier: string;
        }>;
      }>;
    };
  };
}

// LinkedIn image upload registration response
export interface LinkedInUploadRegisterResponse {
  value: {
    uploadMechanism: {
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
        headers: Record<string, string>;
        uploadUrl: string;
      };
    };
    mediaArtifact: string;
    asset: string;
  };
}

// LinkedIn image upload result
export interface LinkedInImageUploadResult {
  asset: string; // URN to use in posts
  uploadUrl: string;
}

// LinkedIn frontmatter fields
export interface LinkedInFrontmatter {
  title?: string;
  subtitle?: string;
  excerpt?: string;
  linkedin_url?: string;
  linkedin_post_id?: string;
  visibility?: LinkedInVisibility;
  tags?: string[];
  // Bilingual-specific fields
  linkedin_url_fr?: string;
  linkedin_url_en?: string;
  linkedin_post_id_fr?: string;
  linkedin_post_id_en?: string;
}

// LinkedIn settings
export interface LinkedInSettings {
  enabled: boolean;
  accessToken: string;
  personId: string; // LinkedIn person URN ID
  defaultVisibility: LinkedInVisibility;
}

// API result wrapper (consistent with WordPress pattern)
export interface LinkedInApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Image reference for LinkedIn
export interface LinkedInImageReference {
  fullMatch: string;
  alt: string;
  path: string;
  title?: string | undefined;
  isLocal: boolean;
  isWikiLink?: boolean | undefined;
  wikiLinkSize?: number | undefined;
}

// Image processing result for LinkedIn
export interface LinkedInImageProcessingResult {
  processedContent: string;
  uploadedImages: Array<{
    originalPath: string;
    linkedinAsset: string;
  }>;
  errors: Array<{
    path: string;
    error: string;
  }>;
  featuredImage?: {
    asset: string;
    originalPath: string;
  } | undefined;
}
