import { httpError, licenseHeaders } from "./license-client.ts";
import { clip, plain } from "./spoken.ts";

// One audio element for every board post. Safari only lets a page play sound from code after the
// user has played something on that element, so unlockAudio() plays a silent clip inside the
// user's first click or key press and every later post reuses the element.
let el: HTMLAudioElement | null = null;
let cut: (() => void) | null = null;
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

export function unlockAudio(): void {
  if (el) return;
  const a = new Audio(SILENCE);
  a.play().then(
    () => (el = a),
    () => {}, // no gesture yet: the next click or key press tries again
  );
}

// Browser helper: speak one board post in its poster's voice. Resolves when playback ends
// (or a newer speakPost call cuts it off); rejects with a sentence you can show the user,
// as a LicenseError when the plan has no voices.
export async function speakPost(poster: string, text: string): Promise<void> {
  const res = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...licenseHeaders() },
    body: JSON.stringify({ poster, text: clip(plain(text), 500) }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw httpError(res.status, j.error ?? `Could not speak that (HTTP ${res.status}).`);
  }
  const url = URL.createObjectURL(await res.blob());
  cut?.();
  const audio = (el ??= new Audio());
  try {
    await new Promise<void>((resolve, reject) => {
      const off = () => {
        audio.onended = audio.onpause = audio.onerror = null;
        cut = null;
      };
      cut = () => {
        off();
        audio.pause();
        resolve();
      };
      audio.onended = () => (off(), resolve());
      // A cut-off clip's late "pause" event must not end the next one: only a real pause counts.
      audio.onpause = () => audio.paused && (off(), resolve());
      audio.onerror = () => (off(), reject(new Error("Could not play the audio.")));
      audio.src = url;
      audio.play().catch((e) => (off(), reject(e)));
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
