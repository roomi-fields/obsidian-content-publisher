import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock obsidian module before importing
vi.mock("obsidian", () => ({
  Notice: vi.fn(),
  Platform: { isDesktop: true },
  requestUrl: vi.fn(),
}));

import { SubstackAuth, isSubstackUrl } from "../src/substack/auth";
import { Platform } from "obsidian";

describe("SubstackAuth", () => {
  let auth: SubstackAuth;
  let onCookieCaptured: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onCookieCaptured = vi.fn();
    auth = new SubstackAuth(onCookieCaptured);
  });

  describe("hasValidCookieFormat", () => {
    // Access private method via any type
    const testValidation = (cookie: string): boolean => {
      const auth = new SubstackAuth(vi.fn());
      return (auth as any).hasValidCookieFormat(cookie);
    };

    it("should return true for valid cookie format with sufficient length", () => {
      const validCookie = "substack.sid=abc123456789012345678901234567890";
      expect(testValidation(validCookie)).toBe(true);
    });

    it("should return false when substack.sid is missing", () => {
      const invalidCookie = "other.cookie=abc123456789012345678901234567890";
      expect(testValidation(invalidCookie)).toBe(false);
    });

    it("should return false for short cookies (less than 30 chars total)", () => {
      const shortCookie = "substack.sid=short";
      expect(testValidation(shortCookie)).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(testValidation("")).toBe(false);
    });

    it("should return true for cookie with multiple values including substack.sid", () => {
      const multiCookie =
        "substack.sid=abc123456789012345678901234567890; other=value";
      expect(testValidation(multiCookie)).toBe(true);
    });

    it("should return false when substack.sid is present but total length is short", () => {
      const cookie = "substack.sid=x";
      expect(testValidation(cookie)).toBe(false);
    });
  });

  describe("isAvailable", () => {
    it("should return true on desktop", () => {
      expect(auth.isAvailable()).toBe(true);
    });

    it("should return false on mobile", () => {
      // Temporarily modify Platform mock
      const originalIsDesktop = Platform.isDesktop;
      (Platform as any).isDesktop = false;

      const mobileAuth = new SubstackAuth(vi.fn());
      expect(mobileAuth.isAvailable()).toBe(false);

      // Restore
      (Platform as any).isDesktop = originalIsDesktop;
    });
  });

  describe("constructor", () => {
    it("should store the callback function", () => {
      const callback = vi.fn();
      const auth = new SubstackAuth(callback);

      // Verify callback is stored (access via any)
      expect((auth as any).onCookieCaptured).toBe(callback);
    });
  });
});

describe("isSubstackUrl", () => {
  it("accepts substack.com and its subdomains over https", () => {
    expect(isSubstackUrl("https://substack.com/home")).toBe(true);
    expect(isSubstackUrl("https://myblog.substack.com/p/post")).toBe(true);
  });

  it("rejects other hosts, look-alikes and non-https URLs", () => {
    expect(isSubstackUrl("https://accounts.google.com/o/oauth2")).toBe(false);
    expect(isSubstackUrl("https://evilsubstack.com/")).toBe(false);
    expect(isSubstackUrl("https://substack.com.evil.io/")).toBe(false);
    expect(isSubstackUrl("http://substack.com/")).toBe(false);
    expect(isSubstackUrl("not a url")).toBe(false);
  });
});
