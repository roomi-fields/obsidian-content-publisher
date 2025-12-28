import {
  App,
  Modal,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
} from "obsidian";
import { Logger, LogLevel, createLogger } from "./src/utils/logger";
import { SubstackAPI } from "./src/substack/api";
import { SubstackPostComposer } from "./src/substack/PostComposer";
import { SubstackAuth } from "./src/substack/auth";
import { SubstackAudience, SubstackSection } from "./src/substack/types";
import { WordPressAPI } from "./src/wordpress/api";
import { WordPressPostComposer } from "./src/wordpress/PostComposer";
import { WordPressCategoryMapping, WordPressServer, PolylangConfig, PolylangCategoryMapping } from "./src/wordpress/types";
import { LinkedInAPI } from "./src/linkedin/api";
import { LinkedInPostComposer } from "./src/linkedin/PostComposer";
import { LinkedInVisibility } from "./src/linkedin/types";

interface SubstackPublisherSettings {
  devMode: boolean;
  logLevel: LogLevel;
  substackCookie: string;
  publications: string[];
  defaultPublication: string;
  sections: SubstackSection[];
  defaultSectionId: number | null;
  defaultAudience: SubstackAudience;
  defaultTags: string[];
  paidSubscribersEnabled: boolean;
  defaultAddWordPressLink: boolean;
  // WordPress settings (legacy - single server)
  wordpressEnabled: boolean;
  wordpressBaseUrl: string;
  wordpressUsername: string;
  wordpressPassword: string;
  wordpressCategoryPageIds: WordPressCategoryMapping;
  wordpressDefaultCategory: string;
  // WordPress multi-server settings
  wordpressServers: WordPressServer[];
  wordpressDefaultServerId: string;
  // LinkedIn settings
  linkedinEnabled: boolean;
  linkedinAccessToken: string;
  linkedinPersonId: string;
  linkedinDefaultVisibility: LinkedInVisibility;
}

const DEFAULT_SETTINGS: SubstackPublisherSettings = {
  devMode: false,
  logLevel: LogLevel.ERROR,
  substackCookie: "",
  publications: [],
  defaultPublication: "",
  sections: [],
  defaultSectionId: null,
  defaultAudience: "everyone",
  defaultTags: [],
  paidSubscribersEnabled: false,
  defaultAddWordPressLink: false,
  // WordPress defaults - Category IDs for articles
  wordpressEnabled: false,
  wordpressBaseUrl: "",
  wordpressUsername: "",
  wordpressPassword: "",
  wordpressCategoryPageIds: {},
  wordpressDefaultCategory: "",
  // Multi-server defaults
  wordpressServers: [],
  wordpressDefaultServerId: "",
  // LinkedIn defaults
  linkedinEnabled: false,
  linkedinAccessToken: "",
  linkedinPersonId: "",
  linkedinDefaultVisibility: "PUBLIC",
};

export default class SubstackPublisherPlugin extends Plugin {
  settings!: SubstackPublisherSettings;
  logger!: Logger | ReturnType<typeof createLogger>;

  override async onload() {
    await this.loadSettings();

    this.logger = createLogger(
      "Content Publisher",
      this.settings.devMode,
      this.settings.logLevel,
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
      },
    );

    ribbonIconEl.addClass("substack-ribbon-class");

    // WordPress ribbon icon (only if enabled)
    if (this.settings.wordpressEnabled) {
      const wpRibbonIconEl = this.addRibbonIcon(
        "globe",
        "Publish to WordPress",
        () => {
          this.publishToWordPress();
        },
      );
      wpRibbonIconEl.addClass("wordpress-ribbon-class");

      // Move WordPress icon to bottom too
      this.app.workspace.onLayoutReady(() => {
        setTimeout(() => {
          wpRibbonIconEl.parentElement?.appendChild(wpRibbonIconEl);
        }, 100);
      });
    }

    // LinkedIn ribbon icon (only if enabled)
    if (this.settings.linkedinEnabled) {
      const liRibbonIconEl = this.addRibbonIcon(
        "linkedin",
        "Publish to LinkedIn",
        () => {
          this.publishToLinkedIn();
        },
      );
      liRibbonIconEl.addClass("linkedin-ribbon-class");

      // Move LinkedIn icon to bottom too
      this.app.workspace.onLayoutReady(() => {
        setTimeout(() => {
          liRibbonIconEl.parentElement?.appendChild(liRibbonIconEl);
        }, 100);
      });
    }

    // Move icon to bottom of ribbon after layout is ready
    this.app.workspace.onLayoutReady(() => {
      setTimeout(() => {
        ribbonIconEl.parentElement?.appendChild(ribbonIconEl);
      }, 100);
    });

    this.addCommand({
      id: "publish-to-substack",
      name: "Publish to substack",
      callback: () => {
        this.publishToSubstack();
      },
    });

    this.addCommand({
      id: "publish-to-wordpress",
      name: "Publish to WordPress",
      callback: () => {
        this.publishToWordPress();
      },
    });

    this.addCommand({
      id: "publish-to-linkedin",
      name: "Publish to LinkedIn",
      callback: () => {
        this.publishToLinkedIn();
      },
    });

    this.addSettingTab(new SubstackPublisherSettingTab(this.app, this));
  }

  override onunload() {
    this.logger.logPluginUnload();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Migration: convert old single-server config to multi-server
    if (
      this.settings.wordpressBaseUrl &&
      this.settings.wordpressServers.length === 0
    ) {
      const legacyServer: WordPressServer = {
        id: "legacy",
        name: "WordPress",
        baseUrl: this.settings.wordpressBaseUrl,
        username: this.settings.wordpressUsername,
        password: this.settings.wordpressPassword,
        categoryPageIds: this.settings.wordpressCategoryPageIds,
        defaultCategory: this.settings.wordpressDefaultCategory,
      };
      this.settings.wordpressServers = [legacyServer];
      this.settings.wordpressDefaultServerId = "legacy";
      // Clear legacy fields
      this.settings.wordpressBaseUrl = "";
      this.settings.wordpressUsername = "";
      this.settings.wordpressPassword = "";
      this.settings.wordpressCategoryPageIds = {};
      this.settings.wordpressDefaultCategory = "";
      await this.saveData(this.settings);
    }

    if (this.logger) {
      this.logger = createLogger(
        "Content Publisher",
        this.settings.devMode,
        this.settings.logLevel,
      );
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);

    if (this.logger) {
      this.logger = createLogger(
        "Content Publisher",
        this.settings.devMode,
        this.settings.logLevel,
      );
    }
  }

  private publishToSubstack(): void {
    this.logger.logCommandExecution("publish-to-substack");

    if (!this.settings.substackCookie) {
      new Notice(
        "Please configure your substack authentication in settings first.",
      );
      return;
    }

    if (this.settings.publications.length === 0) {
      new Notice(
        "Please click 'refresh' in settings to fetch your publications.",
      );
      return;
    }

    const api = new SubstackAPI(this.settings.substackCookie);

    const composer = new SubstackPostComposer(
      this.app,
      api,
      this.settings.publications,
      this.logger,
      {
        defaultPublication:
          this.settings.defaultPublication ||
          this.settings.publications[0] ||
          "",
        defaultSectionId: this.settings.defaultSectionId,
        defaultAudience: this.settings.defaultAudience,
        defaultTags: this.settings.defaultTags,
        paidSubscribersEnabled: this.settings.paidSubscribersEnabled,
        defaultAddWordPressLink: this.settings.defaultAddWordPressLink,
        onWordPressLinkPreferenceChange: (value: boolean) => {
          this.settings.defaultAddWordPressLink = value;
          void this.saveSettings();
        },
      },
    );
    composer.open();
  }

  private publishToWordPress(): void {
    this.logger.logCommandExecution("publish-to-wordpress");

    if (!this.settings.wordpressEnabled) {
      new Notice("WordPress publishing is not enabled. Enable it in settings.");
      return;
    }

    if (this.settings.wordpressServers.length === 0) {
      new Notice("Please configure at least one WordPress server in settings.");
      return;
    }

    // Check all servers have passwords
    const serversWithoutPassword = this.settings.wordpressServers.filter(s => !s.password);
    if (serversWithoutPassword.length > 0) {
      new Notice(`Please configure passwords for: ${serversWithoutPassword.map(s => s.name).join(", ")}`);
      return;
    }

    const composer = new WordPressPostComposer(this.app, this.logger, {
      servers: this.settings.wordpressServers,
      defaultServerId: this.settings.wordpressDefaultServerId,
    });
    composer.open();
  }

  private publishToLinkedIn(): void {
    this.logger.logCommandExecution("publish-to-linkedin");

    if (!this.settings.linkedinEnabled) {
      new Notice("LinkedIn publishing is not enabled. Enable it in settings.");
      return;
    }

    if (!this.settings.linkedinAccessToken) {
      new Notice("Please configure your LinkedIn access token in settings.");
      return;
    }

    if (!this.settings.linkedinPersonId) {
      new Notice("Please configure your LinkedIn Person ID in settings.");
      return;
    }

    const api = new LinkedInAPI(
      this.settings.linkedinAccessToken,
      this.settings.linkedinPersonId,
    );

    const composer = new LinkedInPostComposer(this.app, api, this.logger, {
      defaultVisibility: this.settings.linkedinDefaultVisibility,
    });
    composer.open();
  }

  /**
   * Get all configured WordPress servers
   */
  getWordPressServers(): WordPressServer[] {
    return this.settings.wordpressServers;
  }

  /**
   * Get the default WordPress server
   */
  getDefaultWordPressServer(): WordPressServer | undefined {
    return this.settings.wordpressServers.find(
      (s) => s.id === this.settings.wordpressDefaultServerId,
    );
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
        .setDesc(
          `${authStatus}. Click to open Substack login window and automatically capture your session`,
        )
        .addButton((button) => {
          button
            .setButtonText(
              this.plugin.settings.substackCookie ? "Re-login" : "Login",
            )
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
          : "Paste your Substack session cookie (substack.sid) from browser DevTools → Application → Cookies",
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

    new Setting(containerEl).setName("Defaults").setHeading();

    // Refresh button to fetch publications and sections
    new Setting(containerEl)
      .setName("Refresh from substack")
      .setDesc("Fetch your publications and sections from substack")
      .addButton((button) => {
        button.setButtonText("↻ refresh").onClick(async () => {
          if (!this.plugin.settings.substackCookie) {
            new Notice("Please login first.");
            return;
          }

          button.setButtonText("...");
          button.setDisabled(true);

          try {
            const api = new SubstackAPI(this.plugin.settings.substackCookie);

            // Fetch publications with paid status info
            const publicationsInfo = await api.getUserPublicationsWithInfo();
            if (publicationsInfo.length > 0) {
              this.plugin.settings.publications = publicationsInfo.map(
                (p) => p.subdomain,
              );

              // Auto-detect paid subscriptions for the default publication
              const defaultPubInfo =
                publicationsInfo.find(
                  (p) =>
                    p.subdomain === this.plugin.settings.defaultPublication,
                ) || publicationsInfo[0];

              if (defaultPubInfo) {
                this.plugin.settings.paidSubscribersEnabled =
                  defaultPubInfo.hasPaidSubscriptions;
              }

              // Set default publication if not set or invalid
              if (
                !this.plugin.settings.defaultPublication ||
                !this.plugin.settings.publications.includes(
                  this.plugin.settings.defaultPublication,
                )
              ) {
                this.plugin.settings.defaultPublication =
                  publicationsInfo[0]?.subdomain || "";
              }
            }

            // Fetch sections for default publication
            if (this.plugin.settings.defaultPublication) {
              const sections = await api.getSections(
                this.plugin.settings.defaultPublication,
              );
              this.plugin.settings.sections = sections;
              // Set default section if not set or invalid
              const validSectionIds = sections
                .filter((s) => s.is_live)
                .map((s) => s.id);
              if (
                this.plugin.settings.defaultSectionId === null ||
                !validSectionIds.includes(this.plugin.settings.defaultSectionId)
              ) {
                // Default to first live section
                const firstLive = sections.find((s) => s.is_live);
                this.plugin.settings.defaultSectionId = firstLive?.id ?? null;
              }
            }

            await this.plugin.saveSettings();
            this.display(); // Refresh UI

            const paidStatus = this.plugin.settings.paidSubscribersEnabled
              ? "paid enabled"
              : "free only";
            new Notice(
              `Refreshed: ${this.plugin.settings.publications.length} publication(s), ${this.plugin.settings.sections.length} section(s), ${paidStatus}`,
            );
          } catch (error) {
            const msg =
              error instanceof Error ? error.message : "Unknown error";
            new Notice(`Refresh failed: ${msg}`);
          } finally {
            button.setButtonText("↻ refresh");
            button.setDisabled(false);
          }
        });
      });

    // Default Publication dropdown
    const publicationSetting = new Setting(containerEl)
      .setName("Default publication")
      .setDesc(
        this.plugin.settings.publications.length === 0
          ? "Click 'refresh' above to load your publications"
          : "Publication used by default when publishing",
      );

    if (this.plugin.settings.publications.length > 0) {
      publicationSetting.addDropdown((dropdown) => {
        for (const pub of this.plugin.settings.publications) {
          dropdown.addOption(pub, pub);
        }
        dropdown.setValue(this.plugin.settings.defaultPublication || "");
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultPublication = value;
          // Reload sections for new publication
          if (this.plugin.settings.substackCookie) {
            const api = new SubstackAPI(this.plugin.settings.substackCookie);
            this.plugin.settings.sections = await api.getSections(value);
            const firstLive = this.plugin.settings.sections.find(
              (s) => s.is_live,
            );
            this.plugin.settings.defaultSectionId = firstLive?.id ?? null;
          }
          await this.plugin.saveSettings();
          this.display(); // Refresh to update sections dropdown
        });
      });
    }

    // Default Section dropdown
    const liveSections = this.plugin.settings.sections.filter((s) => s.is_live);
    const sectionSetting = new Setting(containerEl)
      .setName("Default section")
      .setDesc(
        liveSections.length === 0
          ? "Click 'refresh' above to load your sections"
          : "Section used by default when publishing",
      );

    if (liveSections.length > 0) {
      sectionSetting.addDropdown((dropdown) => {
        for (const section of liveSections) {
          dropdown.addOption(section.id.toString(), section.name);
        }
        dropdown.setValue(
          this.plugin.settings.defaultSectionId?.toString() || "",
        );
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultSectionId = value
            ? parseInt(value)
            : null;
          await this.plugin.saveSettings();
        });
      });
    }

    // Paid subscribers toggle (informational, auto-detected)
    new Setting(containerEl)
      .setName("Paid subscribers enabled")
      .setDesc("Auto-detected from substack. Toggle manually if incorrect.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.paidSubscribersEnabled)
          .onChange(async (value) => {
            this.plugin.settings.paidSubscribersEnabled = value;
            // Reset to "everyone" if disabling paid
            if (!value) {
              this.plugin.settings.defaultAudience = "everyone";
            }
            await this.plugin.saveSettings();
            this.display(); // Refresh to update audience options
          }),
      );

    // Default Audience dropdown - only show if paid subscribers enabled
    if (this.plugin.settings.paidSubscribersEnabled) {
      new Setting(containerEl)
        .setName("Default audience")
        .setDesc("Audience used by default when publishing")
        .addDropdown((dropdown) => {
          dropdown.addOption("everyone", "Everyone");
          dropdown.addOption("only_paid", "Paid subscribers only");
          dropdown.addOption("founding", "Founding members only");
          dropdown.addOption("only_free", "Free subscribers only");
          dropdown.setValue(this.plugin.settings.defaultAudience);
          dropdown.onChange(async (value) => {
            this.plugin.settings.defaultAudience = value as SubstackAudience;
            await this.plugin.saveSettings();
          });
        });
    }

    // Default Tags
    new Setting(containerEl)
      .setName("Default tags")
      .setDesc("Tags added by default when publishing (comma-separated)")
      .addText((text) => {
        text
          .setPlaceholder("Enter tags")
          .setValue(this.plugin.settings.defaultTags.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.defaultTags = value
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          });
      });

    // Add WordPress link in footer (default)
    new Setting(containerEl)
      .setName("Add WordPress link by default")
      .setDesc("When enabled, the WordPress link checkbox will be checked by default (if wordpress_url exists in frontmatter)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.defaultAddWordPressLink)
          .onChange(async (value) => {
            this.plugin.settings.defaultAddWordPressLink = value;
            await this.plugin.saveSettings();
          }),
      );

    // WordPress Section
    new Setting(containerEl).setName("WordPress").setHeading();

    new Setting(containerEl)
      .setName("Enable WordPress")
      .setDesc("Enable publishing to WordPress (shows WordPress button in ribbon)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.wordpressEnabled)
          .onChange(async (value) => {
            this.plugin.settings.wordpressEnabled = value;
            await this.plugin.saveSettings();
            new Notice(
              value
                ? "WordPress enabled. Reload Obsidian to see the ribbon button."
                : "WordPress disabled.",
            );
            this.display();
          }),
      );

    if (this.plugin.settings.wordpressEnabled) {
      // Default server dropdown (if multiple servers)
      const servers = this.plugin.settings.wordpressServers;
      if (servers.length > 1) {
        new Setting(containerEl)
          .setName("Default server")
          .setDesc("Server used by default when publishing")
          .addDropdown((dropdown) => {
            for (const server of servers) {
              dropdown.addOption(server.id, server.name);
            }
            dropdown.setValue(this.plugin.settings.wordpressDefaultServerId || "");
            dropdown.onChange(async (value) => {
              this.plugin.settings.wordpressDefaultServerId = value;
              await this.plugin.saveSettings();
            });
          });
      }

      // Add server button
      new Setting(containerEl)
        .setName("Add server")
        .setDesc("Add a new WordPress server configuration")
        .addButton((button) => {
          button.setButtonText("+ Add server").onClick(() => {
            const newServer: WordPressServer = {
              id: `server-${Date.now()}`,
              name: `WordPress ${servers.length + 1}`,
              baseUrl: "",
              username: "",
              password: "",
              categoryPageIds: {},
              defaultCategory: "",
            };
            this.plugin.settings.wordpressServers.push(newServer);
            if (servers.length === 0) {
              this.plugin.settings.wordpressDefaultServerId = newServer.id;
            }
            void this.plugin.saveSettings().then(() => {
              // Open edit modal directly instead of refreshing page
              this.showServerEditModal(newServer);
            });
          });
        });

      // Display each server
      for (const server of servers) {
        const serverContainer = containerEl.createDiv({ cls: "wordpress-server-container" });

        new Setting(serverContainer)
          .setName(server.name)
          .setDesc(server.baseUrl || "Not configured")
          .addButton((button) => {
            button.setButtonText("Edit").onClick(() => {
              this.showServerEditModal(server);
            });
          })
          .addButton((button) => {
            button
              .setButtonText("Test")
              .onClick(async () => {
                if (!server.baseUrl || !server.username || !server.password) {
                  new Notice("Please configure all server settings first.");
                  return;
                }
                button.setButtonText("...");
                button.setDisabled(true);
                try {
                  const api = new WordPressAPI(server.baseUrl, server.username, server.password);
                  const result = await api.testConnection();
                  if (result.success) {
                    new Notice(`${server.name}: Connection successful!`);
                  } else {
                    new Notice(`${server.name}: ${result.error}`);
                  }
                } catch (error) {
                  const msg = error instanceof Error ? error.message : "Unknown error";
                  new Notice(`${server.name}: ${msg}`);
                } finally {
                  button.setButtonText("Test");
                  button.setDisabled(false);
                }
              });
          })
          .addButton((button) => {
            button
              .setButtonText("Delete")
              .setWarning()
              .onClick(async () => {
                this.plugin.settings.wordpressServers = servers.filter((s) => s.id !== server.id);
                if (this.plugin.settings.wordpressDefaultServerId === server.id) {
                  this.plugin.settings.wordpressDefaultServerId =
                    this.plugin.settings.wordpressServers[0]?.id || "";
                }
                await this.plugin.saveSettings();
                this.display();
              });
          });
      }
    }

    // LinkedIn Section
    new Setting(containerEl).setName("LinkedIn").setHeading();

    new Setting(containerEl)
      .setName("Enable LinkedIn")
      .setDesc("Enable publishing to LinkedIn (shows LinkedIn button in ribbon)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.linkedinEnabled)
          .onChange(async (value) => {
            this.plugin.settings.linkedinEnabled = value;
            await this.plugin.saveSettings();
            new Notice(
              value
                ? "LinkedIn enabled. Reload Obsidian to see the ribbon button."
                : "LinkedIn disabled.",
            );
            this.display();
          }),
      );

    // Setup instructions - always visible so users know how to get credentials
    new Setting(containerEl)
      .setName("Step 1: Create LinkedIn app")
      .setDesc("Create an app (requires a Company Page - create an empty one if needed)")
      .addButton((btn) => btn
        .setButtonText("Open LinkedIn Developer Portal")
        .onClick(() => {
          // Use child_process to open in true system default browser
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { exec } = require("child_process");
          if (Platform.isWin) {
            exec('start "" "https://www.linkedin.com/developers/apps"');
          } else if (Platform.isMacOS) {
            exec('open "https://www.linkedin.com/developers/apps"');
          } else {
            exec('xdg-open "https://www.linkedin.com/developers/apps"');
          }
        }));

    new Setting(containerEl)
      .setName("Step 2: Request API access")
      .setDesc("In 'Products' tab, request 'Share on LinkedIn' and 'Sign In with LinkedIn using OpenID Connect'");

    new Setting(containerEl)
      .setName("Step 3: Add redirect URL")
      .setDesc("In 'Auth' tab, add this redirect URL (select and copy):")
      .addText((text) => {
        text.setValue("https://oauth.pstmn.io/v1/callback");
        text.inputEl.readOnly = true;
        text.inputEl.addClass("substack-input-full-width");
        text.inputEl.style.cursor = "text";
      });

    new Setting(containerEl)
      .setName("Step 4: Note credentials")
      .setDesc("Copy your Client ID and Client Secret from the 'Auth' tab");

    new Setting(containerEl)
      .setName("Step 5: Get access token with Postman")
      .setDesc("In Postman: New → HTTP, then go to 'Auth' tab, select Type 'OAuth 2.0', fill in the fields below:")
      .addButton((btn) => btn
        .setButtonText("Download Postman")
        .onClick(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { exec } = require("child_process");
          if (Platform.isWin) {
            exec('start "" "https://www.postman.com/downloads/"');
          } else if (Platform.isMacOS) {
            exec('open "https://www.postman.com/downloads/"');
          } else {
            exec('xdg-open "https://www.postman.com/downloads/"');
          }
        }));

    new Setting(containerEl)
      .setName("Auth URL (copy to Postman)")
      .addText((text) => {
        text.setValue("https://www.linkedin.com/oauth/v2/authorization");
        text.inputEl.readOnly = true;
        text.inputEl.addClass("substack-input-full-width");
      });

    new Setting(containerEl)
      .setName("Access Token URL (copy to Postman)")
      .addText((text) => {
        text.setValue("https://www.linkedin.com/oauth/v2/accessToken");
        text.inputEl.readOnly = true;
        text.inputEl.addClass("substack-input-full-width");
      });

    new Setting(containerEl)
      .setName("Callback URL (copy to Postman)")
      .addText((text) => {
        text.setValue("https://oauth.pstmn.io/v1/callback");
        text.inputEl.readOnly = true;
        text.inputEl.addClass("substack-input-full-width");
      });

    new Setting(containerEl)
      .setName("Scope (copy to Postman)")
      .addText((text) => {
        text.setValue("openid profile w_member_social");
        text.inputEl.readOnly = true;
        text.inputEl.addClass("substack-input-full-width");
      });

    new Setting(containerEl)
      .setName("Client Authentication (important!)")
      .setDesc("In Postman OAuth 2.0 config, set 'Client Authentication' to 'Send client credentials in body' (not header)");

    new Setting(containerEl)
      .setName("Step 6: Complete OAuth")
      .setDesc("Enter Client ID & Secret, click 'Get New Access Token', login to LinkedIn, authorize. Then click 'Use Token' and copy the Access Token value.");

    new Setting(containerEl)
      .setName("Step 7: Get Person ID (different from Client ID!)")
      .setDesc("New → HTTP GET request. In 'Auth' tab: Type 'Bearer Token', paste your access token. Send request, copy the 'sub' value (NOT Client ID).")
      .addText((text) => {
        text.setValue("https://api.linkedin.com/v2/userinfo");
        text.inputEl.readOnly = true;
        text.inputEl.addClass("substack-input-full-width");
      });

    if (this.plugin.settings.linkedinEnabled) {
      // Access token field
      const tokenDesc = document.createDocumentFragment();
      tokenDesc.appendText("Your OAuth2 access token (starts with 'AQ...')");
      new Setting(containerEl)
        .setName("Access token")
        .setDesc(tokenDesc)
        .addText((text) => {
          text
            .setPlaceholder("AQV...")
            .setValue(this.plugin.settings.linkedinAccessToken)
            .onChange(async (value) => {
              this.plugin.settings.linkedinAccessToken = value;
              await this.plugin.saveSettings();
            });
          text.inputEl.type = "password";
          text.inputEl.addClass("substack-input-full-width");
        });

      // Person ID field
      const personIdDesc = document.createDocumentFragment();
      personIdDesc.appendText("Your LinkedIn member ID (from /v2/userinfo 'sub' field, e.g., 'abc123XYZ')");
      new Setting(containerEl)
        .setName("Person ID")
        .setDesc(personIdDesc)
        .addText((text) => {
          text
            .setPlaceholder("abc123XYZ")
            .setValue(this.plugin.settings.linkedinPersonId)
            .onChange(async (value) => {
              this.plugin.settings.linkedinPersonId = value;
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName("Default visibility")
        .setDesc("Default visibility for LinkedIn posts")
        .addDropdown((dropdown) => {
          dropdown
            .addOption("PUBLIC", "Public")
            .addOption("CONNECTIONS", "Connections only")
            .setValue(this.plugin.settings.linkedinDefaultVisibility)
            .onChange(async (value) => {
              this.plugin.settings.linkedinDefaultVisibility = value as LinkedInVisibility;
              await this.plugin.saveSettings();
            });
        });

      // Test connection button
      new Setting(containerEl)
        .setName("Test connection")
        .setDesc("Test your LinkedIn API connection")
        .addButton((button) => {
          button.setButtonText("Test").onClick(async () => {
            if (!this.plugin.settings.linkedinAccessToken || !this.plugin.settings.linkedinPersonId) {
              new Notice("Please enter access token and person ID first.");
              return;
            }
            button.setButtonText("...");
            button.setDisabled(true);
            try {
              const api = new LinkedInAPI(
                this.plugin.settings.linkedinAccessToken,
                this.plugin.settings.linkedinPersonId,
              );
              const result = await api.testConnection();
              if (result.success && result.data) {
                // Check if Person ID matches the returned sub
                if (result.data.id !== this.plugin.settings.linkedinPersonId) {
                  new Notice(`Warning: Person ID mismatch! Expected: ${result.data.id}`, 10000);
                } else {
                  new Notice(`Connected as: ${result.data.localizedFirstName} ${result.data.localizedLastName}`);
                }
              } else {
                new Notice(`Connection failed: ${result.error}`);
              }
            } catch (error) {
              const msg = error instanceof Error ? error.message : "Unknown error";
              new Notice(`Error: ${msg}`);
            } finally {
              button.setButtonText("Test");
              button.setDisabled(false);
            }
          });
        });
    }

    new Setting(containerEl).setName("Advanced").setHeading();

    new Setting(containerEl)
      .setName("Dev mode")
      .setDesc(
        "Enable detailed logging for debugging. Only enable when troubleshooting issues.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.devMode)
          .onChange(async (value) => {
            this.plugin.settings.devMode = value;
            await this.plugin.saveSettings();

            const status = value ? "enabled" : "disabled";
            const message =
              status === "enabled" ? "Check console for detailed logs." : "";
            new Notice(`dev mode ${status}. ${message}`);

            this.display();
          }),
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
            }),
        );
    }

    // Version info
    const versionSection = containerEl.createDiv();
    versionSection.addClass("substack-version-wrapper");

    const versionContent = versionSection.createEl("div", {
      attr: { class: "substack-version-content" },
    });

    versionContent.createEl("p", {
      text: "Content Publisher",
      attr: { class: "substack-version-name" },
    });

    versionContent.createEl("a", {
      text: "Roomi-fields",
      href: "https://github.com/roomi-fields",
      attr: { class: "substack-version-author" },
    });

    versionContent.createEl("span", {
      text: `v${this.plugin.manifest.version}`,
      attr: { class: "substack-version-number" },
    });
  }

  private showServerEditModal(server: WordPressServer): void {
    const modal = new WordPressServerEditModal(
      this.app,
      server,
      async (updatedServer) => {
        // Update the server in the list
        const index = this.plugin.settings.wordpressServers.findIndex(
          (s) => s.id === updatedServer.id,
        );
        if (index !== -1) {
          this.plugin.settings.wordpressServers[index] = updatedServer;
          await this.plugin.saveSettings();
          this.display();
        }
      },
    );
    modal.open();
  }
}

class WordPressServerEditModal extends Modal {
  private server: WordPressServer;
  private onSave: (server: WordPressServer) => Promise<void>;
  private editedServer: WordPressServer;
  private defaultCategoryInput: HTMLInputElement | null = null;

  constructor(
    app: App,
    server: WordPressServer,
    onSave: (server: WordPressServer) => Promise<void>,
  ) {
    super(app);
    this.server = server;
    this.onSave = onSave;
    // Deep copy to avoid modifying the original server before save
    this.editedServer = JSON.parse(JSON.stringify(server));
  }

  override onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h2", { text: "Edit WordPress Server" });

    new Setting(contentEl)
      .setName("Server name")
      .setDesc("A friendly name for this server")
      .addText((text) => {
        text
          .setPlaceholder("My WordPress")
          .setValue(this.editedServer.name)
          .onChange((value) => {
            this.editedServer.name = value;
          });
      });

    new Setting(contentEl)
      .setName("Base URL")
      .setDesc("WordPress site URL (e.g., https://example.com)")
      .addText((text) => {
        text
          .setPlaceholder("https://example.com")
          .setValue(this.editedServer.baseUrl)
          .onChange((value) => {
            this.editedServer.baseUrl = value;
          });
        text.inputEl.addClass("substack-input-full-width");
      });

    new Setting(contentEl)
      .setName("Username")
      .setDesc("WordPress username")
      .addText((text) => {
        text
          .setPlaceholder("username")
          .setValue(this.editedServer.username)
          .onChange((value) => {
            this.editedServer.username = value;
          });
      });

    new Setting(contentEl)
      .setName("Application password")
      .setDesc("WordPress application password (not your login password)")
      .addText((text) => {
        text
          .setPlaceholder("xxxx xxxx xxxx xxxx")
          .setValue(this.editedServer.password)
          .onChange((value) => {
            this.editedServer.password = value;
          });
        text.inputEl.type = "password";
      });

    new Setting(contentEl)
      .setName("Default category")
      .setDesc("Category used by default when publishing")
      .addText((text) => {
        text
          .setPlaceholder("category-name")
          .setValue(this.editedServer.defaultCategory)
          .onChange((value) => {
            this.editedServer.defaultCategory = value;
          });
        this.defaultCategoryInput = text.inputEl;
      });

    // Category IDs with fetch button
    const categoryContainer = contentEl.createDiv();

    const categorySetting = new Setting(categoryContainer)
      .setName("Category IDs")
      .setDesc("JSON mapping of category names to WordPress category IDs");

    const categoryTextArea = categoryContainer.createEl("textarea", {
      cls: "wordpress-category-textarea",
      attr: { rows: "4", cols: "40", placeholder: '{"category": 123}' },
    });
    categoryTextArea.value = JSON.stringify(this.editedServer.categoryPageIds, null, 2);
    categoryTextArea.addEventListener("change", () => {
      try {
        this.editedServer.categoryPageIds = JSON.parse(categoryTextArea.value);
      } catch {
        // Invalid JSON, ignore
      }
    });

    categorySetting.addButton((button) => {
      button.setButtonText("Fetch from WP").onClick(async () => {
        if (!this.editedServer.baseUrl || !this.editedServer.username || !this.editedServer.password) {
          new Notice("Please fill in URL, username, and password first.");
          return;
        }
        button.setButtonText("...");
        button.setDisabled(true);
        try {
          const api = new WordPressAPI(
            this.editedServer.baseUrl,
            this.editedServer.username,
            this.editedServer.password,
          );
          const categories = await api.getCategories();
          if (categories.success && categories.data) {
            const catData = categories.data;
            const mapping: WordPressCategoryMapping = {};
            for (const cat of catData) {
              // Use slug as key, id as value
              mapping[cat.slug] = cat.id;
            }
            this.editedServer.categoryPageIds = mapping;
            categoryTextArea.value = JSON.stringify(mapping, null, 2);
            // Set default category to first one if empty
            const firstCat = catData[0];
            if (!this.editedServer.defaultCategory && firstCat) {
              this.editedServer.defaultCategory = firstCat.slug;
              if (this.defaultCategoryInput) {
                this.defaultCategoryInput.value = firstCat.slug;
              }
            }
            new Notice(`Fetched ${catData.length} categories`);
          } else {
            new Notice(`Failed to fetch categories: ${categories.error}`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          new Notice(`Error: ${msg}`);
        } finally {
          button.setButtonText("Fetch from WP");
          button.setDisabled(false);
        }
      });
    });

    // Polylang multilingual support section
    contentEl.createEl("h3", { text: "Polylang (Multilingual)" });

    // Initialize polylang config if not present
    if (!this.editedServer.polylang) {
      this.editedServer.polylang = {
        enabled: false,
        categoryMapping: {}
      };
    }

    new Setting(contentEl)
      .setName("Enable Polylang")
      .setDesc("Enable bilingual publishing (FR/EN) with Polylang plugin")
      .addToggle((toggle) => {
        toggle
          .setValue(this.editedServer.polylang?.enabled ?? false)
          .onChange((value) => {
            if (!this.editedServer.polylang) {
              this.editedServer.polylang = { enabled: false, categoryMapping: {} };
            }
            this.editedServer.polylang.enabled = value;
          });
      });

    // Polylang category mapping
    const polylangContainer = contentEl.createDiv();

    new Setting(polylangContainer)
      .setName("Category mapping (FR/EN)")
      .setDesc("JSON mapping of category to FR and EN IDs. Example: {\"news\": {\"fr\": 2, \"en\": 17}}");

    const polylangTextArea = polylangContainer.createEl("textarea", {
      cls: "wordpress-category-textarea",
      attr: { rows: "4", cols: "40", placeholder: '{"news": {"fr": 2, "en": 17}}' },
    });
    polylangTextArea.value = JSON.stringify(
      this.editedServer.polylang?.categoryMapping ?? {},
      null,
      2
    );
    polylangTextArea.addEventListener("change", () => {
      try {
        if (!this.editedServer.polylang) {
          this.editedServer.polylang = { enabled: false, categoryMapping: {} };
        }
        this.editedServer.polylang.categoryMapping = JSON.parse(polylangTextArea.value);
      } catch {
        // Invalid JSON, ignore
      }
    });

    const buttonContainer = contentEl.createDiv({ cls: "wordpress-modal-buttons" });

    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = buttonContainer.createEl("button", { text: "Save", cls: "mod-cta" });
    saveBtn.addEventListener("click", async () => {
      await this.onSave(this.editedServer);
      this.close();
    });
  }

  override onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
