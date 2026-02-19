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
      "obsidianmd/ui/sentence-case": "error",
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
