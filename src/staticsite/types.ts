/** A section of the site: its pages live in one vault folder and share a URL prefix */
export interface StaticSiteSection {
  /** Identifier, also written in the page's section field (e.g. "blog") */
  name: string;
  /** Vault folder holding the section's pages */
  folder: string;
  /** URL prefix of the section's pages (e.g. "/blog/") */
  urlPrefix: string;
  /** Value written in the section field when it differs from the name (e.g. "blog" for a "blog-exercises" section) */
  fieldValue?: string;
}

export interface StaticSiteConfig {
  enabled: boolean;
  /** Public address of the site (e.g. https://example.com), used for the published link */
  baseUrl: string;
  sections: StaticSiteSection[];
  /** Vault folder holding the site's images; each page gets a sub-folder named after its slug */
  imagesFolder: string;
  /** URL prefix the site serves that folder at (e.g. "/images/") */
  imagesUrlPrefix: string;
  /**
   * Keep Obsidian image embeds (![[...]]) and the cover as a [[...]] link, instead of copying the
   * images into the image folder and rewriting their references to URLs. For a site whose own build
   * resolves Obsidian embeds (so the note stays viewable in Obsidian after publishing).
   */
  keepVaultImages: boolean;
  /** Larger images are refused (the site may not take them) */
  maxImageMB: number;
  /** Frontmatter key for each page field; an empty key leaves the field out */
  fields: {
    title: string;
    section: string;
    date: string;
    description: string;
    cover: string;
  };
  /** Date format with YYYY, MM, DD tokens */
  dateFormat: string;
  /** Fields written as is in every page (e.g. layout: post, draft: false) */
  fixedFields: Array<{ key: string; value: string }>;
  /** Fields of the note copied as is into the page; they take precedence over fixed fields */
  copiedFields: string[];
  /**
   * Optional deploy trigger: after publishing, tick the "- [ ] <label>" checkbox of this note
   * (for sites whose build is started by a watcher of that note)
   */
  deployNote: string;
  deployCheckbox: string;
}

export const DEFAULT_STATIC_SITE: StaticSiteConfig = {
  enabled: false,
  baseUrl: "",
  sections: [],
  imagesFolder: "",
  imagesUrlPrefix: "/images/",
  keepVaultImages: false,
  maxImageMB: 5,
  fields: {
    title: "title",
    section: "",
    date: "date",
    description: "description",
    cover: "image"
  },
  dateFormat: "YYYY-MM-DD",
  fixedFields: [],
  copiedFields: [],
  deployNote: "",
  deployCheckbox: ""
};
