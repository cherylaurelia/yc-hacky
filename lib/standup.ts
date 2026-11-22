import type { Post } from "./board.ts";
import { clip, plural } from "./spoken.ts";

export type Line = { speaker: string; text: string; host?: true };

// "done / merged / blocked" posts are the news. Anything else only speaks if the agent has nothing newsworthy.
const DONE = /\b(?:done|merged|shipped|landed|finished|fixed|pushed|completed|released|deployed)\b/i;
const MAX_AGENTS = 5; // plus the host = 6 voices
const MAX_PICKS = 2;

export const HOST = "Terminal 1";

// Square brackets are audio tags to eleven_v3 ("[laughs]"), so they never reach the model.
const speakable = (s: string) => s.replace(/[[\]]/g, "");

// Whole sentences up to `max` characters (the first one is clipped if it alone is too long), so nothing ends mid-clause.
function shorten(text: string, max: number): string {
  let out = "";
  for (const s of text.match(/[^.!?]+(?:[.!?]+|$)\s*/g) ?? [text]) {
    if ((out + s).trim().length > max) break;
    out += s;
  }
  // Links are already stripped from the text, so drop the "see" or "via" that pointed at one.
  const clean = (out.trim() || clip(text, max)).replace(/,?\s+(?:see|at|via)\s*(?=[.,;!?]|$)/gi, "");
  return /[!?]$/.test(clean) ? clean : `${clean.replace(/\.+$/, "")}.`;
}

// Deterministic script, no LLM. About 900 characters is about 60 seconds of speech and fits the
// 2,000 character dialogue limit: each of up to 5 agents says its 1-2 latest done or blocked posts.
// `posts` is oldest first. Returns null when nobody posted.
export function standupScript(posts: Post[], hours: number): Line[] | null {
  const by = new Map<string, Post[]>();
  for (const p of posts) by.set(p.agent, [...(by.get(p.agent) ?? []), p]);
  if (!by.size) return null;

  const agents = [...by]
    .sort((a, b) => b[1].at(-1)!.id - a[1].at(-1)!.id)
    .slice(0, MAX_AGENTS)
    .map(([agent, ps]) => {
      const news = ps.filter((p) => p.blocked || DONE.test(p.text));
      const picks = (news.length ? news : ps).slice(-MAX_PICKS);
      const per = picks.length > 1 ? 80 : 160;
      const said = picks.map((p) => shorten(p.text, per)).join(" ");
      return { agent, said: speakable(`${agent} here. ${said}`), blocked: picks.some((p) => p.blocked) };
    });

  const span = hours === 1 ? "hour" : `${hours} hours`;
  const blocked = agents.filter((a) => a.blocked).length;
  return [
    { speaker: HOST, host: true, text: `Standup for the last ${span}. ${plural(agents.length, "agent")} reported${blocked ? `, ${blocked} blocked` : ""}.` },
    ...agents.map((a) => ({ speaker: a.agent, text: a.said })),
    { speaker: HOST, host: true, text: "That is the standup." },
  ];
}
