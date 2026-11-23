// Browser side of licensing: where the page keeps its key and how it sends it (see lib/license.ts for the server).
declare global {
  interface Window {
    __T1_LICENSE__?: string;
  }
}

const KEY = "terminal1.license";

// Thrown when a route answers 402, so the page can offer a license prompt instead of a generic error.
export class LicenseError extends Error {}

// Inside the Mac app, the key it injected wins; Settings > License there changes it.
export const appLicense = (): string => (typeof window !== "undefined" && typeof window.__T1_LICENSE__ === "string" ? window.__T1_LICENSE__ : "");

export function licenseKey(): string {
  const fromApp = appLicense();
  if (fromApp) return fromApp;
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch (e) {
    console.warn("Could not read the saved license:", e);
    return "";
  }
}

export function saveLicenseKey(key: string): void {
  try {
    localStorage.setItem(KEY, key);
  } catch (e) {
    console.warn("Could not save the license:", e);
  }
}

// Spread into a fetch's headers for the four routes that spend ElevenLabs credits.
export function licenseHeaders(): Record<string, string> {
  const key = licenseKey();
  return key ? { "x-terminal1-license": key } : {};
}

export const httpError = (status: number, message: string): Error => (status === 402 ? new LicenseError(message) : new Error(message));
