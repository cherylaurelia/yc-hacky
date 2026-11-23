"use client";

import { type FormEvent, useState } from "react";
import { appLicense, saveLicenseKey } from "@/lib/license-client";

// Shown when a route answers 402: what the server said, then a way to enter a license key or buy one.
export default function LicensePrompt({ message, onActivated }: { message: string; onActivated: () => void }) {
  const [form, setForm] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function activate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/license", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `Could not check that key (HTTP ${res.status}).`);
      saveLicenseKey(key.trim());
      onActivated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check that key.");
      setBusy(false);
    }
  }

  return (
    <div role="alert" className="flex max-w-md flex-col items-center gap-2 text-center text-[13px]">
      <p className="text-balance text-stop">{message}</p>
      {form && !appLicense() ? (
        <form onSubmit={activate} className="flex items-center gap-2">
          <input
            aria-label="License key"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="License key"
            className="h-9 w-56 rounded-full border border-line bg-paper px-4 text-ink outline-none placeholder:text-faint focus:border-ink/40"
          />
          <button type="submit" disabled={busy || !key.trim()} className="h-9 rounded-full bg-ink px-4 font-semibold text-paper hover:bg-ink/90 disabled:opacity-50">
            {busy ? "Checking…" : "Activate"}
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-3 font-semibold">
          {appLicense() ? <span className="font-normal text-soft">Change it in the menu bar app under Settings, License.</span> : <button type="button" onClick={() => setForm(true)} className="underline underline-offset-4">Enter license</button>}
          <a href="/pricing" target="_blank" rel="noreferrer" className="underline underline-offset-4">
            See pricing
          </a>
        </div>
      )}
      {error && <p className="text-balance text-stop">{error}</p>}
    </div>
  );
}
