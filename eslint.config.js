import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import obsidianPlugin from "eslint-plugin-obsidianmd";

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
      globals: {
        console: "readonly",
        process: "readonly",
        window: "readonly",
        MouseEvent: "readonly",
        HTMLButtonElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLElement: "readonly",
        HTMLSpanElement: "readonly",
        HTMLTextAreaElement: "readonly",
        NodeJS: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        require: "readonly",
        global: "readonly",
        URL: "readonly",
        document: "readonly",
        Image: "readonly",
        Blob: "readonly",
        SVGElement: "readonly",
        XMLSerializer: "readonly",
        MutationObserver: "readonly",
        CSSFontFaceRule: "readonly",
        CSSRuleList: "readonly",
        FileReader: "readonly",
        getComputedStyle: "readonly",
        fetch: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
      obsidianmd: obsidianPlugin,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
      "@typescript-eslint/ban-ts-comment": "off",
      "no-prototype-builtins": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-var-requires": "off",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: "error",
      "no-console": "warn",
      "no-debugger": "error",
      "no-duplicate-imports": "error",
      "prefer-template": "error",
      "object-shorthand": "error",
      "comma-dangle": ["error", "never"],
      semi: ["error", "always"],
      quotes: ["error", "double", { avoidEscape: true }],
      indent: ["error", 2],
      "no-trailing-spaces": "error",
      "eol-last": "error",
      // Obsidian specific rules
      "obsidianmd/ui/sentence-case": ["error", {
        enforceCamelCaseLower: true,
        brands: [
          // Defaults
          "iOS", "iPadOS", "macOS", "Windows", "Android", "Linux",
          "Obsidian", "Obsidian Sync", "Obsidian Publish",
          "Google Drive", "Dropbox", "OneDrive", "iCloud Drive",
          "YouTube", "Slack", "Discord", "Telegram", "WhatsApp", "Twitter", "X",
          "Readwise", "Zotero", "Excalidraw", "Mermaid",
          "Markdown", "LaTeX", "JavaScript", "TypeScript", "Node.js",
          "npm", "pnpm", "Yarn", "Git", "GitHub", "GitLab",
          "Notion", "Evernote", "Roam Research", "Logseq", "Anki", "Reddit",
          "VS Code", "Visual Studio Code", "IntelliJ IDEA", "WebStorm", "PyCharm",
          // Plugin-specific brands
          "WordPress", "LinkedIn", "Substack", "Postman", "Polylang",
          "NotebookLM", "Google", "OpenID Connect", "OAuth"
        ],
        acronyms: [
          // Defaults
          "API", "HTTP", "HTTPS", "URL", "DNS", "TCP", "IP", "SSH", "TLS", "SSL", "FTP", "SFTP", "SMTP",
          "JSON", "XML", "HTML", "CSS", "PDF", "CSV", "YAML", "SQL", "PNG", "JPG", "JPEG", "GIF", "SVG",
          "2FA", "MFA", "JWT", "LDAP", "SAML",
          "SDK", "IDE", "CLI", "GUI", "CRUD", "REST", "SOAP",
          "CPU", "GPU", "RAM", "SSD", "USB",
          "UI", "OK",
          "RSS", "S3", "WebDAV",
          "ID", "UUID", "GUID", "SHA", "MD5", "ASCII", "UTF-8", "UTF-16", "DOM", "CDN", "FAQ", "AI", "ML",
          // Plugin-specific acronyms
          "MCP", "WP", "FR", "EN"
        ],
        ignoreWords: ["IDs", "GET"]
      }],
    },
  },
  {
    // Node.js scripts (CommonJS)
    files: ["**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        console: "readonly",
        process: "readonly",
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    // Node.js scripts (ES modules)
    files: ["**/*.mjs", "esbuild.config.mjs", "version-bump.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    // Test files - allow any for accessing private members
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    ignores: ["main.js", "node_modules/", "dist/", "build/", "*.js.map"]
  }
];
