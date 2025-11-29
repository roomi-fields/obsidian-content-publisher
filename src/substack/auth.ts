import { Notice, Platform } from "obsidian";

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used as type reference for typeof in ElectronModule interface
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

interface WebContents {
  session: { cookies: CookieStore };
  getURL(): string;
  on(event: string, callback: (event: unknown, url: string) => void): void;
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

      let cookieCaptured = false;

      // Check for cookie - captures when format is valid
      const checkCookie = async (): Promise<boolean> => {
        if (cookieCaptured) return true;

        try {
          // Get ALL substack cookies from this window's session
          const allCookies: ElectronCookie[] =
            await authWindow.webContents.session.cookies.get({
              domain: ".substack.com"
            });

          // Find the sid cookie
          const sidCookie = allCookies.find(
            (c: ElectronCookie) => c.name === "substack.sid"
          );

          if (sidCookie && sidCookie.value) {
            // Build cookie string with all relevant cookies
            const relevantCookies = allCookies
              .filter(
                (c: ElectronCookie) =>
                  c.name.startsWith("substack") || c.name === "connect.sid"
              )
              .map((c: ElectronCookie) => `${c.name}=${c.value}`)
              .join("; ");

            const cookieValue =
              relevantCookies || `substack.sid=${sidCookie.value}`;

            // Check cookie format before capturing
            const hasValidFormat = this.hasValidCookieFormat(cookieValue);
            if (!hasValidFormat) {
              return false;
            }

            cookieCaptured = true;
            this.onCookieCaptured(cookieValue);
            new Notice("Login successful");
            authWindow.close();
            return true;
          }
        } catch {
          // Expected during login flow - cookies may not be available yet
          // Errors here are typically timing-related, not fatal
        }
        return false;
      };

      // Check after navigation
      const checkIfAuthenticated = (url: string): void => {
        // Check on any page that's not the sign-in page
        if (!url.includes("sign-in") && !url.includes("magic-link")) {
          // Wait for cookies to be fully set
          setTimeout(() => {
            void checkCookie().then((found) => {
              if (!found) {
                // Retry after another delay
                setTimeout(() => {
                  void checkCookie();
                }, 2000);
              }
            });
          }, 1500);
        }
      };

      authWindow.webContents.on(
        "did-navigate",
        (_event: unknown, url: string) => {
          checkIfAuthenticated(url);
        }
      );

      authWindow.webContents.on(
        "did-navigate-in-page",
        (_event: unknown, url: string) => {
          checkIfAuthenticated(url);
        }
      );

      // Also check periodically as fallback
      const intervalId = setInterval(() => {
        if (authWindow.isDestroyed() || cookieCaptured) {
          clearInterval(intervalId);
          return;
        }
        const currentUrl = authWindow.webContents.getURL();
        if (
          !currentUrl.includes("sign-in") &&
          !currentUrl.includes("magic-link")
        ) {
          void checkCookie();
        }
      }, 3000);

      // Cleanup on close
      authWindow.on("closed", () => {
        clearInterval(intervalId);
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
