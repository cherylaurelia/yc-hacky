// Browser side of licensing: where the page keeps its key and how it sends it (see lib/license.ts for the server).
declare global {
  interface Window {
    __T1_LICENSE__?: string;
    __T1_INSTANCE__?: string;
  }
}

const KEY = "terminal1.license";
const INSTANCE = "terminal1.instance";

// Thrown when a route answers 402, so the page can offer a license prompt instead of a generic error.
export class LicenseError extends Error {}

// Inside the Mac app, the key and activation (instance) id it injected win; Settings > License there changes them.
export const appLicense = (): string => (typeof window !== "undefined" && typeof window.__T1_LICENSE__ === "string" ? window.__T1_LICENSE__ : "");
const appInstance = (): string => (typeof window !== "undefined" && typeof window.__T1_INSTANCE__ === "string" ? window.__T1_INSTANCE__ : "");

function saved(name: string): string {
  try {
    return localStorage.getItem(name) ?? "";
  } catch (e) {
    console.warn("Could not read the saved license:", e);
    return "";
  }
}

export const licenseKey = (): string => appLicense() || saved(KEY);

// An instance id belongs to the key it was issued for, so the app's key is never paired with one the browser saved.
export const licenseInstance = (): string => (appLicense() ? appInstance() : saved(INSTANCE));

export function saveLicense(key: string, instanceId: string): void {
  try {
    localStorage.setItem(KEY, key);
    localStorage.setItem(INSTANCE, instanceId);
  } catch (e) {
    console.warn("Could not save the license:", e);
  }
}

// Spread into a fetch's headers for the four routes that spend ElevenLabs credits. The server wants the key and its activation.
export function licenseHeaders(): Record<string, string> {
  const key = licenseKey();
  if (!key) return {};
  const instance = licenseInstance();
  return instance ? { "x-terminal1-license": key, "x-terminal1-instance": instance } : { "x-terminal1-license": key };
}

export const httpError = (status: number, message: string): Error => (status === 402 ? new LicenseError(message) : new Error(message));
