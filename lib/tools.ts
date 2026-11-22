import { boardDigest, boardPost } from "./board-api";
import { gh, GhError } from "./github";
import { ago, clip, plain, plural } from "./spoken";
import { TOOL_SPECS, type ServerToolName, type ToolName } from "./tool-specs";

export type Ctx = { repo: string; token?: string };
export type Args = Record<string, string | number | undefined>;
type Handler = (ctx: Ctx, args: Args) => Promise<string>;

type User = { login: string; type?: string } | null;
type Item = {
  number: number;
  title: string;
  state: string;
  body: string | null;
  user: User;
  created_at: string;
  closed_at: string | null;
  comments: number;
  labels: ({ name: string } | string)[];
  assignees?: { login: string }[];
  pull_request?: unknown;
};
type Pull = { number: number; title: string; user: User; created_at: string; merged_at: string | null };
type Commit = { commit: { message: string; author: { name: string; date: string } }; author: User };

// ---------- spoken-text helpers ----------

const who = (u: User | undefined) => u?.login ?? "someone";

const line = (i: { number: number; title: string; user: User }) => `number ${i.number}, ${clip(i.title, 70)}, by ${who(i.user)}`;
const num = (v: unknown, d: number, lo: number, hi: number) =>
  typeof v === "number" ? Math.min(hi, Math.max(lo, Math.trunc(v))) : d;
const str = (v: unknown) => (typeof v === "string" ? v : "");

const FOOTER = "\n\n_Sent by voice with Repo Coworker._";

// ---------- handlers (one per spec name; the type enforces it) ----------

export const HANDLERS: Record<ServerToolName, Handler> = {
  async repo_overview({ repo, token }) {
    const [r, langs, prs, readme] = await Promise.all([
      gh<{ name: string; private: boolean; description: string | null; default_branch: string; open_issues_count: number }>(`/repos/${repo}`, { token }),
      gh<Record<string, number>>(`/repos/${repo}/languages`, { token }).catch(() => ({}) as Record<string, number>),
      gh<{ total_count: number }>(`/search/issues?q=${encodeURIComponent(`repo:${repo} type:pr state:open`)}&per_page=1`, { token }).catch(() => null),
      gh<{ content: string }>(`/repos/${repo}/readme`, { token }).catch(() => null),
    ]);
    const parts = [`${r.name}${r.private ? ", a private repo" : ""}: ${(r.description ?? "no description").replace(/[.\s]+$/, "")}.`, `Default branch is ${r.default_branch}.`];
    if (prs) parts.push(`${plural(r.open_issues_count - prs.total_count, "open issue")} and ${plural(prs.total_count, "open pull request")}.`);
    else parts.push(`${plural(r.open_issues_count, "open issue and pull request")} combined.`);
    const top = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l]) => l);
    if (top.length) parts.push(`Main languages: ${top.join(", ")}.`);
    if (readme?.content) {
      const text = plain(Buffer.from(readme.content, "base64").toString("utf8"));
      if (text) parts.push(`README starts: ${clip(text, 800)}`);
    }
    return parts.join(" ");
  },

  async recent_activity({ repo, token }, args) {
    const hours = num(args.hours, 24, 1, 720);
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    const [commits, pulls, issues] = await Promise.all([
      gh<Commit[]>(`/repos/${repo}/commits?since=${since}&per_page=50`, { token }),
      gh<Pull[]>(`/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=50`, { token }),
      gh<Item[]>(`/repos/${repo}/issues?state=all&since=${since}&per_page=50`, { token }),
    ]);
    const window = hours < 48 ? plural(hours, "hour") : plural(Math.round(hours / 24), "day");
    const out: string[] = [];

    if (commits.length) {
      const by = new Map<string, number>();
      for (const c of commits) {
        const a = c.author?.login ?? c.commit.author.name;
        by.set(a, (by.get(a) ?? 0) + 1);
      }
      const who_ = [...by].sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(", ");
      const latest = commits.slice(0, 4).map((c) => `${clip(c.commit.message.split("\n")[0], 70)} by ${c.author?.login ?? c.commit.author.name}, ${ago(c.commit.author.date)}`);
      out.push(`${plural(commits.length, "commit")} on the default branch (${who_}). Latest: ${latest.join("; ")}.`);
    }
    const opened = pulls.filter((p) => p.created_at >= since);
    const merged = pulls.filter((p) => p.merged_at && p.merged_at >= since);
    if (opened.length) out.push(`${plural(opened.length, "pull request")} opened: ${opened.slice(0, 4).map(line).join("; ")}.`);
    if (merged.length) out.push(`${plural(merged.length, "pull request")} merged: ${merged.slice(0, 4).map(line).join("; ")}.`);
    const real = issues.filter((i) => !i.pull_request);
    const iOpened = real.filter((i) => i.created_at >= since);
    const iClosed = real.filter((i) => i.closed_at && i.closed_at >= since);
    if (iOpened.length) out.push(`${plural(iOpened.length, "issue")} opened: ${iOpened.slice(0, 4).map(line).join("; ")}.`);
    if (iClosed.length) out.push(`${plural(iClosed.length, "issue")} closed: ${iClosed.slice(0, 4).map(line).join("; ")}.`);

    return clip(out.length ? `In the last ${window}: ${out.join(" ")}` : `Nothing happened in the last ${window}: no commits, pull requests or issue changes.`, 1200);
  },

  async list_items({ repo, token }, args) {
    const kind = args.kind === "issue" || args.kind === "pr" ? args.kind : "all";
    const state = args.state === "closed" ? "closed" : "open";
    const limit = num(args.limit, 8, 1, 20);
    const q = new URLSearchParams({ state, per_page: "100" });
    const assignee = str(args.assignee).replace(/^@/, "");
    if (assignee) q.set("assignee", assignee);
    if (str(args.label)) q.set("labels", str(args.label));
    const page = await gh<Item[]>(`/repos/${repo}/issues?${q}`, { token });
    const items = page.filter((i) => kind === "all" || (kind === "pr") === !!i.pull_request);
    const [one, many] = kind === "pr" ? ["pull request", "pull requests"] : kind === "issue" ? ["issue", "issues"] : ["issue or pull request", "issues or pull requests"];
    if (!items.length) return `No ${state} ${many} match.`;
    const rows = items.slice(0, limit).map((i) => `${line(i)}${kind === "all" ? (i.pull_request ? " (pull request)" : " (issue)") : ""}, ${ago(i.created_at)}`);
    return clip(`${page.length >= 100 ? `Showing the newest ${Math.min(limit, items.length)}` : items.length > limit ? `Showing ${limit} of ${items.length}` : `${items.length}`} ${state} ${items.length === 1 ? one : many}. ${rows.join("; ")}.`, 1200);
  },

  async read_item({ repo, token }, args) {
    const n = num(args.number, 0, 1, 1e9);
    const item = await gh<Item>(`/repos/${repo}/issues/${n}`, { token });
    const isPr = !!item.pull_request;
    const [pr, comments] = await Promise.all([
      isPr ? gh<{ merged: boolean; draft: boolean; changed_files: number; additions: number; deletions: number }>(`/repos/${repo}/pulls/${n}`, { token }) : null,
      item.comments > 0 ? gh<{ user: User; body: string; created_at: string }[]>(`/repos/${repo}/issues/${n}/comments?per_page=100`, { token }) : [],
    ]);
    const state = pr?.merged ? "merged" : pr?.draft ? "an open draft" : item.state;
    const labels = item.labels.map((l) => (typeof l === "string" ? l : l.name));
    const parts = [`${isPr ? "Pull request" : "Issue"} number ${n}: ${item.title}.`, `It is ${state}, opened by ${who(item.user)} ${ago(item.created_at)}.`];
    if (labels.length) parts.push(`Labels: ${labels.join(", ")}.`);
    if (item.assignees?.length) parts.push(`Assigned to ${item.assignees.map((a) => a.login).join(", ")}.`);
    if (pr) parts.push(`${plural(pr.changed_files, "file")} changed, ${pr.additions} lines added and ${pr.deletions} removed.`);
    const body = plain(item.body ?? "");
    parts.push(body ? `Description: ${clip(body, 450)}` : "No description.");
    const last = (comments ?? []).filter((c) => c.user?.type !== "Bot").slice(-3);
    if (last.length) parts.push(`${plural(item.comments, "comment")}. Latest: ${last.map((c) => `${who(c.user)}, ${ago(c.created_at)}: ${clip(plain(c.body), 150)}`).join(" | ")}`);
    else parts.push("No comments.");
    return clip(parts.join(" "), 1300);
  },

  async search_code({ repo, token }, args) {
    if (!token) throw new GhError("Code search needs a GitHub token on the server.", 502);
    const query = str(args.query).replace(/\b(?:repo|org|user):\S+/gi, " ").trim().slice(0, 200);
    if (!query) throw new GhError("I need something to search for.", 400);
    const r = await gh<{ total_count: number; items: { path: string }[] }>(
      `/search/code?q=${encodeURIComponent(`${query} repo:${repo}`)}&per_page=5`,
      { token },
    );
    if (!r.items.length) return `No code matches for ${query}.`;
    return `${plural(r.total_count, "file")} match ${query}. Top results: ${r.items.map((i) => i.path).join(", ")}.`;
  },

  async read_file({ repo, token }, args) {
    const path = str(args.path).replace(/^\/+/, "").replace(/\/+$/, "");
    if (!path || path.split("/").some((s) => s === ".." || s === ".")) throw new GhError("That is not a valid file path.", 400);
    const f = await gh<{ type?: string; size: number; encoding?: string; content?: string } | { name: string; type: string }[]>(
      `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
      { token },
    );
    if (Array.isArray(f)) {
      const names = f.slice(0, 40).map((e) => (e.type === "dir" ? `${e.name} folder` : e.name));
      return `${path} is a folder with ${plural(f.length, "entry")}: ${names.join(", ")}.`;
    }
    if (f.encoding !== "base64" || !f.content) return `${path} is too large or is not a plain file, so I cannot read it.`;
    const text = Buffer.from(f.content, "base64").toString("utf8");
    if (text.includes("\0")) return `${path} looks like a binary file.`;
    return `${path}, ${plural(f.size, "byte")}:\n${text.length > 2500 ? `${text.slice(0, 2500)}\n...(truncated)` : text}`;
  },

  async create_issue({ repo, token }, args) {
    const title = str(args.title).slice(0, 200);
    const assignees = str(args.assignees).split(",").map((a) => a.trim().replace(/^@/, "")).filter(Boolean);
    const i = await gh<{ number: number }>(`/repos/${repo}/issues`, {
      token,
      method: "POST",
      body: { title, body: str(args.body) + FOOTER, ...(assignees.length ? { assignees } : {}) },
    });
    return `Created issue number ${i.number}: ${title}.`;
  },

  async add_comment({ repo, token }, args) {
    const n = num(args.number, 0, 1, 1e9);
    await gh(`/repos/${repo}/issues/${n}/comments`, { token, method: "POST", body: { body: str(args.body) + FOOTER } });
    return `Added your comment to number ${n}.`;
  },

  async board_digest({ repo, token }, args) {
    return boardDigest(repo, token, num(args.board, 0, 0, 1e9) || undefined, num(args.since_minutes, 60, 1, 1440));
  },

  async board_post({ repo, token }, args) {
    const text = str(args.text);
    const to = str(args.to).replace(/^@/, "");
    if (to && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(to)) throw new GhError("That is not a GitHub username.", 400);
    return boardPost(repo, token, num(args.board, 0, 0, 1e9) || undefined, text, to);
  },

  // The hooks/coworker-hook.sh poller waits for "req <id> allow|deny|stop" from the gh user.
  async answer_request({ repo, token }, args) {
    const id = str(args.request_id).replace(/^req\s+/i, "").toLowerCase();
    if (!/^[0-9a-f]{4,12}$/.test(id)) throw new GhError("That is not a request id.", 400);
    const decision = args.decision === "deny" || args.decision === "stop" ? args.decision : "allow";
    const note = str(args.note).replace(/\s+/g, " ").slice(0, 300);
    await boardPost(repo, token, num(args.board, 0, 0, 1e9) || undefined, `req ${id} ${decision}${note ? ` ${note}` : ""}`, "");
    return `Sent ${decision} for request ${id}.`;
  },
};

// ---------- argument validation (boundary) ----------

type Prop = { type: "string" | "integer"; enum?: readonly string[] };
const SPECS = new Map(TOOL_SPECS.map((s) => [s.name as string, s]));

export const isToolName = (n: string): n is ServerToolName => SPECS.has(n) && !("local" in SPECS.get(n)!);
export const isWriteTool = (n: ToolName) => SPECS.get(n)!.write;

export function validateArgs(name: ToolName, raw: unknown): { ok: true; args: Args } | { ok: false; error: string } {
  if (raw !== undefined && (typeof raw !== "object" || raw === null || Array.isArray(raw))) return { ok: false, error: "args must be an object." };
  const given = (raw ?? {}) as Record<string, unknown>;
  const p = SPECS.get(name)!.parameters as { required?: readonly string[]; properties: Record<string, Prop> };
  const args: Args = {};
  for (const [key, prop] of Object.entries(p.properties)) {
    let v = given[key];
    if (typeof v === "string") v = v.trim();
    if (v === undefined || v === null || v === "") {
      if (p.required?.includes(key)) return { ok: false, error: `I need a value for ${key}.` };
      continue;
    }
    if (prop.type === "integer") {
      const n = typeof v === "string" ? Number(v) : v;
      if (typeof n !== "number" || !Number.isInteger(n)) return { ok: false, error: `${key} must be a whole number.` };
      args[key] = n;
    } else {
      if (typeof v !== "string") return { ok: false, error: `${key} must be text.` };
      if (prop.enum && !prop.enum.includes(v)) return { ok: false, error: `${key} must be one of ${prop.enum.join(", ")}.` };
      args[key] = v;
    }
  }
  return { ok: true, args };
}
