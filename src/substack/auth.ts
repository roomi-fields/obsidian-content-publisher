import { Notice, Platform, requestUrl } from "obsidian";

/**
 * Handles Substack authentication via Electron BrowserWindow
 * Desktop only - captures session cookie after user login
 */
interface ElectronCookie {
  name: string;
  value: string;
  domain?: string;
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
  async login(): Promise<void> {
    if (!this.isAvailable()) {
      new Notice("Auto-login is only available on desktop. Please copy your cookie manually.");
      return;
    }

    try {
      // Dynamic import of Electron to avoid errors on mobile
      // Use window.require for Obsidian's Electron environment
      const electron = window.require("electron");
      const { BrowserWindow } = electron.remote || electron;

      if (!BrowserWindow) {
        new Notice("Cannot access browser window. Please copy your cookie manually.");
        return;
      }

      // Use a separate session to avoid sharing with system browser
      const { session } = electron.remote || electron;
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
          const allCookies: ElectronCookie[] = await authWindow.webContents.session.cookies.get({
            domain: ".substack.com"
          });

          // Find the sid cookie
          const sidCookie = allCookies.find((c: ElectronCookie) => c.name === "substack.sid");

          if (sidCookie && sidCookie.value) {
            // Build cookie string with all relevant cookies
            const relevantCookies = allCookies
              .filter((c: ElectronCookie) => c.name.startsWith("substack") || c.name === "connect.sid")
              .map((c: ElectronCookie) => `${c.name}=${c.value}`)
              .join("; ");

            const cookieValue = relevantCookies || `substack.sid=${sidCookie.value}`;

            // Check cookie format before capturing
            const hasValidFormat = this.hasValidCookieFormat(cookieValue);
            if (!hasValidFormat) {
              return false;
            }

            cookieCaptured = true;
            this.onCookieCaptured(cookieValue);
            new Notice("Successfully logged in to Substack!");
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

      authWindow.webContents.on("did-navigate", (_event: unknown, url: string) => {
        checkIfAuthenticated(url);
      });

      authWindow.webContents.on("did-navigate-in-page", (_event: unknown, url: string) => {
        checkIfAuthenticated(url);
      });

      // Also check periodically as fallback
      const intervalId = setInterval(() => {
        if (authWindow.isDestroyed() || cookieCaptured) {
          clearInterval(intervalId);
          return;
        }
        const currentUrl = authWindow.webContents.getURL();
        if (!currentUrl.includes("sign-in") && !currentUrl.includes("magic-link")) {
          void checkCookie();
        }
      }, 3000);

      // Cleanup on close
      authWindow.on("closed", () => {
        clearInterval(intervalId);
        if (!cookieCaptured) {
          new Notice("Login window closed. Cookie was not captured - please try again.");
        }
      });

      // Load Substack login page
      authWindow.loadURL("https://substack.com/sign-in");

    } catch {
      new Notice("Failed to open login window. Please copy your cookie manually.");
    }
  }
}

/**
 * Validate an existing cookie - can be used to check if saved cookie is still valid
 */
export async function validateSubstackCookie(cookie: string): Promise<boolean> {
  if (!cookie) return false;

  try {
    const response = await requestUrl({
      url: "https://substack.com/api/v1/user/profile",
      method: "GET",
      headers: {
        Cookie: cookie
      }
    });
    return response.status === 200;
  } catch {
    return false;
  }
}
