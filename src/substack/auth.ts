import { Notice, Platform } from "obsidian";
import { SubstackAPI } from "./api";

/**
 * Handles Substack authentication via Electron BrowserWindow
 * Desktop only - captures session cookie after user login
 */
interface ElectronCookie {
  name: string;
  value: string;
  domain?: string;
}

interface ElectronModule {
  remote?: ElectronRemote;
  BrowserWindow?: typeof BrowserWindowClass;
  session?: ElectronSession;
}

interface ElectronRemote {
  BrowserWindow: typeof BrowserWindowClass;
  session: ElectronSession;
}

interface ElectronSession {
  fromPartition(partition: string): SessionInstance;
}

interface SessionInstance {
  cookies: CookieStore;
}

interface CookieStore {
  get(filter: { domain: string }): Promise<ElectronCookie[]>;
}

declare class BrowserWindowClass {
  constructor(options: BrowserWindowOptions);
  setMenuBarVisibility(visible: boolean): void;
  webContents: WebContents;
  isDestroyed(): boolean;
  close(): void;
  loadURL(url: string): void;
  on(event: string, callback: () => void): void;
}

interface BrowserWindowOptions {
  width: number;
  height: number;
  title: string;
  webPreferences: {
    nodeIntegration: boolean;
    contextIsolation: boolean;
    session: SessionInstance;
  };
}

interface WindowOpenResponse {
  action: "allow" | "deny";
  overrideBrowserWindowOptions?: { parent: BrowserWindowClass };
}

interface WebContents {
  session: { cookies: CookieStore };
  on(event: string, callback: (event: unknown, url: string) => void): void;
  removeAllListeners(event: string): void;
  setWindowOpenHandler(
    handler: (details: { url: string }) => WindowOpenResponse
  ): void;
}

/**
 * True for https URLs on substack.com or one of its subdomains
 */
export function isSubstackUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" &&
      (hostname === "substack.com" || hostname.endsWith(".substack.com"))
    );
  } catch {
    return false;
  }
}

export class SubstackAuth {
  private onCookieCaptured: (cookie: string) => void;

  constructor(onCookieCaptured: (cookie: string) => void) {
    this.onCookieCaptured = onCookieCaptured;
  }

  /**
   * Basic format check for cookie string
   * Only validates format, not actual session validity
   */
  private hasValidCookieFormat(cookie: string): boolean {
    return cookie.includes("substack.sid=") && cookie.length > 30;
  }

  /**
   * Check if we can use BrowserWindow (desktop only)
   */
  isAvailable(): boolean {
    return Platform.isDesktop;
  }

  /**
   * Open Substack login window and capture cookie after authentication
   */
  login(): void {
    if (!this.isAvailable()) {
      new Notice(
        "Auto-login is only available on desktop. Please copy your cookie manually."
      );
      return;
    }

    try {
      // Obsidian desktop runs in Electron renderer - window.require is the only way to access Electron APIs
      const electron = window.require("electron") as ElectronModule;
      const remote = electron.remote ?? electron;
      const { BrowserWindow } = remote;

      if (!BrowserWindow) {
        new Notice(
          "Cannot access browser window. Please copy your cookie manually."
        );
        return;
      }

      // Use a separate session to avoid sharing with system browser
      const { session } = remote;
      if (!session) {
        new Notice("Cannot access session. Please copy your cookie manually.");
        return;
      }
      const partition = `persist:substack-auth-${Date.now()}`;
      const authSession = session.fromPartition(partition);

      const authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        title: "Login to Substack",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          session: authSession
        }
      });

      // Hide menu bar
      authWindow.setMenuBarVisibility(false);

      // Keep the whole login flow inside this window. Obsidian sends pop-ups and
      // navigations of every window to the system browser; there the session lands in
      // the browser instead of this window and is never captured (issue #3).
      const contents = authWindow.webContents;
      contents.removeAllListeners("will-navigate");
      contents.setWindowOpenHandler(({ url }) => {
        if (isSubstackUrl(url)) {
          authWindow.loadURL(url);
          return { action: "deny" };
        }
        // Third-party sign-in (Google, Apple…): child window sharing this session
        return {
          action: "allow",
          overrideBrowserWindowOptions: { parent: authWindow }
        };
      });

      let cookieCaptured = false;
      let checking = false;

      // Capture the session as soon as Substack confirms it belongs to a logged-in user,
      // whatever page the window currently shows.
      const checkSession = async (): Promise<void> => {
        if (cookieCaptured || checking || authWindow.isDestroyed()) return;
        checking = true;
        try {
          const allCookies: ElectronCookie[] = await contents.session.cookies.get(
            { domain: "substack.com" }
          );
          const cookieValue = allCookies
            .filter(
              (c: ElectronCookie) =>
                c.name.startsWith("substack") || c.name === "connect.sid"
            )
            .map((c: ElectronCookie) => `${c.name}=${c.value}`)
            .join("; ");

          if (!this.hasValidCookieFormat(cookieValue)) return;
          if (!(await new SubstackAPI(cookieValue).isSessionValid())) return;
          if (cookieCaptured || authWindow.isDestroyed()) return;

          cookieCaptured = true;
          this.onCookieCaptured(cookieValue);
          new Notice("Login successful");
          authWindow.close();
        } catch {
          // Cookies or network not ready yet: the next check retries
        } finally {
          checking = false;
        }
      };

      contents.on("did-navigate", () => void checkSession());
      contents.on("did-navigate-in-page", () => void checkSession());
      const intervalId = activeWindow.setInterval(() => {
        if (authWindow.isDestroyed() || cookieCaptured) {
          activeWindow.clearInterval(intervalId);
          return;
        }
        void checkSession();
      }, 2000);

      // Cleanup on close
      authWindow.on("closed", () => {
        activeWindow.clearInterval(intervalId);
        if (!cookieCaptured) {
          new Notice(
            "Login window closed. Cookie was not captured - please try again."
          );
        }
      });

      // Load Substack login page
      authWindow.loadURL("https://substack.com/sign-in");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      new Notice(
        `Failed to open login window: ${message}. Please copy your cookie manually.`
      );
    }
  }
}
