import { Notice, Setting } from "obsidian";
import { StaticSiteConfig } from "./types";

/** Renders the "Static site" part of the settings tab */
export function renderStaticSiteSettings(
  containerEl: HTMLElement,
  config: StaticSiteConfig,
  save: () => Promise<void>,
  redisplay: () => void
): void {
  new Setting(containerEl).setName("Static site (vault folder)").setHeading();

  new Setting(containerEl)
    .setName("Enable static site")
    .setDesc(
      "Publish notes to a static site (Astro, Hugo, Jekyll, Eleventy…) whose content lives in a vault folder: " +
        "the page and its images are written there, the site's own build puts them online."
    )
    .addToggle((toggle) =>
      toggle.setValue(config.enabled).onChange(async (value) => {
        config.enabled = value;
        await save();
        new Notice(
          value ? "Static site enabled. Reload Obsidian to see the ribbon button." : "Static site disabled."
        );
        redisplay();
      })
    );

  if (!config.enabled) return;

  const text = (
    name: string,
    desc: string,
    get: () => string,
    set: (value: string) => void,
    placeholder = ""
  ): void => {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((t) =>
        t
          .setPlaceholder(placeholder)
          .setValue(get())
          .onChange(async (value) => {
            set(value.trim());
            await save();
          })
      );
  };

  text("Site address", "Public address, used for the published link", () => config.baseUrl, (v) => {
    config.baseUrl = v;
  }, "https://example.com");

  // Sections
  new Setting(containerEl)
    .setName("Sections")
    .setDesc("Name (also written in the section field), vault folder of its pages, URL prefix")
    .addButton((b) =>
      b.setButtonText("Add section").onClick(async () => {
        config.sections.push({ name: "", folder: "", urlPrefix: "/" });
        await save();
        redisplay();
      })
    );
  config.sections.forEach((section, index) => {
    new Setting(containerEl)
      .setClass("static-site-row")
      .addText((t) =>
        t.setPlaceholder("Name").setValue(section.name).onChange(async (v) => {
          section.name = v.trim();
          await save();
        })
      )
      .addText((t) =>
        t.setPlaceholder("Vault folder").setValue(section.folder).onChange(async (v) => {
          section.folder = v.trim();
          await save();
        })
      )
      .addText((t) =>
        t.setPlaceholder("/blog/").setValue(section.urlPrefix).onChange(async (v) => {
          section.urlPrefix = v.trim();
          await save();
        })
      )
      .addExtraButton((b) =>
        b
          .setIcon("trash")
          .setTooltip("Remove section")
          .onClick(async () => {
            config.sections.splice(index, 1);
            await save();
            redisplay();
          })
      );
  });

  // Images
  text("Image folder", "Vault folder the site serves images from; each page gets a sub-folder named after its address",
    () => config.imagesFolder, (v) => {
      config.imagesFolder = v;
    });
  text("Image URL prefix", "Address at which the site serves that folder", () => config.imagesUrlPrefix, (v) => {
    config.imagesUrlPrefix = v;
  }, "/images/");
  new Setting(containerEl)
    .setName("Maximum image size in megabytes")
    .setDesc("Larger images are refused; 0 for no limit")
    .addText((t) =>
      t.setValue(String(config.maxImageMB)).onChange(async (v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) {
          config.maxImageMB = n;
          await save();
        }
      })
    );

  // Frontmatter
  new Setting(containerEl)
    .setName("Page fields")
    .setDesc("Name of each field in the page header, as the site expects it; leave empty to omit the field");
  const fields: Array<[keyof StaticSiteConfig["fields"], string]> = [
    ["title", "Title"],
    ["section", "Section"],
    ["date", "Date"],
    ["description", "Description"],
    ["cover", "Cover image"]
  ];
  for (const [key, label] of fields) {
    text(label, "", () => config.fields[key], (v) => {
      config.fields[key] = v;
    });
  }
  text("Date format", "Tokens YYYY, MM, DD", () => config.dateFormat, (v) => {
    config.dateFormat = v;
  }, "YYYY-MM-DD");

  new Setting(containerEl)
    .setName("Fixed fields")
    .setDesc("Written as is in every page, for example a layout field")
    .addButton((b) =>
      b.setButtonText("Add field").onClick(async () => {
        config.fixedFields.push({ key: "", value: "" });
        await save();
        redisplay();
      })
    );
  config.fixedFields.forEach((field, index) => {
    new Setting(containerEl)
      .setClass("static-site-row")
      .addText((t) =>
        t.setPlaceholder("Field").setValue(field.key).onChange(async (v) => {
          field.key = v.trim();
          await save();
        })
      )
      .addText((t) =>
        t.setPlaceholder("Value").setValue(field.value).onChange(async (v) => {
          field.value = v.trim();
          await save();
        })
      )
      .addExtraButton((b) =>
        b
          .setIcon("trash")
          .setTooltip("Remove field")
          .onClick(async () => {
            config.fixedFields.splice(index, 1);
            await save();
            redisplay();
          })
      );
  });
}
