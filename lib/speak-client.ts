import { clip, plain } from "./spoken.ts";

let current: HTMLAudioElement | null = null;

// Browser helper: speak one board post in its poster's voice. Resolves when playback ends
// (or a newer speakPost call cuts it off); rejects with a sentence you can show the user.
export async function speakPost(poster: string, text: string): Promise<void> {
  const res = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ poster, text: clip(plain(text), 500) }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `Could not speak that (HTTP ${res.status}).`);
  }
  const url = URL.createObjectURL(await res.blob());
  current?.pause();
  const audio = (current = new Audio(url));
  try {
    await new Promise<void>((resolve, reject) => {
      audio.onended = audio.onpause = () => resolve();
      audio.onerror = () => reject(new Error("Could not play the audio."));
      audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
