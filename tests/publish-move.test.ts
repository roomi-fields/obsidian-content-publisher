import { describe, it, expect } from "vitest";
import { TFile, TFolder } from "obsidian";
import { StaticSitePublisher } from "../src/staticsite/publisher";
import { DEFAULT_STATIC_SITE, StaticSiteConfig } from "../src/staticsite/types";

/** In-memory note, recognised by the publisher's `instanceof TFile` checks */
class FakeFile extends TFile {
  override basename: string;
  override stat = { size: 0, ctime: 0, mtime: 0 };
  data: string;
  frontmatter: Record<string, unknown>;
  constructor(path: string, data: string, frontmatter: Record<string, unknown> = {}) {
    super();
    this.path = path;
    this.data = data;
    this.frontmatter = frontmatter;
    this.basename = path.split("/").pop()!.replace(/\.md$/, "");
  }
}

function makeApp(files: FakeFile[]) {
  const map = new Map(files.map((f) => [f.path, f]));
  const folders = new Set<string>();
  const trashed: string[] = [];
  const vault = {
    getAbstractFileByPath(p: string) {
      if (map.has(p)) return map.get(p)!;
      if (folders.has(p)) return Object.assign(new TFolder(), { path: p, children: [] });
      return null;
    },
    async read(f: FakeFile) {
      return f.data;
    },
    async modify(f: FakeFile, content: string) {
      f.data = content;
    },
    async create(p: string, content: string) {
      const f = new FakeFile(p, content);
      map.set(p, f);
      return f;
    },
    async createFolder(p: string) {
      folders.add(p);
    }
  };
  const app = {
    vault,
    fileManager: {
      async trashFile(f: FakeFile) {
        map.delete(f.path);
        trashed.push(f.path);
      }
    },
    metadataCache: {
      getFileCache(f: FakeFile) {
        return { frontmatter: f.frontmatter };
      },
      getFirstLinkpathDest() {
        return null;
      }
    }
  };
  return { app: app as never, map, trashed };
}

const config: StaticSiteConfig = {
  ...DEFAULT_STATIC_SITE,
  enabled: true,
  baseUrl: "https://re.liance.art",
  sections: [{ name: "cnv", folder: "Site/CNV", urlPrefix: "/cnv/" }],
  fixedFields: [{ key: "statut", value: "publie" }]
};

describe("StaticSitePublisher.publish — déplace, ne double pas", () => {
  it("écrit la page dans le dossier de section et supprime le brouillon source", async () => {
    const draft = new FakeFile("Brouillons/mon-article.md", "---\ntitle: Mon article\n---\n\nCorps du texte.", {
      title: "Mon article"
    });
    const { app, map, trashed } = makeApp([draft]);
    const publisher = new StaticSitePublisher(app, config);

    const result = await publisher.publish(draft, { section: "cnv", slug: "mon-article", title: "Mon article" });

    expect(map.has("Site/CNV/mon-article.md")).toBe(true); // page créée à sa place
    expect(map.has("Brouillons/mon-article.md")).toBe(false); // brouillon déplacé, pas dupliqué
    expect(trashed).toEqual(["Brouillons/mon-article.md"]);
    expect(result.url).toBe("https://re.liance.art/cnv/mon-article/");
    const page = map.get("Site/CNV/mon-article.md")!;
    expect(page.data).toContain("statut: publie");
    expect(page.data).toContain("Corps du texte.");
  });

  it("republie une page en place sans la supprimer", async () => {
    const page = new FakeFile("Site/CNV/mon-article.md", "---\ntitle: Mon article\n---\n\nAncien corps.", {
      title: "Mon article"
    });
    const { app, map, trashed } = makeApp([page]);
    const publisher = new StaticSitePublisher(app, config);

    await publisher.publish(page, { section: "cnv", slug: "mon-article", title: "Mon article" });

    expect(map.has("Site/CNV/mon-article.md")).toBe(true);
    expect(trashed).toEqual([]); // source == destination : rien n'est supprimé
  });

  it("refuse une adresse déjà occupée par une autre page", async () => {
    const page = new FakeFile("Site/CNV/mon-article.md", "x", { title: "Mon article" });
    const draft = new FakeFile("Brouillons/autre.md", "y", { title: "Autre" });
    const { app, map } = makeApp([page, draft]);
    const publisher = new StaticSitePublisher(app, config);

    await expect(
      publisher.publish(draft, { section: "cnv", slug: "mon-article", title: "Autre" })
    ).rejects.toThrow(/already exists/);
    expect(map.has("Brouillons/autre.md")).toBe(true); // brouillon intact après l'échec
  });

  it("garde les embeds Obsidian quand keepVaultImages est activé", async () => {
    const draft = new FakeFile(
      "Brouillons/mon-article.md",
      "---\ntitle: Mon article\n---\n\n![[_Assets/Illustrations/photo.png]]\n\nCorps.",
      { title: "Mon article" }
    );
    const { app, map } = makeApp([draft]);
    const publisher = new StaticSitePublisher(app, { ...config, keepVaultImages: true });

    await publisher.publish(draft, {
      section: "cnv",
      slug: "mon-article",
      title: "Mon article",
      coverImage: "_Assets/Illustrations/photo.png"
    });

    const page = map.get("Site/CNV/mon-article.md")!;
    expect(page.data).toContain("![[_Assets/Illustrations/photo.png]]"); // embed intact
    expect(page.data).toContain('image: "[[_Assets/Illustrations/photo.png]]"'); // cadre en lien Obsidian
    expect(page.data).not.toContain("/images/"); // aucune URL réécrite
    expect([...map.keys()].some((p) => p.includes("Images") || /\.(png|webp|jpg)$/.test(p))).toBe(false); // aucune image copiée
  });
});
