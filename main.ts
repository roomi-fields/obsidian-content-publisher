import {
  App,
  Modal,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
} from "obsidian";
import { Logger, LogLevel, createLogger } from "./src/utils/logger";
import { SubstackAPI } from "./src/substack/api";
import { SubstackPostComposer } from "./src/substack/PostComposer";
import { SubstackAuth } from "./src/substack/auth";
import { SubstackAudience, SubstackSection } from "./src/substack/types";
import { WordPressAPI } from "./src/wordpress/api";
import { WordPressPostComposer } from "./src/wordpress/PostComposer";
import { WordPressCategoryMapping, WordPressServer, PolylangConfig, PolylangCategoryMapping, WordPressEnluminureInfo, RankMathMeta } from "./src/wordpress/types";
import { WordPressImageHandler } from "./src/wordpress/imageHandler";
import { WikiLinkConverter } from "./src/wordpress/wikiLinkConverter";
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

    // Context menu: restart editorial pipeline
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) => {
            item
              .setTitle("(Re)lancer le pipeline éditorial")
              .setIcon("refresh-cw")
              .onClick(() => this.restartPipeline(file));
          });
        }
        // Context menu: batch publish folder to WordPress
        if (file instanceof TFolder && this.settings.wordpressEnabled) {
          menu.addItem((item) => {
            item
              .setTitle("(Re)publier le répertoire sur WP")
              .setIcon("upload")
              .onClick(() => this.batchPublishFolder(file));
          });
        }
      })
    );

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

  // Known notebooks from PipelineConfigModal
  private readonly knownNotebooks = ["cnv", "ifs", "osho", "polyvagal", "plutchik", "diamant", "psychedeliques"];
  private readonly fallbackCategories = ["regards", "psycho", "autre"];

  /**
   * Check if a notebook ID is a fallback category (no NotebookLM needed)
   */
  private isFallbackCategory(notebookId: string): boolean {
    return this.fallbackCategories.includes(notebookId.toLowerCase());
  }

  /**
   * Check if a notebook UUID is registered in MCP
   */
  private async isNotebookInMCP(uuid: string): Promise<boolean> {
    const MCP_URL = "http://localhost:3000";
    try {
      const response = await fetch(`${MCP_URL}/notebooks`);
      if (!response.ok) return false;
      const result = await response.json();
      if (!result.success || !result.data?.notebooks) return false;
      return result.data.notebooks.some((n: { url?: string }) => n.url?.includes(uuid));
    } catch {
      return false;
    }
  }

  /**
   * Get notebook config from config.md
   */
  private async getNotebookFromConfig(notebookId: string): Promise<{ uuid: string; name: string } | null> {
    const CONFIG_PATH = "_Assets/Prompts Pipeline/config.md";
    const configFile = this.app.vault.getAbstractFileByPath(CONFIG_PATH);
    if (!configFile || !(configFile instanceof TFile)) return null;

    try {
      const content = await this.app.vault.read(configFile);
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
      if (!jsonMatch || !jsonMatch[1]) return null;

      const config = JSON.parse(jsonMatch[1]);
      const nb = config.notebooks?.[notebookId.toLowerCase()];
      if (!nb) return null;

      return { uuid: nb.uuid, name: nb.name };
    } catch {
      return null;
    }
  }

  /**
   * Get all notebooks from config.md
   */
  private async getAllNotebooksFromConfig(): Promise<Array<{ id: string; name: string }>> {
    const CONFIG_PATH = "_Assets/Prompts Pipeline/config.md";
    const configFile = this.app.vault.getAbstractFileByPath(CONFIG_PATH);
    if (!configFile || !(configFile instanceof TFile)) return [];

    try {
      const content = await this.app.vault.read(configFile);
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
      if (!jsonMatch || !jsonMatch[1]) return [];

      const config = JSON.parse(jsonMatch[1]);
      const notebooks: Array<{ id: string; name: string }> = [];

      for (const [id, nb] of Object.entries(config.notebooks || {})) {
        const entry = nb as { name?: string };
        if (entry.name) {
          notebooks.push({ id, name: entry.name });
        }
      }

      return notebooks;
    } catch {
      return [];
    }
  }

  /**
   * Try to register a notebook in MCP via auto-discover
   * Returns success status and error message if failed
   */
  private async tryRegisterNotebook(id: string, url: string): Promise<{ success: boolean; error?: string }> {
    const MCP_URL = "http://localhost:3000";

    try {
      new Notice("Enregistrement du notebook...", 3000);

      const mcpResponse = await fetch(`${MCP_URL}/notebooks/auto-discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const mcpResult = await mcpResponse.json();

      if (!mcpResponse.ok || mcpResult.error) {
        const errorMsg = mcpResult.error || mcpResult.message || "Erreur inconnue";
        this.logger.warn("MCP auto-discover failed", { error: errorMsg });

        // Parse error type
        if (errorMsg.includes("access") || errorMsg.includes("inaccessible") || errorMsg.includes("permission")) {
          return { success: false, error: "Le compte MCP n'a pas accès à ce notebook" };
        } else if (errorMsg.includes("not found") || errorMsg.includes("doesn't exist")) {
          return { success: false, error: "Notebook non trouvé - vérifiez l'URL" };
        } else {
          return { success: false, error: errorMsg.substring(0, 100) };
        }
      }

      // Success - also update config.md with discovered metadata
      const notebook = mcpResult.notebook;
      if (notebook) {
        await this.updateNotebookInConfig(id, url, notebook.name, notebook.description);
        new Notice(`✓ Notebook "${notebook.name}" enregistré`, 3000);
      }

      return { success: true };

    } catch (mcpError) {
      const errorMsg = mcpError instanceof Error ? mcpError.message : String(mcpError);
      if (errorMsg.includes("fetch") || errorMsg.includes("ECONNREFUSED")) {
        return { success: false, error: "MCP NotebookLM non démarré (localhost:3000)" };
      }
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Update notebook entry in config.md (or add if not exists)
   */
  private async updateNotebookInConfig(id: string, url: string, name: string, description: string): Promise<void> {
    const CONFIG_PATH = "_Assets/Prompts Pipeline/config.md";
    const configFile = this.app.vault.getAbstractFileByPath(CONFIG_PATH);
    if (!configFile || !(configFile instanceof TFile)) return;

    const uuidMatch = url.match(/notebook\/([a-f0-9-]+)/i);
    const uuid = uuidMatch ? uuidMatch[1] : url;

    try {
      let configContent = await this.app.vault.read(configFile);
      const jsonMatch = configContent.match(/```json\n([\s\S]*?)\n```/);
      if (!jsonMatch || !jsonMatch[1]) return;

      const config = JSON.parse(jsonMatch[1]);
      config.notebooks[id] = { uuid, name, description: description || id };

      const newJson = JSON.stringify(config, null, 2);
      configContent = configContent.replace(/```json\n[\s\S]*?\n```/, "```json\n" + newJson + "\n```");
      await this.app.vault.modify(configFile, configContent);
    } catch (e) {
      this.logger.error("Failed to update config.md", e);
    }
  }

  /**
   * Add a new notebook to MCP (auto-discover) and config.md
   */
  private async addNotebookToConfig(id: string, url: string): Promise<boolean> {
    const CONFIG_PATH = "_Assets/Prompts Pipeline/config.md";
    const MCP_URL = "http://localhost:3000";

    // 1. Use auto-discover to add notebook and get metadata
    let notebook: { name: string; description: string; url: string } | null = null;
    try {
      new Notice("Découverte du notebook...", 3000);

      const mcpResponse = await fetch(`${MCP_URL}/notebooks/auto-discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const mcpResult = await mcpResponse.json();

      if (!mcpResponse.ok || mcpResult.error) {
        const errorMsg = mcpResult.error || mcpResult.message || "Erreur inconnue";
        if (errorMsg.includes("access") || errorMsg.includes("inaccessible") || errorMsg.includes("permission")) {
          new Notice(`⚠️ Le compte MCP n'a pas accès à ce notebook.\nPartagez-le avec le compte du MCP.`, 8000);
        } else if (errorMsg.includes("not found") || errorMsg.includes("doesn't exist")) {
          new Notice(`⚠️ Notebook non trouvé. Vérifiez l'URL.`, 5000);
        } else {
          new Notice(`⚠️ MCP: ${errorMsg.substring(0, 100)}`, 5000);
        }
        this.logger.warn("MCP auto-discover failed", { error: errorMsg });
        return false;
      }

      notebook = mcpResult.notebook;
      new Notice(`✓ Notebook "${notebook?.name}" découvert`, 3000);
      this.logger.info("Notebook auto-discovered", mcpResult);

    } catch (mcpError) {
      const errorMsg = mcpError instanceof Error ? mcpError.message : String(mcpError);
      if (errorMsg.includes("fetch") || errorMsg.includes("ECONNREFUSED")) {
        new Notice(`⚠️ MCP NotebookLM non démarré (localhost:3000)`, 5000);
      } else {
        new Notice(`⚠️ MCP: ${errorMsg}`, 5000);
      }
      this.logger.warn("MCP not available", mcpError);
      return false;
    }

    if (!notebook) {
      new Notice("Erreur: notebook non retourné par MCP");
      return false;
    }

    // 2. Extract UUID from URL
    const uuidMatch = url.match(/notebook\/([a-f0-9-]+)/i);
    const uuid = uuidMatch ? uuidMatch[1] : url;

    // 3. Add to config.md
    const configFile = this.app.vault.getAbstractFileByPath(CONFIG_PATH);
    if (!configFile || !(configFile instanceof TFile)) {
      new Notice(`Config non trouvée: ${CONFIG_PATH}`);
      return false;
    }

    let configContent = await this.app.vault.read(configFile);

    const jsonMatch = configContent.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch || !jsonMatch[1]) {
      new Notice("Bloc JSON non trouvé dans config.md");
      return false;
    }

    try {
      const config = JSON.parse(jsonMatch[1]);

      // Add the new notebook with auto-discovered metadata
      config.notebooks[id] = {
        uuid: uuid,
        name: notebook.name,
        description: notebook.description || id
      };

      const newJson = JSON.stringify(config, null, 2);
      configContent = configContent.replace(/```json\n[\s\S]*?\n```/, "```json\n" + newJson + "\n```");

      await this.app.vault.modify(configFile, configContent);
      this.logger.info("Notebook added to config", { id, name: notebook.name, uuid });
      return true;

    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      new Notice(`Erreur parsing config.md: ${errorMsg}`);
      this.logger.error("Failed to parse config.md", e);
      return false;
    }
  }

  /**
   * Restart the editorial pipeline for a file
   * - Checks for categorie in frontmatter, prompts if missing
   * - Extracts the base name (without pipeline suffix)
   * - Renames to {basename}_1_brouillon.md
   * - Moves to Publications/_brouillons/
   * - Injects the workflow button if not already present
   */
  private async restartPipeline(file: TFile): Promise<void> {
    const TEMPLATE_PATH = "_Assets/Prompts Pipeline/workflow-button.template.md";
    const STYLES_FOLDER = "_Assets/Prompts Pipeline/styles";
    const BROUILLONS_FOLDER = "Publications/_brouillons";
    const PIPELINE_SUFFIX_REGEX = /_\d_[a-z]+$/i;

    try {
      // 1. Scan styles/ folder to get available categories
      const stylesFolder = this.app.vault.getAbstractFileByPath(STYLES_FOLDER);
      const availableCategories: string[] = [];

      if (stylesFolder && stylesFolder instanceof TFolder) {
        for (const child of stylesFolder.children) {
          if (child instanceof TFile && child.extension === "md") {
            const match = child.basename.match(/^style-(.+)$/);
            if (match && match[1] && match[1] !== "base") {
              availableCategories.push(match[1]);
            }
          }
        }
      }

      // 2. Read file content and check for notebook/categorie
      let content = await this.app.vault.read(file);
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let hasNotebook = false;
      let hasCategorie = false;

      if (frontmatterMatch && frontmatterMatch[1]) {
        hasNotebook = /^notebook:/m.test(frontmatterMatch[1]);
        hasCategorie = /^categorie:/m.test(frontmatterMatch[1]);
      }

      // 3. If missing notebook or categorie, prompt user
      if (!hasNotebook || !hasCategorie) {
        // Get notebooks from config.md
        const availableNotebooks = await this.getAllNotebooksFromConfig();

        const config = await new Promise<PipelineConfig | null>((resolve) => {
          new PipelineConfigModal(
            this.app,
            resolve,
            availableCategories,
            availableNotebooks,
            !hasNotebook,
            !hasCategorie
          ).open();
        });

        if (!config) {
          new Notice("Opération annulée");
          return;
        }

        // 3b. If notebook specified and not a fallback category, verify it's in MCP
        if (config.notebook && !this.isFallbackCategory(config.notebook)) {
          const notebookConfig = await this.getNotebookFromConfig(config.notebook);

          // Check if notebook is in MCP (by UUID if we have it)
          const isInMCP = notebookConfig
            ? await this.isNotebookInMCP(notebookConfig.uuid)
            : false;

          if (!isInMCP) {
            if (notebookConfig) {
              // Notebook in config.md but not in MCP - try to auto-register with known UUID
              const url = `https://notebooklm.google.com/notebook/${notebookConfig.uuid}`;

              // Retry loop
              let registered = false;
              while (!registered) {
                const result = await this.tryRegisterNotebook(config.notebook, url);

                if (result.success) {
                  registered = true;
                } else {
                  // Registration failed - show options modal
                  const action = await new Promise<"retry" | "change" | "skip">((resolve) => {
                    new NotebookErrorModal(this.app, config.notebook!, result.error || "Erreur inconnue", resolve).open();
                  });

                  if (action === "retry") {
                    // Loop will retry
                    continue;
                  } else if (action === "change") {
                    // User wants to choose another notebook - abort this pipeline
                    new Notice("Relancez le pipeline pour choisir un autre notebook");
                    return;
                  } else {
                    // action === "skip" - continue without NotebookLM
                    break;
                  }
                }
              }
            } else {
              // New notebook not in config.md - ask for URL
              const notebookUrl = await new Promise<string | null>((resolve) => {
                new NewNotebookModal(this.app, config.notebook!, resolve).open();
              });

              if (notebookUrl) {
                const result = await this.tryRegisterNotebook(config.notebook, notebookUrl);
                if (!result.success) {
                  new Notice(`Notebook non ajouté: ${result.error?.substring(0, 50)}`);
                }
              }
            }
          }
        }

        // Add notebook and/or categorie to frontmatter
        let newFields = "";
        if (!hasNotebook && config.notebook) {
          newFields += `notebook: ${config.notebook}\n`;
        }
        if (!hasCategorie && config.categorie) {
          newFields += `categorie: ${config.categorie}\n`;
        }

        if (frontmatterMatch) {
          const frontmatterContent = frontmatterMatch[1];
          const newFrontmatter = `---\n${frontmatterContent}\n${newFields}---`;
          content = content.replace(/^---\n[\s\S]*?\n---/, newFrontmatter);
        } else {
          content = `---\n${newFields}---\n\n${content}`;
        }
      }

      // 4. Load the template and extract dataviewjs block
      const templateFile = this.app.vault.getAbstractFileByPath(TEMPLATE_PATH);
      if (!templateFile || !(templateFile instanceof TFile)) {
        new Notice(`Template non trouvé: ${TEMPLATE_PATH}`);
        return;
      }

      const templateContent = await this.app.vault.read(templateFile);
      const dataviewjsMatch = templateContent.match(/```dataviewjs[\s\S]*?```/);
      if (!dataviewjsMatch) {
        new Notice("Bloc dataviewjs non trouvé dans le template");
        return;
      }
      const workflowButton = dataviewjsMatch[0];

      // 4. Extract base name (without pipeline suffix)
      const basename = file.basename.replace(PIPELINE_SUFFIX_REGEX, "");

      // 5. Inject workflow button after frontmatter if not already present
      if (!content.includes("```dataviewjs")) {
        const fmMatch = content.match(/^---[\s\S]*?---\n?/);
        if (fmMatch) {
          const frontmatter = fmMatch[0];
          const restContent = content.slice(frontmatter.length);
          content = `${frontmatter}\n${workflowButton}\n\n${restContent}`;
        } else {
          content = `${workflowButton}\n\n${content}`;
        }
      }

      // 6. Extract notebook from updated content for subfolder
      const updatedFmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let notebookSubfolder = "";
      if (updatedFmMatch && updatedFmMatch[1]) {
        const notebookMatch = updatedFmMatch[1].match(/^notebook:\s*(.+)$/m);
        if (notebookMatch && notebookMatch[1]) {
          // Normalize: lowercase, no accents, alphanumeric only
          notebookSubfolder = notebookMatch[1].trim()
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        }
      }

      // 7. Create destination folder (with notebook subfolder if available)
      const destinationFolder = notebookSubfolder
        ? `${BROUILLONS_FOLDER}/${notebookSubfolder}`
        : BROUILLONS_FOLDER;

      try {
        const folderExists = this.app.vault.getAbstractFileByPath(destinationFolder);
        if (!folderExists) {
          await this.app.vault.createFolder(destinationFolder);
        }
      } catch {
        // Folder already exists, that's fine
      }

      // 8. Build destination path
      const newFileName = `${basename}_1_brouillon.md`;
      const destinationPath = `${destinationFolder}/${newFileName}`;

      // 8. Check if destination already exists
      const existingFile = this.app.vault.getAbstractFileByPath(destinationPath);
      if (existingFile && existingFile.path !== file.path) {
        new Notice(`Fichier existant: ${destinationPath}`);
        return;
      }

      // 9. Write updated content
      await this.app.vault.modify(file, content);

      // 10. Move/rename the file
      await this.app.vault.rename(file, destinationPath);

      new Notice(`✓ ${basename}`);
      this.logger.info("Pipeline restarted", {
        from: file.path,
        to: destinationPath
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`Erreur: ${errorMessage}`);
      this.logger.error("Failed to restart pipeline", error);
    }
  }

  /**
   * Batch publish all markdown files in a folder to WordPress
   * - Publishes each file only once (no duplicate updates from backlinks)
   * - Shows progress during batch
   * - Handles errors gracefully
   */
  private async batchPublishFolder(folder: TFolder): Promise<void> {
    if (!this.settings.wordpressEnabled || this.settings.wordpressServers.length === 0) {
      new Notice("WordPress n'est pas configuré");
      return;
    }

    // Collect all markdown files in folder (non-recursive)
    const mdFiles: TFile[] = [];
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === "md") {
        // Only include files that have wordpress_id (already published)
        // or have the required frontmatter for publishing
        const cache = this.app.metadataCache.getFileCache(child);
        if (cache?.frontmatter) {
          mdFiles.push(child);
        }
      }
    }

    if (mdFiles.length === 0) {
      new Notice(`Aucun fichier markdown dans ${folder.name}`);
      return;
    }

    // Show confirmation modal
    const confirmed = await new Promise<boolean>((resolve) => {
      new BatchPublishConfirmModal(this.app, folder.name, mdFiles.length, resolve).open();
    });

    if (!confirmed) {
      new Notice("Publication annulée");
      return;
    }

    // Get default server
    const server = this.settings.wordpressServers.find(s => s.id === this.settings.wordpressDefaultServerId)
      ?? this.settings.wordpressServers[0];

    if (!server) {
      new Notice("Aucun serveur WordPress configuré");
      return;
    }

    // Initialize handlers (same as PostComposer)
    const api = new WordPressAPI(server.baseUrl, server.username, server.password);
    const imageHandler = new WordPressImageHandler(api, this.app.vault, this.logger);
    const wikiLinkConverter = new WikiLinkConverter(this.app, this.logger);

    // Track published files to avoid duplicate updates
    const publishedPaths = new Set<string>();
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Create ONE persistent notice with all articles listed
    const noticeFragment = document.createDocumentFragment();
    const noticeContainer = document.createElement("div");
    noticeContainer.style.cssText = "max-height: 400px; overflow-y: auto;";

    // Header
    const header = document.createElement("div");
    header.style.cssText = "font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid var(--text-muted); padding-bottom: 4px;";
    header.textContent = `Publication de ${mdFiles.length} articles ${folder.name}`;
    noticeContainer.appendChild(header);

    // Create a line for each article
    const articleLines: Map<string, HTMLSpanElement> = new Map();
    for (const file of mdFiles) {
      const line = document.createElement("div");
      line.style.cssText = "padding: 2px 0;";
      const statusSpan = document.createElement("span");
      statusSpan.textContent = `📄 ${file.basename}`;
      line.appendChild(statusSpan);
      noticeContainer.appendChild(line);
      articleLines.set(file.path, statusSpan);
    }

    noticeFragment.appendChild(noticeContainer);

    // Show the persistent notice (0 = no auto-hide)
    const batchNotice = new Notice(noticeFragment, 0);

    for (let i = 0; i < mdFiles.length; i++) {
      const file = mdFiles[i];
      if (!file) continue;

      // Skip if already published in this batch
      if (publishedPaths.has(file.path)) {
        this.logger.debug(`Skipping already published: ${file.basename}`);
        continue;
      }

      // Update status to show current article is being processed
      const statusSpan = articleLines.get(file.path);
      if (statusSpan) {
        statusSpan.textContent = `📄 ${file.basename} ⏳`;
      }

      try {
        await this.batchPublishSingleFile(file, api, server, imageHandler, wikiLinkConverter);
        publishedPaths.add(file.path);
        successCount++;
        // Update to checkmark
        if (statusSpan) {
          statusSpan.textContent = `📄 ${file.basename} ✓`;
        }
        this.logger.info(`✓ ${file.basename}`);
      } catch (error) {
        errorCount++;
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${file.basename}: ${msg}`);
        // Update to X
        if (statusSpan) {
          statusSpan.textContent = `📄 ${file.basename} ✗`;
        }
        this.logger.error(`Failed to publish ${file.basename}`, error);
      }
    }

    // Update header with final summary
    header.textContent = `✅ Publication terminée: ${successCount} réussi(s)${errorCount > 0 ? `, ${errorCount} erreur(s)` : ""}`;
    if (errorCount > 0) {
      this.logger.warn("Batch errors:", errors);
    }

    // Auto-hide after 5 seconds
    setTimeout(() => batchNotice.hide(), 5000);
  }

  /**
   * Publish a single file during batch operation
   * Uses full image processing and wikilink conversion (same as PostComposer)
   * Does NOT trigger backlink updates (to avoid cascading republishes)
   */
  private async batchPublishSingleFile(
    file: TFile,
    api: WordPressAPI,
    server: WordPressServer,
    imageHandler: WordPressImageHandler,
    wikiLinkConverter: WikiLinkConverter
  ): Promise<void> {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache?.frontmatter) {
      throw new Error("No frontmatter");
    }

    const fm = cache.frontmatter;
    const title = fm.title || file.basename;
    const wordpressId = fm.wordpress_id as number | undefined;
    const contentType = fm.type === "page" ? "page" : "article";
    const enluminurePath = typeof fm.enluminure === "string" ? fm.enluminure : undefined;

    // Read content
    let content = await this.app.vault.cachedRead(file);

    // Remove frontmatter
    content = content.replace(/^---[\s\S]*?---\n?/, "");

    // Remove dataviewjs blocks
    content = content.replace(/```dataviewjs[\s\S]*?```\n*/g, "");

    // Process images - upload to WordPress (including enluminure)
    const basePath = file.parent?.path || "";
    const imageResult = await imageHandler.processMarkdownImages(content, basePath, enluminurePath);
    content = imageResult.processedMarkdown;

    if (imageResult.errors.length > 0) {
      this.logger.warn(`Image errors for ${file.basename}:`, imageResult.errors);
    }

    // Process wikilinks - convert to WordPress internal links
    const wikiLinkResult = wikiLinkConverter.processWikiLinks(content);
    content = wikiLinkResult.processed;

    if (wikiLinkResult.unresolved.length > 0) {
      this.logger.debug(`Unresolved wikilinks in ${file.basename}:`, wikiLinkResult.unresolved);
    }

    // Convert markdown to HTML (full conversion)
    let html = this.batchMarkdownToHtml(content);

    // Extract illustration (first image after H1)
    const { illustration, content: htmlWithoutIllustration } = this.extractIllustrationForBatch(html);

    // Build final HTML - illustration ALWAYS at top, then title
    let finalHtml: string;
    if (imageResult.enluminure?.wordpressUrl) {
      // Has enluminure - wrap content in enluminure structure
      const enluminureBlock = this.generateEnluminureHtmlForBatch(
        imageResult.enluminure,
        title,
        htmlWithoutIllustration
      );
      finalHtml = illustration ? `${illustration}\n${enluminureBlock}` : enluminureBlock;
    } else {
      // No enluminure - still ensure illustration is above title
      // Wrap content in article-body div for consistent styling
      const wrappedContent = `<div class="article-body">\n${htmlWithoutIllustration}\n</div>`;
      finalHtml = illustration ? `${illustration}\n${wrappedContent}` : wrappedContent;
    }

    // Get category for articles
    let categoryId: number | undefined;
    if (contentType === "article") {
      const category = fm.categorie || fm.category || server.defaultCategory;
      if (category && server.categoryPageIds[category]) {
        categoryId = server.categoryPageIds[category];
      }
    }

    // Build SEO options
    const seoOptions: {
      slug?: string;
      excerpt?: string;
      featuredMediaId?: number;
      rankMathMeta?: RankMathMeta;
      tags?: number[];
    } = {};

    if (fm.slug) seoOptions.slug = fm.slug;
    if (fm.excerpt) seoOptions.excerpt = fm.excerpt;
    if (imageResult.enluminure?.mediaId) {
      seoOptions.featuredMediaId = imageResult.enluminure.mediaId;
    }

    // Rank Math meta
    if (fm.focus_keyword || fm.excerpt || imageResult.enluminure?.wordpressUrl) {
      const rankMath: RankMathMeta = {};
      if (fm.focus_keyword) rankMath.rank_math_focus_keyword = fm.focus_keyword;
      if (fm.excerpt) rankMath.rank_math_description = fm.excerpt;
      if (imageResult.enluminure?.wordpressUrl) {
        rankMath.rank_math_facebook_image = imageResult.enluminure.wordpressUrl;
        rankMath.rank_math_twitter_use_facebook = "on";
      }
      seoOptions.rankMathMeta = rankMath;
    }

    // Resolve tags
    if (Array.isArray(fm.tags) && fm.tags.length > 0) {
      const tagResult = await api.resolveTagIds(fm.tags.filter((t: unknown): t is string => typeof t === "string"));
      if (tagResult.ids.length > 0) {
        seoOptions.tags = tagResult.ids;
      }
    }

    this.logger.debug(`Batch publishing: ${title}`, { wordpressId, contentType, categoryId, hasEnluminure: !!imageResult.enluminure });

    let result;
    if (wordpressId) {
      // Update existing
      if (contentType === "page") {
        result = await api.updatePage(wordpressId, {
          title,
          content: finalHtml,
          slug: seoOptions.slug,
          excerpt: seoOptions.excerpt
        });
      } else {
        result = await api.updatePost(wordpressId, {
          title,
          content: finalHtml,
          categories: categoryId ? [categoryId] : undefined,
          tags: seoOptions.tags,
          slug: seoOptions.slug,
          excerpt: seoOptions.excerpt,
          meta: seoOptions.rankMathMeta
        });
      }
    } else {
      // Create new
      if (contentType === "page") {
        result = await api.createPage(title, finalHtml, undefined, "publish");
      } else if (categoryId) {
        result = await api.createPost(title, finalHtml, [categoryId], "publish", seoOptions);
      } else {
        throw new Error(`No category for article: ${title}`);
      }
    }

    if (!result.success) {
      throw new Error(result.error || "Publication failed");
    }

    // Update frontmatter with WordPress info (if new)
    if (!wordpressId && result.data) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter.type = contentType;
        frontmatter.wordpress_id = result.data!.id;
        frontmatter.wordpress_url = result.data!.link;
        frontmatter.wordpress_slug = result.data!.slug;
      });
    }
  }

  /**
   * Full markdown to HTML conversion for batch publishing
   * Same logic as PostComposer.markdownToHtml
   */
  private batchMarkdownToHtml(markdown: string): string {
    let html = markdown;

    // Convert markdown tables to HTML
    html = this.convertBatchTablesToHtml(html);

    // Headers
    html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
    html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
    html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
    html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Code blocks FIRST (before inline code to avoid interference)
    html = html.replace(
      /```(\w*)\r?\n([\s\S]*?)```/g,
      (_, lang, code) => `<pre><code class="language-${lang}">${code.trim()}</code></pre>`
    );

    // Inline code (after code blocks)
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Images (already processed to WordPress URLs)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Blockquotes
    html = html.replace(/^>\s+(.+)$/gm, "<blockquote>$1</blockquote>");
    html = html.replace(/<\/blockquote>\n<blockquote>/g, "\n");

    // Unordered lists
    html = html.replace(/^[*-]\s+(.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>\n${match}</ul>\n`);

    // Ordered lists
    html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");

    // Horizontal rules
    html = html.replace(/^---+$/gm, "<hr>");
    html = html.replace(/^\*\*\*+$/gm, "<hr>");

    // Paragraphs - wrap text blocks in <p> tags
    const lines = html.split("\n");
    const result: string[] = [];
    let inParagraph = false;
    let paragraphContent: string[] = [];
    let inPreBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Track pre blocks to avoid processing their content
      if (trimmed.startsWith("<pre") || trimmed.includes("<pre>")) {
        inPreBlock = true;
      }
      if (trimmed.includes("</pre>") || trimmed.startsWith("</pre")) {
        inPreBlock = false;
        result.push(line);
        continue;
      }

      // If inside a pre block, just add the line as-is
      if (inPreBlock) {
        result.push(line);
        continue;
      }

      const isBlockElement =
        trimmed.startsWith("<h") ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("<ol") ||
        trimmed.startsWith("<li") ||
        trimmed.startsWith("</ul") ||
        trimmed.startsWith("</ol") ||
        trimmed.startsWith("<blockquote") ||
        trimmed.startsWith("</blockquote") ||
        trimmed.startsWith("<pre") ||
        trimmed.startsWith("</pre") ||
        trimmed.startsWith("<hr") ||
        trimmed.startsWith("<img") ||
        trimmed.startsWith("<table") ||
        trimmed === "";

      if (trimmed === "") {
        if (inParagraph && paragraphContent.length > 0) {
          result.push(`<p>${paragraphContent.join("<br>")}</p>`);
          paragraphContent = [];
          inParagraph = false;
        }
      } else if (isBlockElement) {
        if (inParagraph && paragraphContent.length > 0) {
          result.push(`<p>${paragraphContent.join("<br>")}</p>`);
          paragraphContent = [];
          inParagraph = false;
        }
        result.push(line);
      } else {
        inParagraph = true;
        paragraphContent.push(trimmed);
      }
    }

    if (inParagraph && paragraphContent.length > 0) {
      result.push(`<p>${paragraphContent.join("<br>")}</p>`);
    }

    let finalHtml = result.join("\n");
    finalHtml = finalHtml.replace(/^(\s*<p>&nbsp;<\/p>\s*)+/, "");
    return finalHtml;
  }

  /**
   * Convert markdown tables to HTML for batch
   */
  private convertBatchTablesToHtml(text: string): string {
    const tableRegex = /\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/g;
    return text.replace(tableRegex, (match) => {
      const lines = match.trim().split("\n");
      if (lines.length < 3) return match;

      const headerLine = lines[0] ?? "";
      const headers = headerLine.split("|").map(h => h.trim()).filter(h => h);

      const rows: string[][] = [];
      for (let i = 2; i < lines.length; i++) {
        const rowLine = lines[i] ?? "";
        const cells = rowLine.split("|").map(c => c.trim()).filter(c => c);
        if (cells.length > 0) rows.push(cells);
      }

      let html = "<table>\n<thead>\n<tr>\n";
      for (const header of headers) {
        html += `<th>${header}</th>\n`;
      }
      html += "</tr>\n</thead>\n<tbody>\n";

      for (const row of rows) {
        html += "<tr>\n";
        for (let i = 0; i < headers.length; i++) {
          html += `<td>${row[i] ?? ""}</td>\n`;
        }
        html += "</tr>\n";
      }
      html += "</tbody>\n</table>\n";
      return html;
    });
  }

  /**
   * Extract illustration for batch publishing
   */
  private extractIllustrationForBatch(html: string): { illustration: string | null; content: string } {
    const h1Match = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i);
    if (!h1Match) return { illustration: null, content: html };

    const h1End = html.indexOf(h1Match[0]) + h1Match[0].length;
    const htmlAfterH1 = html.substring(h1End);
    const imgMatch = htmlAfterH1.match(/<img[^>]+>/i);
    if (!imgMatch) return { illustration: null, content: html };

    const imgTag = imgMatch[0];
    const imgPosAfterH1 = htmlAfterH1.indexOf(imgTag);
    const contentBetween = htmlAfterH1.substring(0, imgPosAfterH1);
    const hasOnlyHeadersBetween = /^[\s]*(<h[23][^>]*>[\s\S]*?<\/h[23]>[\s]*)*$/i.test(contentBetween);

    if (imgPosAfterH1 < 300 || hasOnlyHeadersBetween) {
      const illustrationBlock = `<div class="article-illustration">\n${imgTag}\n</div>`;
      const imgPosInFull = h1End + imgPosAfterH1;
      const contentWithoutIllustration = html.substring(0, imgPosInFull) + html.substring(imgPosInFull + imgTag.length);
      return { illustration: illustrationBlock, content: contentWithoutIllustration };
    }

    return { illustration: null, content: html };
  }

  /**
   * Generate enluminure HTML structure for batch
   */
  private generateEnluminureHtmlForBatch(
    enluminure: WordPressEnluminureInfo,
    _title: string,
    bodyHtml: string
  ): string {
    const enluminureUrl = enluminure.wordpressUrl || "";

    // Process H1: wrap first letter in screen-reader-text
    const processedBodyHtml = bodyHtml.replace(
      /<h1([^>]*)>(.+?)<\/h1>/i,
      (_match, attrs, content) => {
        const trimmedContent = content.trim();
        const firstLetter = trimmedContent.charAt(0);
        const restOfTitle = trimmedContent.slice(1);
        return `<h1${attrs}><span class="screen-reader-text">${firstLetter}</span>${restOfTitle}</h1>`;
      }
    );

    return `<div class="enluminure-container">
<div class="enluminure-image-article">
<img src="${enluminureUrl}" alt="Image enluminure">
</div>
${processedBodyHtml}
</div>`;
  }
}

/**
 * Result from PipelineConfigModal
 */
interface PipelineConfig {
  notebook: string | null;
  categorie: string | null;
}

/**
 * Notebook configuration from config.md
 */
interface NotebookEntry {
  uuid: string;
  name: string;
  description?: string;
}

/**
 * Modal for entering a new notebook URL
 */
class NewNotebookModal extends Modal {
  private resolve: (value: string | null) => void;
  private notebookId: string;

  constructor(app: App, notebookId: string, resolve: (value: string | null) => void) {
    super(app);
    this.notebookId = notebookId;
    this.resolve = resolve;
  }

  override onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("new-notebook-modal");

    contentEl.createEl("h3", { text: "Nouveau notebook" });
    contentEl.createEl("p", {
      text: `Notebook "${this.notebookId}" - entrez l'URL pour l'ajouter.`,
      cls: "notebook-desc"
    });

    const inputDiv = contentEl.createDiv({ cls: "notebook-uuid-input" });

    const urlInput = inputDiv.createEl("input", {
      type: "text",
      placeholder: "URL NotebookLM (https://notebooklm.google.com/notebook/...)",
      cls: "config-input url-input"
    });

    const buttonsDiv = contentEl.createDiv({ cls: "config-buttons" });

    const skipBtn = buttonsDiv.createEl("button", { text: "Sans NotebookLM", cls: "config-btn" });
    skipBtn.addEventListener("click", () => {
      this.resolve(null);
      this.close();
    });

    const addBtn = buttonsDiv.createEl("button", { text: "Ajouter", cls: "config-btn config-btn-primary" });
    addBtn.addEventListener("click", () => {
      const url = urlInput.value.trim();

      if (!url) {
        new Notice("Veuillez entrer l'URL du notebook");
        return;
      }

      // Validate URL format
      if (!url.includes("notebooklm.google.com/notebook/")) {
        new Notice("URL invalide. Format: https://notebooklm.google.com/notebook/...");
        return;
      }

      this.resolve(url);
      this.close();
    });
  }

  override onClose() {
    this.contentEl.empty();
  }
}

/**
 * Modal for notebook registration error with options
 */
class NotebookErrorModal extends Modal {
  private resolve: (value: "retry" | "change" | "skip") => void;
  private notebookId: string;
  private errorMessage: string;

  constructor(app: App, notebookId: string, errorMessage: string, resolve: (value: "retry" | "change" | "skip") => void) {
    super(app);
    this.notebookId = notebookId;
    this.errorMessage = errorMessage;
    this.resolve = resolve;
  }

  override onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("notebook-error-modal");

    contentEl.createEl("h3", { text: "Erreur notebook" });

    const errorDiv = contentEl.createDiv({ cls: "error-message" });
    errorDiv.createEl("p", { text: `Notebook "${this.notebookId}" :` });
    errorDiv.createEl("p", { text: this.errorMessage, cls: "error-text" });

    const infoDiv = contentEl.createDiv({ cls: "error-info" });
    infoDiv.createEl("p", {
      text: "Pour donner accès au MCP, partagez le notebook avec le compte Google utilisé par le MCP NotebookLM.",
      cls: "info-text"
    });

    const buttonsDiv = contentEl.createDiv({ cls: "config-buttons" });

    const retryBtn = buttonsDiv.createEl("button", { text: "Réessayer", cls: "config-btn config-btn-primary" });
    retryBtn.addEventListener("click", () => {
      this.resolve("retry");
      this.close();
    });

    const changeBtn = buttonsDiv.createEl("button", { text: "Autre notebook", cls: "config-btn" });
    changeBtn.addEventListener("click", () => {
      this.resolve("change");
      this.close();
    });

    const skipBtn = buttonsDiv.createEl("button", { text: "Continuer sans", cls: "config-btn" });
    skipBtn.addEventListener("click", () => {
      this.resolve("skip");
      this.close();
    });
  }

  override onClose() {
    this.contentEl.empty();
  }
}

/**
 * Modal for selecting notebook (NotebookLM) and category (style)
 */
class PipelineConfigModal extends Modal {
  private resolve: (value: PipelineConfig | null) => void;
  private availableCategories: string[];
  private availableNotebooks: Array<{ id: string; name: string }>;
  private needsNotebook: boolean;
  private needsCategorie: boolean;

  private selectedNotebook: string | null = null;
  private selectedCategorie: string | null = null;
  private customNotebookInput: HTMLInputElement | null = null;
  private customCategorieInput: HTMLInputElement | null = null;

  constructor(
    app: App,
    resolve: (value: PipelineConfig | null) => void,
    availableCategories: string[],
    availableNotebooks: Array<{ id: string; name: string }>,
    needsNotebook: boolean,
    needsCategorie: boolean
  ) {
    super(app);
    this.resolve = resolve;
    this.availableCategories = availableCategories;
    this.availableNotebooks = availableNotebooks;
    this.needsNotebook = needsNotebook;
    this.needsCategorie = needsCategorie;
  }

  override onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pipeline-config-modal");

    contentEl.createEl("h3", { text: "Configuration du pipeline" });

    // Notebook selection (if needed)
    if (this.needsNotebook) {
      const notebookSection = contentEl.createDiv({ cls: "config-section" });
      notebookSection.createEl("h4", { text: "Notebook (références NotebookLM)" });

      const notebookSelect = notebookSection.createEl("select", { cls: "config-select" });
      notebookSelect.createEl("option", { text: "-- Sélectionner --", value: "" });

      for (const nb of this.availableNotebooks) {
        notebookSelect.createEl("option", { text: nb.name, value: nb.id });
      }
      notebookSelect.createEl("option", { text: "── Sans NotebookLM ──", value: "", attr: { disabled: "true" } });
      notebookSelect.createEl("option", { text: "Regards", value: "_regards" });
      notebookSelect.createEl("option", { text: "Psycho", value: "_psycho" });
      notebookSelect.createEl("option", { text: "Autre", value: "_autre" });

      notebookSelect.addEventListener("change", () => {
        const val = notebookSelect.value;
        this.selectedNotebook = val.startsWith("_") ? val.slice(1) : val;
      });

      // Custom notebook input
      const customNotebookDiv = notebookSection.createDiv({ cls: "config-custom" });
      customNotebookDiv.createEl("span", { text: "ou nouveau : " });
      this.customNotebookInput = customNotebookDiv.createEl("input", {
        type: "text",
        placeholder: "nom du notebook",
        cls: "config-input"
      });
      this.customNotebookInput.addEventListener("input", () => {
        if (this.customNotebookInput && this.customNotebookInput.value.trim()) {
          notebookSelect.value = "";
          this.selectedNotebook = this.customNotebookInput.value.trim().toLowerCase();
        }
      });
    }

    // Category selection (if needed)
    if (this.needsCategorie) {
      const categorieSection = contentEl.createDiv({ cls: "config-section" });
      categorieSection.createEl("h4", { text: "Catégorie (style d'écriture)" });

      const categorieSelect = categorieSection.createEl("select", { cls: "config-select" });
      categorieSelect.createEl("option", { text: "-- Sélectionner --", value: "" });

      for (const cat of this.availableCategories) {
        categorieSelect.createEl("option", { text: cat, value: cat });
      }

      categorieSelect.addEventListener("change", () => {
        this.selectedCategorie = categorieSelect.value || null;
      });

      // Custom category input
      const customCatDiv = categorieSection.createDiv({ cls: "config-custom" });
      customCatDiv.createEl("span", { text: "ou nouvelle : " });
      this.customCategorieInput = customCatDiv.createEl("input", {
        type: "text",
        placeholder: "nom de la catégorie",
        cls: "config-input"
      });
      this.customCategorieInput.addEventListener("input", () => {
        if (this.customCategorieInput && this.customCategorieInput.value.trim()) {
          categorieSelect.value = "";
          this.selectedCategorie = this.customCategorieInput.value.trim().toLowerCase();
        }
      });
    }

    // Buttons
    const buttonsDiv = contentEl.createDiv({ cls: "config-buttons" });

    const cancelBtn = buttonsDiv.createEl("button", { text: "Annuler", cls: "config-btn" });
    cancelBtn.addEventListener("click", () => {
      this.resolve(null);
      this.close();
    });

    const confirmBtn = buttonsDiv.createEl("button", { text: "Valider", cls: "config-btn config-btn-primary" });
    confirmBtn.addEventListener("click", () => {
      // Validate required fields
      if (this.needsNotebook && !this.selectedNotebook) {
        new Notice("Veuillez sélectionner un notebook");
        return;
      }
      if (this.needsCategorie && !this.selectedCategorie) {
        new Notice("Veuillez sélectionner une catégorie");
        return;
      }
      this.close();
    });
  }

  override onClose() {
    // Only resolve if not already resolved (cancel case)
    if (this.selectedNotebook || this.selectedCategorie) {
      this.resolve({
        notebook: this.selectedNotebook,
        categorie: this.selectedCategorie
      });
    }
    this.contentEl.empty();
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

/**
 * Confirmation modal for batch publishing a folder
 */
class BatchPublishConfirmModal extends Modal {
  private folderName: string;
  private fileCount: number;
  private resolve: (confirmed: boolean) => void;

  constructor(
    app: App,
    folderName: string,
    fileCount: number,
    resolve: (confirmed: boolean) => void
  ) {
    super(app);
    this.folderName = folderName;
    this.fileCount = fileCount;
    this.resolve = resolve;
  }

  override onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h3", { text: "Publier le répertoire sur WordPress" });

    contentEl.createEl("p", {
      text: `Vous êtes sur le point de publier ${this.fileCount} fichier(s) du dossier "${this.folderName}" sur WordPress.`
    });

    contentEl.createEl("p", {
      text: "Les articles déjà publiés seront mis à jour, les nouveaux seront créés.",
      cls: "batch-publish-info"
    });

    contentEl.createEl("p", {
      text: "⚠️ Les mises à jour de backlinks sont désactivées pendant le batch pour éviter les doublons.",
      cls: "batch-publish-warning"
    });

    const buttonsDiv = contentEl.createDiv({ cls: "batch-publish-buttons" });
    buttonsDiv.style.display = "flex";
    buttonsDiv.style.gap = "10px";
    buttonsDiv.style.justifyContent = "flex-end";
    buttonsDiv.style.marginTop = "20px";

    const cancelBtn = buttonsDiv.createEl("button", { text: "Annuler" });
    cancelBtn.addEventListener("click", () => {
      this.resolve(false);
      this.close();
    });

    const confirmBtn = buttonsDiv.createEl("button", {
      text: `Publier ${this.fileCount} fichiers`,
      cls: "mod-cta"
    });
    confirmBtn.addEventListener("click", () => {
      this.resolve(true);
      this.close();
    });
  }

  override onClose() {
    const { contentEl } = this;
    contentEl.empty();
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
