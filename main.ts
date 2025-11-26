import {
  App,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting
} from "obsidian";
import { Logger, LogLevel, createLogger } from "./src/utils/logger";
import { SubstackAPI } from "./src/substack/api";
import { SubstackPostComposer } from "./src/substack/PostComposer";
import { SubstackAuth } from "./src/substack/auth";

interface SubstackPublisherSettings {
  devMode: boolean;
  logLevel: LogLevel;
  substackCookie: string;
  publications: string[];
}

const DEFAULT_SETTINGS: SubstackPublisherSettings = {
  devMode: false,
  logLevel: LogLevel.ERROR,
  substackCookie: "",
  publications: []
};

export default class SubstackPublisherPlugin extends Plugin {
  settings!: SubstackPublisherSettings;
  logger!: Logger | ReturnType<typeof createLogger>;

  override async onload() {
    await this.loadSettings();

    this.logger = createLogger(
      "Substack Publisher",
      this.settings.devMode,
      this.settings.logLevel
    );

    if ("setApp" in this.logger) {
      this.logger.setApp(this.app);
    }

    this.logger.logPluginLoad();

    const ribbonIconEl = this.addRibbonIcon(
      "send",
      "Publish to substack",
      () => {
        this.publishToSubstack();
      }
    );

    ribbonIconEl.addClass("substack-ribbon-class");

    this.addCommand({
      id: "publish-to-substack",
      name: "Publish to substack",
      callback: () => {
        this.publishToSubstack();
      }
    });

    this.addSettingTab(new SubstackPublisherSettingTab(this.app, this));
  }

  override onunload() {
    this.logger.logPluginUnload();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    if (this.logger) {
      this.logger = createLogger(
        "Substack Publisher",
        this.settings.devMode,
        this.settings.logLevel
      );
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);

    if (this.logger) {
      this.logger = createLogger(
        "Substack Publisher",
        this.settings.devMode,
        this.settings.logLevel
      );
    }
  }

  private publishToSubstack(): void {
    this.logger.logCommandExecution("publish-to-substack");

    if (!this.settings.substackCookie) {
      new Notice("Please configure your substack authentication in settings first.");
      return;
    }

    if (this.settings.publications.length === 0) {
      new Notice("Please add at least one publication in settings first.");
      return;
    }

    const api = new SubstackAPI(this.settings.substackCookie);

    const composer = new SubstackPostComposer(
      this.app,
      api,
      this.settings.publications,
      this.logger
    );
    composer.open();
  }
}

class SubstackPublisherSettingTab extends PluginSettingTab {
  plugin: SubstackPublisherPlugin;

  constructor(app: App, plugin: SubstackPublisherPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl).setName("Authentication").setHeading();

    // Login button (desktop only)
    if (Platform.isDesktop) {
      const authStatus = this.plugin.settings.substackCookie
        ? "✓ Logged in"
        : "Not logged in";

      new Setting(containerEl)
        .setName("Login")
        .setDesc(`${authStatus}. Click to open Substack login window and automatically capture your session`)
        .addButton((button) => {
          button
            .setButtonText(this.plugin.settings.substackCookie ? "Re-login" : "Login")
            .setCta()
            .onClick(() => {
              const auth = new SubstackAuth((cookie) => {
                this.plugin.settings.substackCookie = cookie;
                void this.plugin.saveSettings().then(() => {
                  this.display(); // Refresh UI
                });
              });
              auth.login();
            });
        });
    }

    // Manual cookie input (always available as fallback)
    const manualSetting = new Setting(containerEl)
      .setName("Manual cookie entry")
      .setDesc(
        Platform.isDesktop
          ? "Alternative: paste your cookie manually if auto-login doesn't work"
          : "Paste your Substack session cookie (substack.sid) from browser DevTools → Application → Cookies"
      )
      .addText((text) => {
        text
          .setPlaceholder("Enter cookie value")
          .setValue(this.plugin.settings.substackCookie)
          .onChange(async (value) => {
            this.plugin.settings.substackCookie = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.addClass("substack-input-full-width");
      });

    // On desktop, make manual entry less prominent
    if (Platform.isDesktop) {
      manualSetting.settingEl.addClass("substack-setting-muted");
    }

    new Setting(containerEl).setName("Publication").setHeading();

    new Setting(containerEl)
      .setName("Subdomains")
      .setDesc(
        "Comma-separated list of your publication subdomains (e.g., mypub, anotherpub)"
      )
      .addText((text) => {
        text
          .setPlaceholder("your-publication")
          .setValue(this.plugin.settings.publications.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.publications = value
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl).setName("Advanced").setHeading();

    new Setting(containerEl)
      .setName("Dev mode")
      .setDesc(
        "Enable detailed logging for debugging. Only enable when troubleshooting issues."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.devMode)
          .onChange(async (value) => {
            this.plugin.settings.devMode = value;
            await this.plugin.saveSettings();

            const status = value ? "enabled" : "disabled";
            const message = status === "enabled" ? "Check console for detailed logs." : "";
            new Notice(`Dev mode ${status}. ${message}`);

            this.display();
          })
      );

    if (this.plugin.settings.devMode) {
      new Setting(containerEl)
        .setName("Log level")
        .setDesc("Set the minimum log level to display")
        .addDropdown((dropdown) =>
          dropdown
            .addOption(LogLevel.DEBUG.toString(), "Debug")
            .addOption(LogLevel.INFO.toString(), "Info")
            .addOption(LogLevel.WARN.toString(), "Warning")
            .addOption(LogLevel.ERROR.toString(), "Error")
            .setValue(this.plugin.settings.logLevel.toString())
            .onChange(async (value) => {
              this.plugin.settings.logLevel = parseInt(value) as LogLevel;
              await this.plugin.saveSettings();

              if (this.plugin.logger && "setLogLevel" in this.plugin.logger) {
                this.plugin.logger.setLogLevel(this.plugin.settings.logLevel);
              }
            })
        );
    }

    // Version info
    const versionSection = containerEl.createDiv();
    versionSection.addClass("substack-version-wrapper");

    const versionContent = versionSection.createEl("div", {
      attr: { class: "substack-version-content" }
    });

    versionContent.createEl("p", {
      text: "Substack publisher",
      attr: { class: "substack-version-name" }
    });

    versionContent.createEl("p", {
      text: "by Romain Peyrichou",
      attr: { class: "substack-version-author" }
    });

    versionContent.createEl("span", {
      text: `v${this.plugin.manifest.version}`,
      attr: { class: "substack-version-number" }
    });
  }
}
