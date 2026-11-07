import { describe, it, expect } from "vitest";
import {
  LinkResolver,
  buildArticleFile,
  convertBody,
  isValidSlug,
  slugify,
  today
} from "../src/reliance/converter";

const images: Record<string, string> = {
  "photo.png": "Assets/Photo Été.png",
  "Assets/schema.webp": "Assets/schema.webp",
  "img/a b.jpg": "Notes/img/a b.jpg"
};
const articles: Record<string, string> = { "Autre article": "/regards/autre-article/" };

const resolver: LinkResolver = {
  resolveImage: (link) => images[link] ?? null,
  resolveArticle: (link) => articles[link] ?? null
};

describe("slugify", () => {
  it("strips accents, ligatures, spaces and punctuation", () => {
    expect(slugify("L'Œuvre de l'écoute : être là !")).toBe("l-oeuvre-de-l-ecoute-etre-la");
    expect(slugify("  Thérapie & CNV — 2026  ")).toBe("therapie-cnv-2026");
  });

  it("produces valid slugs", () => {
    expect(isValidSlug(slugify("Ça va ?"))).toBe(true);
    expect(isValidSlug("Avec Majuscule")).toBe(false);
    expect(isValidSlug("double--tiret")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });
});

describe("convertBody", () => {
  it("removes the frontmatter and comments", () => {
    const { body } = convertBody("---\ntitre: x\n---\nA %%secret%% B\n%%\nmulti\n%%\nC", "s", resolver);
    expect(body).toBe("A  B\n\nC\n");
  });

  it("rewrites image embeds and local images to the site's image folder", () => {
    const md = "![[photo.png|300]]\n![[Assets/schema.webp|Un schéma]]\n![alt](img/a%20b.jpg \"t\")";
    const { body, images: found } = convertBody(md, "mon-article", resolver);
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
    const { body, images: found } = convertBody(
      "![x](https://ex.com/a.png)\n![[photo.png]] ![[photo.png]]",
      "s",
      resolver
    );
    expect(body).toContain("![x](https://ex.com/a.png)");
    expect(found).toHaveLength(1);
  });

  it("warns about missing images and embedded notes", () => {
    const { body, warnings } = convertBody("![[absent.png]]\n![[Une note]]\nTexte", "s", resolver);
    expect(body).toBe("Texte\n");
    expect(warnings).toHaveLength(2);
  });

  it("links to published articles and turns other links into text", () => {
    const md =
      "[[Autre article]], [[Autre article|celui-ci]], [[Note privée]], " +
      "[[Note privée#Partie|ici]], [lien](Autre%20article.md), [web](https://ex.com)";
    expect(convertBody(md, "s", resolver).body).toBe(
      "[Autre article](/regards/autre-article/), [celui-ci](/regards/autre-article/), Note privée, " +
        "ici, [lien](/regards/autre-article/), [web](https://ex.com)\n"
    );
  });

  it("drops highlights and callout markers", () => {
    const md = "Un ==mot== fort.\n\n> [!note] Attention\n> texte\n\n> [!tip]\n> astuce";
    expect(convertBody(md, "s", resolver).body).toBe(
      "Un mot fort.\n\n> **Attention**\n> texte\n\n>\n> astuce\n"
    );
  });

  it("leaves code untouched", () => {
    const md = "```md\n![[photo.png]] [[Autre article]] %%x%%\n```\n`[[Autre article]]` et [[Autre article]]";
    expect(convertBody(md, "s", resolver).body).toBe(
      "```md\n![[photo.png]] [[Autre article]] %%x%%\n```\n" +
        "`[[Autre article]]` et [Autre article](/regards/autre-article/)\n"
    );
  });
});

describe("buildArticleFile", () => {
  it("writes the frontmatter expected by the site", () => {
    const file = buildArticleFile(
      {
        titre: 'Le "vrai" titre',
        rubrique: "therapie",
        date: "2026-11-07",
        description: "Résumé : court",
        image: "/images/obsidian/s/c.webp"
      },
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
        'image: "/images/obsidian/s/c.webp"\n' +
        "---\n" +
        "Corps\n"
    );
  });

  it("omits optional fields", () => {
    const file = buildArticleFile({ titre: "T", rubrique: "cnv", date: "2026-01-02" }, "B\n");
    expect(file).not.toContain("description");
    expect(file).not.toContain("image");
  });
});

describe("today", () => {
  it("formats the local date", () => {
    expect(today(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
