// Fingerprint app lock for the installed PWA.
//
// A client-side screen lock — a shoulder-surfing / borrowed-phone shield in
// the same spirit as privacy mode, NOT a security boundary: the 30-day session
// cookie stays valid underneath and nothing is verified server-side. WebAuthn
// with the platform authenticator (`userVerification: "required"`) is the only
// way a PWA can reach the fingerprint sensor; the authenticator checks the
// finger on-device, so unlocking works offline too.
//
// Only engages in the installed app (standalone display mode) — a normal
// browser tab never locks and hides the setting.
//
// Module scope must stay free of browser globals: app/layout.tsx (a server
// component) imports APP_LOCK_PREPAINT_SCRIPT from here.

/** localStorage key owned by PreferencesContext (the lock config lives in it). */
export const PREFERENCES_STORAGE_KEY = "app-preferences";

/**
 * sessionStorage key: epoch ms when the app was last seen *unlocked* — written
 * on unlock and whenever the page is hidden while unlocked. A cold launch has
 * fresh sessionStorage, so it always locks; a reload or a quick app switch
 * stays within the grace window.
 */
export const LAST_ACTIVE_KEY = "app-lock-last-active";

/** How long the app may sit in the background before it re-locks. */
export const LOCK_GRACE_MS = 5 * 60_000;

export interface AppLockConfig {
  userId: string;
  credentialId: string;
}

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(str: string): Uint8Array<ArrayBuffer> {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * authenticatorData layout: rpIdHash (32 bytes) · flags (1 byte) · signCount
 * (4 bytes) · … — the UV ("user verified") flag is bit 2 of the flags byte.
 */
export function hasUserVerifiedFlag(authData: ArrayBuffer | Uint8Array): boolean {
  const bytes = authData instanceof Uint8Array ? authData : new Uint8Array(authData);
  return bytes.length >= 37 && (bytes[32] & 0x04) !== 0;
}

/**
 * Whether the app should be locked given when it was last seen unlocked.
 * Unknown (cold launch) and clock-went-backwards both lock — fail closed.
 */
export function shouldRelock(lastActive: number | null, now: number, graceMs = LOCK_GRACE_MS): boolean {
  if (lastActive === null || !Number.isFinite(lastActive)) return true;
  const elapsed = now - lastActive;
  return elapsed < 0 || elapsed >= graceMs;
}

export function parseAppLock(value: unknown): AppLockConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const { userId, credentialId } = value as Record<string, unknown>;
  if (typeof userId !== "string" || !userId) return null;
  if (typeof credentialId !== "string" || !credentialId) return null;
  return { userId, credentialId };
}

// ─── Pre-paint gate ─────────────────────────────────────────────────────────

/**
 * Inlined into <head> by app/layout.tsx. SSR can't see localStorage, so this
 * runs before first paint and sets `data-locked` on <html>; globals.css hides
 * the app shell while it's present. Mirrors isInstalledApp + shouldRelock.
 */
export const APP_LOCK_PREPAINT_SCRIPT = `(function(){try{
var s=(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches)||navigator.standalone===true;
if(!s)return;
var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFERENCES_STORAGE_KEY)})||"null");
if(!p||!p.appLock||!p.appLock.credentialId)return;
var raw=sessionStorage.getItem(${JSON.stringify(LAST_ACTIVE_KEY)});
var t=raw===null?NaN:Number(raw),e=Date.now()-t;
if(isFinite(t)&&e>=0&&e<${LOCK_GRACE_MS})return;
document.documentElement.setAttribute("data-locked","");
}catch(_){}})();`;

// ─── Browser helpers ────────────────────────────────────────────────────────

/** True in the installed PWA (Android/desktop standalone, iOS home-screen). */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export async function isPlatformAuthAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function readLastActive(): number | null {
  try {
    const raw = sessionStorage.getItem(LAST_ACTIVE_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function markActive(now = Date.now()): void {
  try {
    sessionStorage.setItem(LAST_ACTIVE_KEY, String(now));
  } catch {
    // sessionStorage unavailable — the app just re-locks on next reload.
  }
}

export function clearActive(): void {
  try {
    sessionStorage.removeItem(LAST_ACTIVE_KEY);
  } catch {
    // ignore
  }
}

function randomChallenge(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Registers a platform credential that requires user verification and returns
 * its base64url id. Nothing is sent to the server — the challenge is random
 * because there is no relying-party verification step in a client-side lock.
 */
export async function enrollFingerprint(userId: string, name: string): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "Expense Tracker", id: location.hostname },
      user: { id: new TextEncoder().encode(userId), name, displayName: name },
      challenge: randomChallenge(),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "discouraged",
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Fingerprint setup was cancelled");
  return toBase64Url(cred.rawId);
}

/**
 * Prompts for the fingerprint against the enrolled credential. Resolves true
 * only when an assertion comes back with the UV flag set; false when the user
 * cancels or the authenticator refuses.
 */
export async function verifyFingerprint(credentialId: string): Promise<boolean> {
  try {
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        rpId: location.hostname,
        allowCredentials: [{ type: "public-key", id: fromBase64Url(credentialId), transports: ["internal"] }],
        userVerification: "required",
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    const response = cred.response as AuthenticatorAssertionResponse;
    return hasUserVerifiedFlag(response.authenticatorData);
  } catch {
    return false;
  }
}
