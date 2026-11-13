import { describe, it, expect } from "vitest";
import {
  ImageCollector,
  LinkResolver,
  buildPageFile,
  convertBody,
  copiedValue,
  formatDate,
  isValidSlug,
  normalizeUrlPrefix,
  pageFields,
  pageUrl,
  slugify,
  tickCheckbox,
  yamlScalar
} from "../src/staticsite/converter";
import { DEFAULT_STATIC_SITE, StaticSiteConfig } from "../src/staticsite/types";

const images: Record<string, string> = {
  "photo.png": "Assets/Photo Été.png",
  "Assets/schema.webp": "Assets/schema.webp",
  "img/a b.jpg": "Notes/img/a b.jpg"
};
const pages: Record<string, string> = { "Autre article": "/blog/autre-article/" };

const resolver: LinkResolver = {
  resolveImage: (link: string) => images[link] ?? null,
  resolvePage: (link: string) => pages[link] ?? null
};

const convert = (md: string, slug = "s", prefix = "/images/") => {
  const collector = new ImageCollector(slug, prefix);
  return { ...convertBody(md, resolver, collector), images: collector.images };
};

describe("slugify", () => {
  it("strips accents, ligatures, spaces and punctuation", () => {
    expect(slugify("L'Œuvre de l'écoute : être là !")).toBe("l-oeuvre-de-l-ecoute-etre-la");
    expect(slugify("  Straße & Co — 2026  ")).toBe("strasse-co-2026");
  });

  it("produces valid slugs", () => {
    expect(isValidSlug(slugify("Ça va ?"))).toBe(true);
    expect(isValidSlug("Avec Majuscule")).toBe(false);
    expect(isValidSlug("double--tiret")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });
});

describe("URLs", () => {
  it("normalizes prefixes and builds page URLs", () => {
    expect(normalizeUrlPrefix("blog")).toBe("/blog/");
    expect(normalizeUrlPrefix("/a/b//")).toBe("/a/b/");
    expect(normalizeUrlPrefix("")).toBe("/");
    expect(pageUrl("https://ex.com/", "blog", "mon-texte")).toBe("https://ex.com/blog/mon-texte/");
    expect(pageUrl("", "/", "mon-texte")).toBe("/mon-texte/");
  });
});

describe("convertBody", () => {
  it("removes the frontmatter and comments", () => {
    const { body } = convert("---\ntitle: x\n---\nA %%secret%% B\n%%\nmulti\n%%\nC");
    expect(body).toBe("A  B\n\nC\n");
  });

  it("rewrites image embeds and local images to the site's image folder", () => {
    const md = "![[photo.png|300]]\n![[Assets/schema.webp|Un schéma]]\n![alt](img/a%20b.jpg \"t\")";
    const { body, images: found } = convert(md, "mon-article", "images/obsidian");
    expect(body).toBe(
      "![](/images/obsidian/mon-article/photo-ete.png)\n" +
        "![Un schéma](/images/obsidian/mon-article/schema.webp)\n" +
        "![alt](/images/obsidian/mon-article/a-b.jpg \"t\")\n"
    );
    expect(found.map((i) => [i.vaultPath, i.sitePath])).toEqual(
      expect.arrayContaining([
        ["Assets/Photo Été.png", "mon-article/photo-ete.png"],
        ["Assets/schema.webp", "mon-article/schema.webp"],
        ["Notes/img/a b.jpg", "mon-article/a-b.jpg"]
      ])
    );
    expect(found).toHaveLength(3);
  });

  it("keeps remote images and reuses one name per image", () => {
    const { body, images: found } = convert("![x](https://ex.com/a.png)\n![[photo.png]] ![[photo.png]]");
    expect(body).toContain("![x](https://ex.com/a.png)");
    expect(found).toHaveLength(1);
  });

  it("warns about missing images and embedded notes", () => {
    const { body, warnings } = convert("![[absent.png]]\n![[Une note]]\nTexte");
    expect(body).toBe("Texte\n");
    expect(warnings).toHaveLength(2);
  });

  it("links to published pages and turns other links into text", () => {
    const md =
      "[[Autre article]], [[Autre article|celui-ci]], [[Note privée]], " +
      "[[Note privée#Partie|ici]], [lien](Autre%20article.md), [web](https://ex.com)";
    expect(convert(md).body).toBe(
      "[Autre article](/blog/autre-article/), [celui-ci](/blog/autre-article/), Note privée, " +
        "ici, [lien](/blog/autre-article/), [web](https://ex.com)\n"
    );
  });

  it("drops highlights and callout markers", () => {
    const md = "Un ==mot== fort.\n\n> [!note] Attention\n> texte\n\n> [!tip]\n> astuce";
    expect(convert(md).body).toBe("Un mot fort.\n\n> **Attention**\n> texte\n\n>\n> astuce\n");
  });

  it("leaves code untouched", () => {
    const md = "```md\n![[photo.png]] [[Autre article]] %%x%%\n```\n`[[Autre article]]` et [[Autre article]]";
    expect(convert(md).body).toBe(
      "```md\n![[photo.png]] [[Autre article]] %%x%%\n```\n" +
        "`[[Autre article]]` et [Autre article](/blog/autre-article/)\n"
    );
  });

  it("keeps Obsidian image embeds untouched when keepImages is set (still converts page links)", () => {
    const collector = new ImageCollector("mon-article", "/images/");
    const md = "![[_Assets/Illustrations/photo.png]]\n![alt](img/a%20b.jpg)\n[[Autre article]]";
    const { body } = convertBody(md, resolver, collector, true);
    expect(body).toBe(
      "![[_Assets/Illustrations/photo.png]]\n" +
        "![alt](img/a%20b.jpg)\n" +
        "[Autre article](/blog/autre-article/)\n"
    );
    expect(collector.images).toHaveLength(0); // aucune image collectée, donc rien à copier
  });
});

describe("page file", () => {
  const config: StaticSiteConfig = {
    ...DEFAULT_STATIC_SITE,
    fields: { title: "titre", section: "rubrique", date: "date", description: "description", cover: "image" },
    fixedFields: [
      { key: "type", value: "article" },
      { key: "statut", value: "publie" }
    ]
  };

  it("maps fields and writes fixed fields", () => {
    const file = buildPageFile(
      pageFields(config, {
        title: 'Le "vrai" titre',
        section: "therapie",
        date: "2026-11-07",
        description: "Résumé : court",
        cover: "/images/s/c.webp"
      }),
      "Corps\n"
    );
    expect(file).toBe(
      "---\n" +
        'titre: "Le \\"vrai\\" titre"\n' +
        "rubrique: therapie\n" +
        "type: article\n" +
        "statut: publie\n" +
        "date: 2026-11-07\n" +
        'description: "Résumé : court"\n' +
        "image: /images/s/c.webp\n" +
        "---\n" +
        "Corps\n"
    );
  });

  it("omits empty field names and optional values", () => {
    const file = buildPageFile(
      pageFields(DEFAULT_STATIC_SITE, { title: "T", section: "blog", date: "2026-01-02" }),
      "B\n"
    );
    expect(file).toBe("---\ntitle: T\ndate: 2026-01-02\n---\nB\n");
  });

  it("quotes ambiguous YAML values", () => {
    expect(yamlScalar("true")).toBe('"true"');
    expect(yamlScalar("a: b")).toBe('"a: b"');
    expect(yamlScalar("post")).toBe("post");
  });
});

describe("formatDate", () => {
  it("applies YYYY, MM, DD tokens", () => {
    expect(formatDate("YYYY-MM-DD", new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatDate("DD/MM/YYYY", new Date(2026, 0, 5))).toBe("05/01/2026");
  });
});

describe("tickCheckbox", () => {
  const note = "# Publier\n\n- [ ] Mettre en ligne re.liance.art\n- [ ] Mettre en ligne noos-ia.com\n";

  it("ticks only the labelled checkbox", () => {
    expect(tickCheckbox(note, "Mettre en ligne re.liance.art")).toBe(
      "# Publier\n\n- [x] Mettre en ligne re.liance.art\n- [ ] Mettre en ligne noos-ia.com\n"
    );
  });

  it("keeps a ticked checkbox and reports a missing one", () => {
    expect(tickCheckbox("* [X] Deploy (prod)", "Deploy (prod)")).toBe("* [x] Deploy (prod)");
    expect(tickCheckbox(note, "Mettre en ligne re.liance")).toBeNull();
  });
});

describe("copied fields", () => {
  it("converts note values", () => {
    expect(copiedValue("x")).toEqual({ value: "x" });
    expect(copiedValue("")).toBeNull();
    expect(copiedValue(25)).toEqual({ value: "25", raw: true });
    expect(copiedValue(["a-b", "c d"])).toEqual({ value: '[a-b, "c d"]', raw: true });
    expect(copiedValue({ a: 1 })).toBeNull();
  });

  it("override fixed fields", () => {
    const config: StaticSiteConfig = {
      ...DEFAULT_STATIC_SITE,
      fields: { ...DEFAULT_STATIC_SITE.fields, section: "rubrique" },
      fixedFields: [{ key: "type", value: "article" }]
    };
    const file = buildPageFile(
      pageFields(config, {
        title: "T",
        section: "cnv",
        date: "2026-01-02",
        copied: [
          { key: "type", value: "exercice" },
          { key: "article", value: "mon-article" }
        ]
      }),
      ""
    );
    expect(file).toBe("---\ntitle: T\nrubrique: cnv\ntype: exercice\narticle: mon-article\ndate: 2026-01-02\n---\n");
  });
});
