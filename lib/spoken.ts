// Spoken-text helpers shared by the tool handlers and the board digest.
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(s / 3600);
  if (h < 36) return `${plural(h, "hour")} ago`;
  const d = Math.round(s / 86400);
  if (d < 60) return `${plural(d, "day")} ago`;
  return d < 730 ? `${Math.round(d / 30)} months ago` : `${Math.round(d / 365)} years ago`;
}

// A board post as the poster's own voice says it: the request id is for the board, not for the ear.
export const aloud = (text: string) => text.replace(/\s*\(req [0-9a-f]{4,12}\)/gi, "");

// What the poster's voice plays before Terminal 1 asks: the first sentence only, so an alert stays a few seconds.
export const headline = (text: string) => clip(aloud(text).match(/^.*?[.!?](?=\s|$)/)?.[0] ?? aloud(text), 110);

export function plain(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b[\w-]+(?:\.[\w-]+)+\/\S*/g, " ")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+>]\s+/gm, "")
    .replace(/\*\*|__|[*`~|]/g, "")
    .replace(/(^|\s)_+(?=\S)|(?<=\S)_+(?=\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).trimEnd() + "...";
}
