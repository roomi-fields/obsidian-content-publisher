export class App {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Modal {}
export class Notice {}
export class TFile {}
export class TFolder {}
export class Editor {}
export class MarkdownView {}
export interface MarkdownFileInfo {}

export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .trim();
}

export default {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  Modal,
  Notice,
  TFile,
  TFolder,
  Editor,
  MarkdownView,
  normalizePath,
};
