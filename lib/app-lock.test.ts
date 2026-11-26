import { describe, expect, it } from "vitest";
import {
  APP_LOCK_PREPAINT_SCRIPT,
  LOCK_GRACE_MS,
  fromBase64Url,
  hasUserVerifiedFlag,
  parseAppLock,
  shouldRelock,
  toBase64Url,
} from "./app-lock";

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array(Array.from({ length: 257 }, (_, i) => i % 256));
    expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
  });

  it("uses the URL-safe alphabet without padding", () => {
    const encoded = toBase64Url(new Uint8Array([0xfb, 0xff, 0xfe]));
    expect(encoded).toBe("-__-");
    expect(toBase64Url(new Uint8Array([1]))).toBe("AQ");
  });

  it("decodes unpadded input of every length", () => {
    for (const len of [0, 1, 2, 3, 4, 5]) {
      const bytes = new Uint8Array(len).fill(7);
      expect(fromBase64Url(toBase64Url(bytes)).length).toBe(len);
    }
  });
});

describe("hasUserVerifiedFlag", () => {
  const authData = (flags: number) => {
    const d = new Uint8Array(37);
    d[32] = flags;
    return d;
  };

  it("is true when the UV bit is set", () => {
    expect(hasUserVerifiedFlag(authData(0x05))).toBe(true); // UP | UV
    expect(hasUserVerifiedFlag(authData(0x04).buffer)).toBe(true);
  });

  it("is false when only user-presence is set", () => {
    expect(hasUserVerifiedFlag(authData(0x01))).toBe(false);
  });

  it("is false for truncated data", () => {
    expect(hasUserVerifiedFlag(new Uint8Array(33).fill(0xff))).toBe(false);
  });
});

describe("shouldRelock", () => {
  const now = 1_700_000_000_000;

  it("locks when there is no last-active marker (cold launch)", () => {
    expect(shouldRelock(null, now)).toBe(true);
    expect(shouldRelock(Number.NaN, now)).toBe(true);
  });

  it("stays unlocked inside the grace window", () => {
    expect(shouldRelock(now, now)).toBe(false);
    expect(shouldRelock(now - (LOCK_GRACE_MS - 1000), now)).toBe(false);
  });

  it("locks at and beyond the grace window", () => {
    expect(shouldRelock(now - LOCK_GRACE_MS, now)).toBe(true);
    expect(shouldRelock(now - LOCK_GRACE_MS * 10, now)).toBe(true);
  });

  it("locks when the clock moved backwards", () => {
    expect(shouldRelock(now + 1000, now)).toBe(true);
  });
});

describe("parseAppLock", () => {
  it("accepts a well-formed config", () => {
    expect(parseAppLock({ userId: "u1", credentialId: "abc" })).toEqual({ userId: "u1", credentialId: "abc" });
  });

  it("rejects missing or malformed fields", () => {
    expect(parseAppLock(null)).toBeNull();
    expect(parseAppLock({ userId: "u1" })).toBeNull();
    expect(parseAppLock({ userId: "", credentialId: "abc" })).toBeNull();
    expect(parseAppLock({ userId: 1, credentialId: "abc" })).toBeNull();
  });
});

describe("APP_LOCK_PREPAINT_SCRIPT", () => {
  it("is syntactically valid JavaScript", () => {
    expect(() => new Function(APP_LOCK_PREPAINT_SCRIPT)).not.toThrow();
  });
});
